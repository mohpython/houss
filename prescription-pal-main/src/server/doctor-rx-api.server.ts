/**
 * API REST v1 — e-ordonnance médecin pour l'application Flutter.
 *
 * Réutilise exactement les primitives du portail web : même approve gate,
 * même signature HMAC, même PDF, même envoi dans l'espace patient. Aucune
 * logique métier parallèle : ce module n'est qu'une façade HTTP.
 */
import { z } from "zod";
import { prisma } from "./db.server";
import { toDateOnly, toPlain } from "./serialize";
import { addRole, requestMeta, verifyPassword } from "./auth.server";
import { rateLimit } from "./rate-limit.server";
import { createAbsoluteSignedUrl, readObject, saveObject } from "./storage.server";
import {
  dateKey,
  doctorDisplayName,
  doctorStoredName,
  newPrescriptionNumber,
  newVerificationToken,
  patientCode,
  qrPng,
  sha256Hex,
  signPrescription,
  verificationUrl,
  verifyPrescriptionSignature,
} from "./doctor-rx.server";
import { generatePrescriptionPdf } from "./doctor-pdf.server";

const ITEM_SCHEMA = z.object({
  medicineName: z.string().trim().min(1).max(200),
  dosage: z.string().trim().max(120).optional().default(""),
  form: z.string().trim().max(80).optional().default(""),
  quantity: z.string().trim().max(80).optional().default(""),
  posology: z.string().trim().max(300).optional().default(""),
  frequency: z.string().trim().max(120).optional().default(""),
  duration: z.string().trim().max(120).optional().default(""),
  route: z.string().trim().max(80).optional().default(""),
  instructions: z.string().trim().max(400).optional().default(""),
});

export const RX_SAVE_SCHEMA = z.object({
  id: z.string().uuid().optional(),
  patientId: z.string().uuid(),
  consultationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  diagnosis: z.string().trim().max(1000).optional().default(""),
  reason: z.string().trim().max(1000).optional().default(""),
  observations: z.string().trim().max(4000).optional().default(""),
  advice: z.string().trim().max(4000).optional().default(""),
  identityVerified: z.boolean().optional().default(false),
  items: z.array(ITEM_SCHEMA).min(1).max(30),
});

const PRACTITIONER_SELECT = {
  id: true,
  full_name: true,
  specialty_code: true,
  license_number: true,
  phone: true,
  address: true,
  city: true,
  status: true,
  type: true,
  establishment_name: true,
  establishment_address: true,
  establishment_phone: true,
  establishment_email: true,
  signature_note: true,
  approved_at: true,
  practitioner_specialties: { select: { label_fr: true } },
} as const;

type DoctorRow = {
  id: string;
  full_name: string;
  specialty_code: string;
  license_number: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  status: string;
  type: string;
  establishment_name: string | null;
  establishment_address: string | null;
  establishment_phone: string | null;
  establishment_email: string | null;
  signature_note: string | null;
  approved_at: Date | null;
  practitioner_specialties?: { label_fr: string } | null;
};

function profile(row: DoctorRow) {
  return {
    id: row.id,
    full_name: row.full_name,
    specialty: row.practitioner_specialties?.label_fr ?? row.specialty_code,
    license_number: row.license_number,
    phone: row.phone,
    establishment_name: row.establishment_name,
    establishment_address: row.establishment_address,
    establishment_phone: row.establishment_phone,
    signature_note: row.signature_note,
    status: row.status,
    type: row.type,
    approved_at: row.approved_at ? row.approved_at.toISOString() : null,
    display_name: doctorDisplayName(row.full_name),
  };
}

async function loadDoctor(userId: string): Promise<DoctorRow | null> {
  const byUser = (await prisma.practitioners.findUnique({
    where: { user_id: userId },
    select: PRACTITIONER_SELECT,
  })) as DoctorRow | null;
  if (byUser) return byUser;

  const user = await prisma.users.findUnique({ where: { id: userId }, select: { email: true } });
  const email = (user?.email ?? "").trim().toLowerCase();
  if (!email) return null;
  const invited = (await prisma.practitioners.findFirst({
    where: { user_id: null, claim_email: { equals: email, mode: "insensitive" } },
    select: PRACTITIONER_SELECT,
  })) as DoctorRow | null;
  if (!invited) return null;
  await prisma.practitioners.update({
    where: { id: invited.id },
    data: { user_id: userId, claim_email: null },
  });
  if (invited.type === "doctor" || invited.type === "nurse") await addRole(userId, invited.type);
  return invited;
}

async function requireDoctor(userId: string): Promise<DoctorRow> {
  const p = await loadDoctor(userId);
  if (!p) throw new Error("Aucun profil médecin n'est rattaché à ce compte. Contactez l'administrateur SAHA Santé.");
  if (p.type !== "doctor") throw new Error("Cet espace est réservé aux médecins.");
  if (p.status !== "approved") {
    throw new Error("Votre compte médecin n'est pas encore validé par un administrateur.");
  }
  return p;
}

async function audit(
  rxId: string,
  actorUserId: string,
  action: string,
  meta: Record<string, unknown> = {},
  request?: Request,
) {
  const { ip, userAgent } = requestMeta(request ?? null);
  await prisma.doctor_prescription_events.create({
    data: {
      doctor_prescription_id: rxId,
      actor_user_id: actorUserId,
      action,
      meta: meta as never,
      ip,
      user_agent: userAgent,
    },
  });
}

async function ownedRx(doctorId: string, id: string) {
  const rx = await prisma.doctor_prescriptions.findFirst({
    where: { id, doctor_id: doctorId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!rx) throw new Error("Ordonnance introuvable");
  return rx;
}

async function ensurePdf(rx: Awaited<ReturnType<typeof ownedRx>>, force = false) {
  const key = `doctor-rx/${rx.id}-v${rx.version}.pdf`;
  if (!force && rx.pdf_path === key && rx.pdf_sha256) {
    return { key, sha256: rx.pdf_sha256 };
  }
  const qr = await qrPng(rx.verification_token);
  const bytes = await generatePrescriptionPdf({
    rx: { ...rx, doctor_name: doctorDisplayName(rx.doctor_name) },
    items: rx.items,
    qrPng: qr,
    verifyUrl: verificationUrl(rx.verification_token),
  });
  await saveObject("prescriptions", key, bytes);
  const sha256 = sha256Hex(bytes);
  await prisma.doctor_prescriptions.update({
    where: { id: rx.id },
    data: { pdf_path: key, pdf_sha256: sha256 },
  });
  return { key, sha256 };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function rxSession(userId: string) {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, email: true, phone: true, profile: { select: { full_name: true } } },
  });
  if (!user) throw new Error("Compte introuvable");
  const row = await loadDoctor(userId);
  let access: "ok" | "missing" | "pending" | "rejected" | "not_doctor" = "missing";
  if (row) {
    if (row.type !== "doctor") access = "not_doctor";
    else if (row.status === "approved") access = "ok";
    else if (row.status === "rejected") access = "rejected";
    else access = "pending";
  }
  return {
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.profile?.full_name ?? null,
    },
    practitioner: row ? profile(row) : null,
    access,
  };
}

export async function rxDashboard(userId: string) {
  const doctor = await requireDoctor(userId);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [drafts, signed, sent, total, today, patients, recent, templates] = await Promise.all([
    prisma.doctor_prescriptions.count({ where: { doctor_id: doctor.id, status: "draft" } }),
    prisma.doctor_prescriptions.count({ where: { doctor_id: doctor.id, status: "signed" } }),
    prisma.doctor_prescriptions.count({ where: { doctor_id: doctor.id, status: "sent" } }),
    prisma.doctor_prescriptions.count({ where: { doctor_id: doctor.id } }),
    prisma.doctor_prescriptions.count({
      where: { doctor_id: doctor.id, created_at: { gte: startOfDay } },
    }),
    prisma.doctor_prescriptions.findMany({
      where: { doctor_id: doctor.id },
      select: { patient_id: true },
      distinct: ["patient_id"],
    }),
    prisma.doctor_prescriptions.findMany({
      where: { doctor_id: doctor.id },
      orderBy: { created_at: "desc" },
      take: 20,
      select: {
        id: true,
        number: true,
        status: true,
        patient_name: true,
        diagnosis: true,
        consultation_date: true,
        created_at: true,
        sent_at: true,
      },
    }),
    prisma.doctor_rx_templates.count({ where: { doctor_id: doctor.id } }),
  ]);
  return {
    me: profile(doctor),
    counts: { drafts, signed, sent, total, today, patients: patients.length, templates },
    recent: toPlain(recent),
  };
}

function patientShape(u: {
  id: string;
  email: string | null;
  phone: string | null;
  profile: {
    full_name: string | null;
    phone: string | null;
    date_of_birth: Date | null;
    sex: string | null;
    address: string | null;
  } | null;
  lastVisit?: Date | null;
  prescriptions?: number;
}) {
  return {
    id: u.id,
    fullName: u.profile?.full_name?.trim() || u.email || u.phone || "Patient SAHA",
    email: u.email,
    phone: u.profile?.phone || u.phone,
    birthDate: u.profile?.date_of_birth ? dateKey(u.profile.date_of_birth) : null,
    sex: u.profile?.sex ?? null,
    address: u.profile?.address ?? null,
    sahaCode: patientCode(u.id),
    lastVisit: u.lastVisit ? u.lastVisit.toISOString() : null,
    prescriptions: u.prescriptions ?? 0,
  };
}

const PATIENT_SELECT = {
  id: true,
  email: true,
  phone: true,
  profile: {
    select: {
      full_name: true,
      phone: true,
      date_of_birth: true,
      sex: true,
      address: true,
    },
  },
} as const;

export async function rxSearchPatients(userId: string, query: string) {
  const doctor = await requireDoctor(userId);
  const q = query.trim();
  const digits = q.replace(/[^\d]/g, "");
  const or: Record<string, unknown>[] = [
    { email: { contains: q, mode: "insensitive" } },
    { phone: { contains: q } },
    { profile: { is: { full_name: { contains: q, mode: "insensitive" } } } },
    { profile: { is: { phone: { contains: q } } } },
  ];
  if (digits.length >= 6) or.push({ phone: { contains: digits } });
  const users = await prisma.users.findMany({
    where: { OR: or as never, id: { not: userId } },
    select: PATIENT_SELECT,
    orderBy: { created_at: "desc" },
    take: 15,
  });
  if (users.length === 0) return [];
  const history = await prisma.doctor_prescriptions.groupBy({
    by: ["patient_id"],
    where: { doctor_id: doctor.id, patient_id: { in: users.map((u) => u.id) } },
    _count: { _all: true },
    _max: { created_at: true },
  });
  const byId = new Map(history.map((h) => [h.patient_id, h]));
  return users.map((u) => {
    const h = byId.get(u.id);
    return patientShape({ ...u, lastVisit: h?._max.created_at, prescriptions: h?._count._all ?? 0 });
  });
}

export async function rxListPatients(userId: string) {
  const doctor = await requireDoctor(userId);
  const grouped = await prisma.doctor_prescriptions.groupBy({
    by: ["patient_id"],
    where: { doctor_id: doctor.id },
    _count: { _all: true },
    _max: { created_at: true },
    orderBy: { _max: { created_at: "desc" } },
    take: 60,
  });
  if (grouped.length === 0) return [];
  const users = await prisma.users.findMany({
    where: { id: { in: grouped.map((g) => g.patient_id) } },
    select: PATIENT_SELECT,
  });
  const byId = new Map(grouped.map((g) => [g.patient_id, g]));
  return users.flatMap((u) => {
    const g = byId.get(u.id);
    if (!g) return [];
    return [patientShape({ ...u, lastVisit: g._max.created_at, prescriptions: g._count._all })];
  });
}

export async function rxGetPatient(userId: string, patientId: string) {
  await requireDoctor(userId);
  const user = await prisma.users.findUnique({
    where: { id: patientId },
    select: PATIENT_SELECT,
  });
  if (!user) throw new Error("Patient introuvable");
  return patientShape(user);
}

export async function rxList(
  userId: string,
  status:
    | "all"
    | "draft"
    | "signed"
    | "sent"
    | "viewed"
    | "cancelled"
    | "amended" = "all",
  query = "",
) {
  const doctor = await requireDoctor(userId);
  const q = query.trim();
  const rows = await prisma.doctor_prescriptions.findMany({
    where: {
      doctor_id: doctor.id,
      ...(status !== "all" ? { status } : {}),
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" as const } },
              { patient_name: { contains: q, mode: "insensitive" as const } },
              { diagnosis: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { created_at: "desc" },
    take: 100,
    select: {
      id: true,
      number: true,
      status: true,
      patient_id: true,
      patient_name: true,
      patient_phone: true,
      diagnosis: true,
      consultation_date: true,
      signed_at: true,
      sent_at: true,
      created_at: true,
      version: true,
      _count: { select: { items: true } },
    },
  });
  return toPlain(rows);
}

export async function rxGet(userId: string, id: string) {
  const doctor = await requireDoctor(userId);
  const rx = await prisma.doctor_prescriptions.findFirst({
    where: { id, doctor_id: doctor.id },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!rx) throw new Error("Ordonnance introuvable");
  return toPlain({
    ...rx,
    sahaCode: patientCode(rx.patient_id),
    verifyUrl: verificationUrl(rx.verification_token),
    me: profile(doctor),
  });
}

export async function rxSave(userId: string, input: z.output<typeof RX_SAVE_SCHEMA>, request: Request) {
  const doctor = await requireDoctor(userId);
  const patient = await prisma.users.findUnique({
    where: { id: input.patientId },
    select: {
      id: true,
      email: true,
      phone: true,
      profile: {
        select: {
          full_name: true,
          phone: true,
          date_of_birth: true,
          sex: true,
        },
      },
    },
  });
  if (!patient) throw new Error("Patient introuvable");
  if (patient.id === userId) {
    throw new Error("Vous ne pouvez pas rédiger une ordonnance pour votre propre compte.");
  }
  const patientName =
    patient.profile?.full_name?.trim() || patient.email || patient.phone || "Patient SAHA";
  const common = {
    consultation_date: toDateOnly(input.consultationDate)!,
    diagnosis: input.diagnosis || null,
    reason: input.reason || null,
    observations: input.observations || null,
    advice: input.advice || null,
    patient_name: patientName,
    patient_phone: patient.profile?.phone || patient.phone,
    patient_email: patient.email,
    patient_birth_date: patient.profile?.date_of_birth ?? null,
    patient_sex: patient.profile?.sex ?? null,
    establishment_name:
      doctor.establishment_name?.trim() ||
      (doctor.city ? `Cabinet médical — ${doctor.city}` : "Cabinet médical SAHA"),
    establishment_address: doctor.establishment_address?.trim() || doctor.address?.trim() || null,
    establishment_phone: doctor.establishment_phone?.trim() || doctor.phone?.trim() || null,
    doctor_name: doctorStoredName(doctor.full_name),
    doctor_specialty: doctor.practitioner_specialties?.label_fr ?? doctor.specialty_code,
    doctor_license: doctor.license_number,
    identity_verified: input.identityVerified,
    identity_verified_at: input.identityVerified ? new Date() : null,
  };
  const items = input.items.map((item, position) => ({
    position,
    medicine_name: item.medicineName,
    dosage: item.dosage || null,
    form: item.form || null,
    quantity: item.quantity || null,
    posology: item.posology || null,
    frequency: item.frequency || null,
    duration: item.duration || null,
    route: item.route || null,
    instructions: item.instructions || null,
  }));

  if (input.id) {
    const existing = await prisma.doctor_prescriptions.findFirst({
      where: { id: input.id, doctor_id: doctor.id },
      select: { id: true, status: true, identity_verified: true },
    });
    if (!existing) throw new Error("Ordonnance introuvable");
    if (existing.status !== "draft") {
      throw new Error("Cette ordonnance est signée : créez une nouvelle ordonnance pour corriger.");
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.doctor_prescription_items.deleteMany({
        where: { doctor_prescription_id: existing.id },
      });
      return tx.doctor_prescriptions.update({
        where: { id: existing.id },
        data: { ...common, patient_id: patient.id, items: { create: items } },
        select: { id: true },
      });
    });
    await audit(updated.id, userId, "updated", { items: items.length }, request);
    if (input.identityVerified && !existing.identity_verified) {
      await audit(updated.id, userId, "identity_verified", {}, request);
    }
    return { id: updated.id, created: false };
  }

  const created = await prisma.doctor_prescriptions.create({
    data: {
      number: newPrescriptionNumber(),
      verification_token: newVerificationToken(),
      doctor_id: doctor.id,
      patient_id: patient.id,
      status: "draft",
      ...common,
      items: { create: items },
    },
    select: { id: true, number: true },
  });
  await audit(created.id, userId, "created", { items: items.length }, request);
  if (input.identityVerified) {
    await audit(created.id, userId, "identity_verified", {}, request);
  }
  return { id: created.id, number: created.number, created: true };
}

export async function rxSign(userId: string, id: string, password: string, request: Request) {
  const doctor = await requireDoctor(userId);
  rateLimit(`doctor-sign:${userId}`, 12, 10 * 60_000);
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { password_hash: true },
  });
  if (!user?.password_hash) {
    throw new Error("Votre compte n'a pas de mot de passe. Définissez-en un pour signer.");
  }
  const check = await verifyPassword(password, user.password_hash);
  if (!check.ok) throw new Error("Mot de passe incorrect. La signature a été refusée.");

  const rx = await ownedRx(doctor.id, id);
  if (rx.status !== "draft") throw new Error("Cette ordonnance est déjà signée.");
  if (!rx.identity_verified) {
    throw new Error("Confirmez d'abord l'identité du patient avant de signer.");
  }
  if (rx.items.length === 0) throw new Error("Ajoutez au moins un médicament avant de signer.");
  const signedAt = new Date();
  const { hash } = signPrescription(rx, rx.items, signedAt);
  const updated = await prisma.doctor_prescriptions.update({
    where: { id: rx.id },
    data: { status: "signed", signed_at: signedAt, signature_hash: hash },
    include: { items: { orderBy: { position: "asc" } } },
  });
  await audit(rx.id, userId, "signed", { hash, version: rx.version }, request);
  const pdf = await ensurePdf(updated, true);
  await audit(rx.id, userId, "pdf_generated", { key: pdf.key }, request);
  return { ok: true, signedAt: signedAt.toISOString(), signature: hash };
}

export async function rxSend(userId: string, id: string, request: Request) {
  const doctor = await requireDoctor(userId);
  const rx = await ownedRx(doctor.id, id);
  if (rx.status === "sent") throw new Error("Cette ordonnance a déjà été envoyée au patient.");
  if (rx.status !== "signed") throw new Error("Signez électroniquement l'ordonnance avant de l'envoyer.");
  if (!rx.signature_hash || !rx.signed_at) throw new Error("Signature manquante : signez à nouveau.");
  const pdf = await ensurePdf(rx);
  const doctorName = doctorDisplayName(rx.doctor_name);

  const patientRx = await prisma.$transaction(async (tx) => {
    const created = await tx.prescriptions.create({
      data: {
        patient_id: rx.patient_id,
        file_path: pdf.key,
        file_mime: "application/pdf",
        patient_name: rx.patient_name,
        doctor_name: doctorName,
        hospital: rx.establishment_name,
        prescription_date: rx.consultation_date,
        prescription_date_raw: null,
        date_source: "manual",
        status: "verified",
        source: "doctor",
        prescription_items: {
          create: rx.items.map((item) => ({
            medicine_name_raw: item.medicine_name,
            strength: item.dosage,
            quantity: item.quantity,
            dosage: [item.posology, item.frequency].filter(Boolean).join(" — ") || null,
            duration: item.duration,
            instructions:
              [item.form, item.route, item.instructions].filter(Boolean).join(" • ") || null,
            patient_verified: true,
          })),
        },
      },
      select: { id: true },
    });
    await tx.doctor_prescriptions.update({
      where: { id: rx.id },
      data: {
        status: "sent",
        sent_at: new Date(),
        prescription_id: created.id,
        pdf_path: pdf.key,
        pdf_sha256: pdf.sha256,
      },
    });
    return created;
  });
  await prisma.notifications.create({
    data: {
      user_id: rx.patient_id,
      type: "prescription",
      title: "Nouvelle ordonnance reçue",
      body: `${doctorName} vous a transmis une ordonnance électronique signée.`,
      data: {
        prescriptionId: patientRx.id,
        doctorPrescriptionId: rx.id,
        number: rx.number,
        url: "/app/prescriptions",
      },
    },
  });
  await audit(rx.id, userId, "sent", { prescriptionId: patientRx.id, pdfSha256: pdf.sha256 }, request);
  return { ok: true, prescriptionId: patientRx.id, number: rx.number };
}

export async function rxPdf(userId: string, id: string) {
  const doctor = await requireDoctor(userId);
  const rx = await ownedRx(doctor.id, id);
  const pdf = await ensurePdf(rx);
  const bytes = await readObject("prescriptions", pdf.key);
  return {
    base64: bytes.toString("base64"),
    sha256: pdf.sha256,
    filename: `${rx.number || "ordonnance"}-v${rx.version}.pdf`,
    url: createAbsoluteSignedUrl("prescriptions", pdf.key, 3600),
  };
}

export async function rxQr(userId: string, id: string) {
  const doctor = await requireDoctor(userId);
  const rx = await ownedRx(doctor.id, id);
  const png = await qrPng(rx.verification_token);
  return {
    base64: png.toString("base64"),
    token: rx.verification_token,
    url: verificationUrl(rx.verification_token),
    number: rx.number,
  };
}

export async function rxVerify(token: string) {
  const rx = await prisma.doctor_prescriptions.findUnique({
    where: { verification_token: token },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!rx) {
    return {
      found: false,
      valid: false,
      revoked: false,
      reason: "Aucune ordonnance ne correspond à ce code de vérification.",
    };
  }
  const { valid } = verifyPrescriptionSignature(rx, rx.items, rx.signature_hash);
  const revoked = rx.status === "cancelled";
  return {
    found: true,
    valid: valid && !revoked,
    revoked,
    reason: revoked
      ? "Cette ordonnance a été annulée par le médecin."
      : valid
        ? undefined
        : "La signature ne correspond pas au contenu : le document a peut-être été modifié.",
    rx: {
      number: rx.number,
      status: rx.status,
      doctorName: doctorDisplayName(rx.doctor_name),
      specialty: rx.doctor_specialty,
      license: rx.doctor_license,
      establishment: rx.establishment_name,
      patientName: rx.patient_name,
      patientCode: patientCode(rx.patient_id),
      consultationDate: dateKey(rx.consultation_date),
      signedAt: rx.signed_at ? rx.signed_at.toISOString() : null,
      diagnosis: rx.diagnosis,
      advice: rx.advice,
      signatureHash: rx.signature_hash,
      items: rx.items.map((item) => ({
        medicineName: item.medicine_name,
        dosage: item.dosage,
        posology: item.posology,
        duration: item.duration,
        instructions: item.instructions,
      })),
    },
  };
}
