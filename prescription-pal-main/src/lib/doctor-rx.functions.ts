import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { toDateOnly, toPlain } from "@/server/serialize";

/**
 * E-ordonnance médecin — server functions.
 *
 * Règles métier :
 *  - seuls les praticiens `type = doctor` et `status = approved` peuvent
 *    rédiger, signer et envoyer une ordonnance ;
 *  - la signature exige une ré-authentification par mot de passe et une
 *    identité patient confirmée ;
 *  - une ordonnance signée est figée : toute correction passe par un avenant
 *    (nouvelle version) et laisse une trace d'audit ;
 *  - l'envoi crée l'ordonnance dans l'espace patient (`prescriptions`), avec
 *    le PDF signé, et notifie le patient.
 */

const ITEM_SCHEMA = z.object({
  medicineName: z.string().trim().min(1, "Nom du médicament requis").max(200),
  dosage: z.string().trim().max(120).optional().default(""),
  form: z.string().trim().max(80).optional().default(""),
  quantity: z.string().trim().max(80).optional().default(""),
  posology: z.string().trim().max(300).optional().default(""),
  frequency: z.string().trim().max(120).optional().default(""),
  duration: z.string().trim().max(120).optional().default(""),
  route: z.string().trim().max(80).optional().default(""),
  instructions: z.string().trim().max(400).optional().default(""),
});

const RX_INPUT = z.object({
  id: z.string().uuid().optional(),
  patientId: z.string().uuid(),
  consultationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de consultation invalide"),
  diagnosis: z.string().trim().max(1000).optional().default(""),
  reason: z.string().trim().max(1000).optional().default(""),
  observations: z.string().trim().max(4000).optional().default(""),
  advice: z.string().trim().max(4000).optional().default(""),
  identityVerified: z.boolean().optional().default(false),
  items: z.array(ITEM_SCHEMA).min(1, "Ajoutez au moins un médicament").max(30),
});

const EVENT_LABELS: Record<string, string> = {
  created: "Brouillon créé",
  updated: "Brouillon mis à jour",
  identity_verified: "Identité patient vérifiée",
  signed: "Signature électronique apposée",
  sent: "Envoyée à l'espace patient",
  viewed: "Consultée par le patient",
  downloaded: "PDF téléchargé",
  printed: "Document imprimé",
  cancelled: "Ordonnance annulée",
  amended: "Avenant créé",
  pdf_generated: "PDF régénéré",
};

export type DoctorRxItemInput = z.infer<typeof ITEM_SCHEMA>;

export type DoctorProfile = {
  id: string;
  full_name: string;
  specialty_code: string;
  specialty_label: string;
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
  approved_at: string | null;
};

export type DoctorSession = {
  user: { id: string; email: string | null; phone: string | null; name: string | null };
  practitioner: DoctorProfile | null;
  access: "ok" | "missing" | "pending" | "rejected" | "not_doctor";
};

type PractitionerRow = {
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

function toDoctorProfile(row: PractitionerRow): DoctorProfile {
  return {
    id: row.id,
    full_name: row.full_name,
    specialty_code: row.specialty_code,
    specialty_label: row.practitioner_specialties?.label_fr ?? row.specialty_code,
    license_number: row.license_number,
    phone: row.phone,
    address: row.address,
    city: row.city,
    status: row.status,
    type: row.type,
    establishment_name: row.establishment_name,
    establishment_address: row.establishment_address,
    establishment_phone: row.establishment_phone,
    establishment_email: row.establishment_email,
    signature_note: row.signature_note,
    approved_at: row.approved_at ? row.approved_at.toISOString() : null,
  };
}

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

async function loadPractitioner(userId: string): Promise<PractitionerRow | null> {
  const { prisma } = await import("@/server/db.server");
  const byUser = (await prisma.practitioners.findUnique({
    where: { user_id: userId },
    select: PRACTITIONER_SELECT,
  })) as PractitionerRow | null;
  if (byUser) return byUser;

  // Rattachement d'un praticien invité par un administrateur (même e-mail).
  const user = await prisma.users.findUnique({ where: { id: userId }, select: { email: true } });
  const email = (user?.email ?? "").trim().toLowerCase();
  if (!email) return null;
  const invited = (await prisma.practitioners.findFirst({
    where: { user_id: null, claim_email: { equals: email, mode: "insensitive" } },
    select: { ...PRACTITIONER_SELECT, claim_email: true },
  })) as (PractitionerRow & { claim_email: string | null }) | null;
  if (!invited) return null;
  await prisma.practitioners.update({
    where: { id: invited.id },
    data: { user_id: userId, claim_email: null },
  });
  const { addRole } = await import("@/server/auth.server");
  if (invited.type === "doctor" || invited.type === "nurse") await addRole(userId, invited.type);
  return invited;
}

async function requireApprovedDoctor(userId: string): Promise<PractitionerRow> {
  const p = await loadPractitioner(userId);
  if (!p) {
    throw new Error(
      "Aucun profil médecin n'est rattaché à ce compte. Contactez l'administrateur SAHA Santé.",
    );
  }
  if (p.type !== "doctor") {
    throw new Error("Cet espace est réservé aux médecins.");
  }
  if (p.status !== "approved") {
    throw new Error(
      "Votre compte médecin n'est pas encore validé par un administrateur. Vous recevrez une notification dès activation.",
    );
  }
  return p;
}

async function requestMeta() {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    return {
      ip: req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req?.headers.get("user-agent")?.slice(0, 300) ?? null,
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}

async function audit(
  doctorPrescriptionId: string,
  actorUserId: string | null,
  action: string,
  meta: Record<string, unknown> = {},
) {
  const { prisma } = await import("@/server/db.server");
  const { ip, userAgent } = await requestMeta();
  await prisma.doctor_prescription_events.create({
    data: {
      doctor_prescription_id: doctorPrescriptionId,
      actor_user_id: actorUserId,
      action,
      meta: meta as never,
      ip,
      user_agent: userAgent,
    },
  });
}

// ============================================================================
// Session / tableau de bord
// ============================================================================

export const getDoctorSession = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<DoctorSession> => {
    const { prisma } = await import("@/server/db.server");
    const user = await prisma.users.findUnique({
      where: { id: context.userId },
      select: {
        id: true,
        email: true,
        phone: true,
        profile: { select: { full_name: true } },
      },
    });
    if (!user) throw new Error("Compte introuvable");
    const base = {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.profile?.full_name ?? null,
      },
    };
    const row = await loadPractitioner(user.id);
    if (!row) return { ...base, practitioner: null, access: "missing" };
    const practitioner = toDoctorProfile(row);
    if (row.type !== "doctor") return { ...base, practitioner, access: "not_doctor" };
    if (row.status === "approved") return { ...base, practitioner, access: "ok" };
    if (row.status === "rejected") return { ...base, practitioner, access: "rejected" };
    return { ...base, practitioner, access: "pending" };
  });

export const getDoctorDashboard = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const doctor = await requireApprovedDoctor(context.userId);
    const { prisma } = await import("@/server/db.server");
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
        take: 6,
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
      me: toDoctorProfile(doctor),
      counts: { drafts, signed, sent, total, today, patients: patients.length, templates },
      recent: toPlain(recent),
    };
  });

// ============================================================================
// Patients
// ============================================================================

export type PatientSearchResult = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  sex: string | null;
  address: string | null;
  sahaCode: string;
  lastVisit: string | null;
  prescriptions: number;
};

export const searchDoctorPatients = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().min(2).max(120) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<PatientSearchResult[]> => {
    const doctor = await requireApprovedDoctor(context.userId);
    const { prisma } = await import("@/server/db.server");
    const { patientCode } = await import("@/server/doctor-rx.server");

    const q = data.query.trim();
    const digits = q.replace(/[^\d]/g, "");
    const or: Record<string, unknown>[] = [
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { profile: { is: { full_name: { contains: q, mode: "insensitive" } } } },
      { profile: { is: { phone: { contains: q } } } },
    ];
    if (digits.length >= 6) or.push({ phone: { contains: digits } });

    const users = await prisma.users.findMany({
      where: { OR: or as never, id: { not: context.userId } },
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
            address: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
      take: 15,
    });
    if (users.length === 0) return [];

    const ids = users.map((u) => u.id);
    const history = await prisma.doctor_prescriptions.groupBy({
      by: ["patient_id"],
      where: { doctor_id: doctor.id, patient_id: { in: ids } },
      _count: { _all: true },
      _max: { created_at: true },
    });
    const byPatient = new Map(history.map((h) => [h.patient_id, h]));

    return users.map((u) => {
      const h = byPatient.get(u.id);
      return {
        id: u.id,
        fullName: u.profile?.full_name?.trim() || u.email || u.phone || "Patient SAHA",
        email: u.email,
        phone: u.profile?.phone || u.phone,
        birthDate: u.profile?.date_of_birth
          ? u.profile.date_of_birth.toISOString().slice(0, 10)
          : null,
        sex: u.profile?.sex ?? null,
        address: u.profile?.address ?? null,
        sahaCode: patientCode(u.id),
        lastVisit: h?._max.created_at ? h._max.created_at.toISOString() : null,
        prescriptions: h?._count._all ?? 0,
      };
    });
  });

export const listDoctorPatients = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<PatientSearchResult[]> => {
    const doctor = await requireApprovedDoctor(context.userId);
    const { prisma } = await import("@/server/db.server");
    const { patientCode } = await import("@/server/doctor-rx.server");
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
            address: true,
          },
        },
      },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return grouped.flatMap((g) => {
      const u = byId.get(g.patient_id);
      if (!u) return [];
      return [
        {
          id: u.id,
          fullName: u.profile?.full_name?.trim() || u.email || u.phone || "Patient SAHA",
          email: u.email,
          phone: u.profile?.phone || u.phone,
          birthDate: u.profile?.date_of_birth
            ? u.profile.date_of_birth.toISOString().slice(0, 10)
            : null,
          sex: u.profile?.sex ?? null,
          address: u.profile?.address ?? null,
          sahaCode: patientCode(u.id),
          lastVisit: g._max.created_at ? g._max.created_at.toISOString() : null,
          prescriptions: g._count._all,
        },
      ];
    });
  });

export const getPatientForDoctor = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ patientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const doctor = await requireApprovedDoctor(context.userId);
    const { prisma } = await import("@/server/db.server");
    const { patientCode } = await import("@/server/doctor-rx.server");
    const user = await prisma.users.findUnique({
      where: { id: data.patientId },
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
            address: true,
          },
        },
      },
    });
    if (!user) throw new Error("Patient introuvable");
    const rows = await prisma.doctor_prescriptions.findMany({
      where: { doctor_id: doctor.id, patient_id: user.id },
      orderBy: { created_at: "desc" },
      take: 20,
      select: {
        id: true,
        number: true,
        status: true,
        diagnosis: true,
        consultation_date: true,
        created_at: true,
        signed_at: true,
        sent_at: true,
      },
    });
    return {
      patient: {
        id: user.id,
        fullName: user.profile?.full_name?.trim() || user.email || user.phone || "Patient SAHA",
        email: user.email,
        phone: user.profile?.phone || user.phone,
        birthDate: user.profile?.date_of_birth
          ? user.profile.date_of_birth.toISOString().slice(0, 10)
          : null,
        sex: user.profile?.sex ?? null,
        address: user.profile?.address ?? null,
        sahaCode: patientCode(user.id),
      },
      prescriptions: toPlain(rows),
    };
  });

// ============================================================================
// Ordonnances
// ============================================================================

export const listDoctorPrescriptions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z
          .enum(["all", "draft", "signed", "sent", "viewed", "cancelled", "amended"])
          .optional()
          .default("all"),
        query: z.string().trim().max(120).optional().default(""),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const doctor = await requireApprovedDoctor(context.userId);
    const { prisma } = await import("@/server/db.server");
    const q = data.query.trim();
    const rows = await prisma.doctor_prescriptions.findMany({
      where: {
        doctor_id: doctor.id,
        ...(data.status !== "all" ? { status: data.status } : {}),
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
  });

export const getDoctorPrescription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const doctor = await requireApprovedDoctor(context.userId);
    const { prisma } = await import("@/server/db.server");
    const { patientCode, verificationUrl, qrDataUrl } = await import("@/server/doctor-rx.server");
    const rx = await prisma.doctor_prescriptions.findFirst({
      where: { id: data.id, doctor_id: doctor.id },
      include: {
        items: { orderBy: { position: "asc" } },
        events: { orderBy: { created_at: "desc" }, take: 60 },
        patient: {
          select: {
            email: true,
            phone: true,
            profile: { select: { full_name: true, phone: true } },
          },
        },
      },
    });
    if (!rx) throw new Error("Ordonnance introuvable");
    return {
      ...toPlain(rx),
      patientCode: patientCode(rx.patient_id),
      patientEmail: rx.patient.email,
      patientPhone: rx.patient.profile?.phone || rx.patient.phone,
      verifyUrl: verificationUrl(rx.verification_token),
      qrSrc: await qrDataUrl(rx.verification_token),
      eventLabels: EVENT_LABELS,
      me: toDoctorProfile(doctor),
    };
  });

export const saveDoctorPrescription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => RX_INPUT.parse(input))
  .handler(async ({ data, context }) => {
    const doctor = await requireApprovedDoctor(context.userId);
    const { prisma } = await import("@/server/db.server");
    const { doctorStoredName, newPrescriptionNumber, newVerificationToken } = await import(
      "@/server/doctor-rx.server"
    );

    const patient = await prisma.users.findUnique({
      where: { id: data.patientId },
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
    if (!patient) throw new Error("Patient introuvable. Vérifiez le numéro ou l'adresse e-mail.");
    if (patient.id === context.userId) {
      throw new Error("Vous ne pouvez pas rédiger une ordonnance pour votre propre compte.");
    }

    const patientName =
      patient.profile?.full_name?.trim() || patient.email || patient.phone || "Patient SAHA";
    const establishment =
      doctor.establishment_name?.trim() ||
      (doctor.city ? `Cabinet médical — ${doctor.city}` : "Cabinet médical SAHA");
    const doctorName = doctorStoredName(doctor.full_name);
    const specialty = doctor.practitioner_specialties?.label_fr ?? doctor.specialty_code;

    const common = {
      consultation_date: toDateOnly(data.consultationDate)!,
      diagnosis: data.diagnosis || null,
      reason: data.reason || null,
      observations: data.observations || null,
      advice: data.advice || null,
      patient_name: patientName,
      patient_phone: patient.profile?.phone || patient.phone,
      patient_email: patient.email,
      patient_birth_date: patient.profile?.date_of_birth ?? null,
      patient_sex: patient.profile?.sex ?? null,
      establishment_name: establishment,
      establishment_address:
        doctor.establishment_address?.trim() || doctor.address?.trim() || null,
      establishment_phone: doctor.establishment_phone?.trim() || doctor.phone?.trim() || null,
      doctor_name: doctorName,
      doctor_specialty: specialty,
      doctor_license: doctor.license_number,
      identity_verified: data.identityVerified,
      identity_verified_at: data.identityVerified ? new Date() : null,
    };

    const items = data.items.map((item, index) => ({
      position: index,
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

    if (data.id) {
      const existing = await prisma.doctor_prescriptions.findFirst({
        where: { id: data.id, doctor_id: doctor.id },
        select: { id: true, status: true, identity_verified: true, patient_id: true },
      });
      if (!existing) throw new Error("Ordonnance introuvable");
      if (existing.status !== "draft") {
        throw new Error(
          "Cette ordonnance est signée : elle ne peut plus être modifiée. Créez un avenant pour corriger.",
        );
      }
      const updated = await prisma.$transaction(async (tx) => {
        await tx.doctor_prescription_items.deleteMany({
          where: { doctor_prescription_id: existing.id },
        });
        return tx.doctor_prescriptions.update({
          where: { id: existing.id },
          data: {
            ...common,
            patient_id: patient.id,
            items: { create: items },
          },
          select: { id: true },
        });
      });
      await audit(updated.id, context.userId, "updated", {
        patientId: patient.id,
        items: items.length,
      });
      if (data.identityVerified && !existing.identity_verified) {
        await audit(updated.id, context.userId, "identity_verified", {
          patientId: patient.id,
        });
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
      select: { id: true },
    });
    await audit(created.id, context.userId, "created", {
      patientId: patient.id,
      items: items.length,
    });
    if (data.identityVerified) {
      await audit(created.id, context.userId, "identity_verified", { patientId: patient.id });
    }
    return { id: created.id, created: true };
  });

async function loadOwnedRx(doctorId: string, id: string) {
  const { prisma } = await import("@/server/db.server");
  const rx = await prisma.doctor_prescriptions.findFirst({
    where: { id, doctor_id: doctorId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!rx) throw new Error("Ordonnance introuvable");
  return rx;
}

/** Régénère (si besoin) le PDF, le stocke et renvoie une URL signée. */
async function ensurePdf(rx: Awaited<ReturnType<typeof loadOwnedRx>>, force = false) {
  const { prisma } = await import("@/server/db.server");
  const { saveObject, createSignedUrl } = await import("@/server/storage.server");
  const { qrPng, sha256Hex, verificationUrl, doctorDisplayName } = await import(
    "@/server/doctor-rx.server"
  );
  const { generatePrescriptionPdf } = await import("@/server/doctor-pdf.server");

  const key = `doctor-rx/${rx.id}-v${rx.version}.pdf`;
  if (!force && rx.pdf_path === key && rx.pdf_sha256) {
    return { url: createSignedUrl("prescriptions", key, 3600), key, sha256: rx.pdf_sha256 };
  }
  const qr = await qrPng(rx.verification_token);
  const bytes = await generatePrescriptionPdf({
    rx: { ...rx, doctor_name: doctorDisplayName(rx.doctor_name) },
    items: rx.items,
    qrPng: qr,
    verifyUrl: verificationUrl(rx.verification_token),
  });
  await saveObject("prescriptions", key, bytes);
  const sha = sha256Hex(bytes);
  await prisma.doctor_prescriptions.update({
    where: { id: rx.id },
    data: { pdf_path: key, pdf_sha256: sha },
  });
  return { url: createSignedUrl("prescriptions", key, 3600), key, sha256: sha };
}

export const getDoctorPrescriptionPdf = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), regenerate: z.boolean().optional().default(false) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const doctor = await requireApprovedDoctor(context.userId);
    const rx = await loadOwnedRx(doctor.id, data.id);
    const pdf = await ensurePdf(rx, data.regenerate);
    if (data.regenerate) await audit(rx.id, context.userId, "pdf_generated", { key: pdf.key });
    return { url: pdf.url, sha256: pdf.sha256 };
  });

export const signDoctorPrescription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        password: z.string().min(1, "Mot de passe requis").max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const doctor = await requireApprovedDoctor(context.userId);
    const { prisma } = await import("@/server/db.server");
    const { verifyPassword } = await import("@/server/auth.server");
    const { rateLimit } = await import("@/server/rate-limit.server");
    const { signPrescription } = await import("@/server/doctor-rx.server");

    rateLimit(`doctor-sign:${context.userId}`, 12, 10 * 60_000);

    const user = await prisma.users.findUnique({
      where: { id: context.userId },
      select: { password_hash: true },
    });
    if (!user?.password_hash) {
      throw new Error(
        "Votre compte n'a pas de mot de passe. Définissez-en un pour signer électroniquement.",
      );
    }
    const check = await verifyPassword(data.password, user.password_hash);
    if (!check.ok) throw new Error("Mot de passe incorrect. La signature a été refusée.");

    const rx = await loadOwnedRx(doctor.id, data.id);
    if (rx.status !== "draft") throw new Error("Cette ordonnance est déjà signée.");
    if (!rx.identity_verified) {
      throw new Error(
        "Confirmez d'abord l'identité du patient (pièce d'identité ou date de naissance vérifiée).",
      );
    }
    if (rx.items.length === 0) throw new Error("Ajoutez au moins un médicament avant de signer.");

    const signedAt = new Date();
    const { hash } = signPrescription(rx, rx.items, signedAt);
    const updated = await prisma.doctor_prescriptions.update({
      where: { id: rx.id },
      data: { status: "signed", signed_at: signedAt, signature_hash: hash },
      include: { items: { orderBy: { position: "asc" } } },
    });
    await audit(rx.id, context.userId, "signed", { hash, version: rx.version });
    const pdf = await ensurePdf(updated, true);
    await audit(rx.id, context.userId, "pdf_generated", { key: pdf.key });
    return { ok: true, signedAt: signedAt.toISOString(), signature: hash, pdfUrl: pdf.url };
  });

export const sendDoctorPrescription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const doctor = await requireApprovedDoctor(context.userId);
    const { prisma } = await import("@/server/db.server");
    const { doctorDisplayName } = await import("@/server/doctor-rx.server");

    const rx = await loadOwnedRx(doctor.id, data.id);
    if (rx.status === "sent") throw new Error("Cette ordonnance a déjà été envoyée au patient.");
    if (rx.status !== "signed") {
      throw new Error("Signez électroniquement l'ordonnance avant de l'envoyer.");
    }
    if (!rx.signature_hash || !rx.signed_at) {
      throw new Error("Signature manquante : signez à nouveau l'ordonnance.");
    }

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
    await audit(rx.id, context.userId, "sent", {
      prescriptionId: patientRx.id,
      pdfSha256: pdf.sha256,
    });

    return { ok: true, prescriptionId: patientRx.id, pdfUrl: pdf.url };
  });

export const cancelDoctorPrescription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().trim().max(500).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const doctor = await requireApprovedDoctor(context.userId);
    const { prisma } = await import("@/server/db.server");
    const rx = await loadOwnedRx(doctor.id, data.id);
    if (rx.status === "cancelled") return { ok: true };
    await prisma.$transaction(async (tx) => {
      await tx.doctor_prescriptions.update({
        where: { id: rx.id },
        data: { status: "cancelled" },
      });
      if (rx.prescription_id) {
        await tx.prescriptions.update({
          where: { id: rx.prescription_id },
          data: { is_expired: true },
        });
      }
    });
    await audit(rx.id, context.userId, "cancelled", { reason: data.reason ?? null });
    if (rx.prescription_id) {
      await prisma.notifications.create({
        data: {
          user_id: rx.patient_id,
          type: "prescription",
          title: "Ordonnance annulée",
          body: `L'ordonnance ${rx.number} a été annulée par le médecin. Contactez-le pour toute question.`,
          data: { prescriptionId: rx.prescription_id, doctorPrescriptionId: rx.id },
        },
      });
    }
    return { ok: true };
  });

export const amendDoctorPrescription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const doctor = await requireApprovedDoctor(context.userId);
    const { prisma } = await import("@/server/db.server");
    const { newPrescriptionNumber, newVerificationToken } = await import(
      "@/server/doctor-rx.server"
    );
    const rx = await loadOwnedRx(doctor.id, data.id);
    if (rx.status === "draft") throw new Error("Cette ordonnance est encore un brouillon.");
    if (rx.status === "amended") throw new Error("Un avenant existe déjà pour cette ordonnance.");

    const draft = await prisma.$transaction(async (tx) => {
      await tx.doctor_prescriptions.update({
        where: { id: rx.id },
        data: { status: "amended" },
      });
      return tx.doctor_prescriptions.create({
        data: {
          number: newPrescriptionNumber(),
          verification_token: newVerificationToken(),
          doctor_id: rx.doctor_id,
          patient_id: rx.patient_id,
          status: "draft",
          consultation_date: rx.consultation_date,
          diagnosis: rx.diagnosis,
          reason: rx.reason,
          observations: rx.observations,
          advice: rx.advice,
          patient_name: rx.patient_name,
          patient_phone: rx.patient_phone,
          patient_email: rx.patient_email,
          patient_birth_date: rx.patient_birth_date,
          patient_sex: rx.patient_sex,
          establishment_name: rx.establishment_name,
          establishment_address: rx.establishment_address,
          establishment_phone: rx.establishment_phone,
          doctor_name: rx.doctor_name,
          doctor_specialty: rx.doctor_specialty,
          doctor_license: rx.doctor_license,
          identity_verified: rx.identity_verified,
          identity_verified_at: rx.identity_verified_at,
          version: rx.version + 1,
          amended_from_id: rx.id,
          items: {
            create: rx.items.map((item) => ({
              position: item.position,
              medicine_name: item.medicine_name,
              dosage: item.dosage,
              form: item.form,
              quantity: item.quantity,
              posology: item.posology,
              frequency: item.frequency,
              duration: item.duration,
              route: item.route,
              instructions: item.instructions,
            })),
          },
        },
        select: { id: true },
      });
    });
    await audit(rx.id, context.userId, "amended", { newId: draft.id });
    await audit(draft.id, context.userId, "created", { amendedFrom: rx.id });
    return { id: draft.id };
  });

export const recordDoctorPrescriptionEvent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["downloaded", "printed", "viewed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const doctor = await requireApprovedDoctor(context.userId);
    await loadOwnedRx(doctor.id, data.id);
    await audit(data.id, context.userId, data.action);
    return { ok: true };
  });

// ============================================================================
// Modèles
// ============================================================================

export const listDoctorTemplates = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const doctor = await requireApprovedDoctor(context.userId);
    const { prisma } = await import("@/server/db.server");
    const rows = await prisma.doctor_rx_templates.findMany({
      where: { doctor_id: doctor.id },
      orderBy: { updated_at: "desc" },
    });
    return toPlain(rows);
  });

export const saveDoctorTemplate = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1, "Nom du modèle requis").max(120),
        diagnosis: z.string().trim().max(1000).optional().default(""),
        advice: z.string().trim().max(4000).optional().default(""),
        items: z.array(ITEM_SCHEMA).min(1, "Ajoutez au moins un médicament").max(30),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const doctor = await requireApprovedDoctor(context.userId);
    const { prisma } = await import("@/server/db.server");
    const payload = {
      name: data.name,
      diagnosis: data.diagnosis || null,
      advice: data.advice || null,
      items: data.items as never,
    };
    if (data.id) {
      const res = await prisma.doctor_rx_templates.updateMany({
        where: { id: data.id, doctor_id: doctor.id },
        data: payload,
      });
      if (res.count === 0) throw new Error("Modèle introuvable");
      return { id: data.id };
    }
    const created = await prisma.doctor_rx_templates.create({
      data: { ...payload, doctor_id: doctor.id },
      select: { id: true },
    });
    return { id: created.id };
  });

export const deleteDoctorTemplate = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const doctor = await requireApprovedDoctor(context.userId);
    const { prisma } = await import("@/server/db.server");
    await prisma.doctor_rx_templates.deleteMany({
      where: { id: data.id, doctor_id: doctor.id },
    });
    return { ok: true };
  });

// ============================================================================
// Paramètres du médecin
// ============================================================================

export const updateDoctorSettings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        fullName: z.string().trim().min(2).max(120),
        specialtyCode: z.string().trim().min(2).max(60),
        licenseNumber: z.string().trim().max(80).optional().default(""),
        phone: z.string().trim().max(40).optional().default(""),
        address: z.string().trim().max(200).optional().default(""),
        city: z.string().trim().max(80).optional().default(""),
        establishmentName: z.string().trim().max(160).optional().default(""),
        establishmentAddress: z.string().trim().max(200).optional().default(""),
        establishmentPhone: z.string().trim().max(40).optional().default(""),
        establishmentEmail: z.string().trim().max(160).optional().default(""),
        signatureNote: z.string().trim().max(300).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const doctor = await requireApprovedDoctor(context.userId);
    const { prisma } = await import("@/server/db.server");
    const { doctorStoredName } = await import("@/server/doctor-rx.server");
    const specialty = await prisma.practitioner_specialties.findUnique({
      where: { code: data.specialtyCode },
      select: { code: true, practitioner_type: true },
    });
    if (!specialty || specialty.practitioner_type !== "doctor") {
      throw new Error("Spécialité inconnue");
    }
    await prisma.practitioners.update({
      where: { id: doctor.id },
      data: {
        full_name: doctorStoredName(data.fullName),
        specialty_code: specialty.code,
        license_number: data.licenseNumber || null,
        phone: data.phone || null,
        address: data.address || null,
        city: data.city || null,
        establishment_name: data.establishmentName || null,
        establishment_address: data.establishmentAddress || null,
        establishment_phone: data.establishmentPhone || null,
        establishment_email: data.establishmentEmail || null,
        signature_note: data.signatureNote || null,
      },
    });
    return { ok: true };
  });

export const listDoctorSpecialties = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const { prisma } = await import("@/server/db.server");
    const rows = await prisma.practitioner_specialties.findMany({
      where: { practitioner_type: "doctor" },
      orderBy: { label_fr: "asc" },
      select: { code: true, label_fr: true, label_en: true, label_ar: true, practitioner_type: true, keywords: true },
    });
    return rows;
  });

// ============================================================================
// Vérification publique (QR)
// ============================================================================

export type PublicVerification = {
  found: boolean;
  valid: boolean;
  revoked: boolean;
  reason?: string;
  rx?: {
    number: string;
    version: number;
    status: string;
    doctorName: string;
    doctorSpecialty: string | null;
    doctorLicense: string | null;
    establishmentName: string;
    establishmentAddress: string | null;
    establishmentPhone: string | null;
    patientName: string;
    patientBirthDate: string | null;
    patientSex: string | null;
    patientCode: string;
    consultationDate: string;
    signedAt: string | null;
    sentAt: string | null;
    diagnosis: string | null;
    advice: string | null;
    signatureHash: string | null;
    identityVerified: boolean;
    pdfSha256: string | null;
    items: Array<{
      medicineName: string;
      dosage: string | null;
      form: string | null;
      quantity: string | null;
      posology: string | null;
      frequency: string | null;
      duration: string | null;
      route: string | null;
      instructions: string | null;
    }>;
  };
};

export const verifyDoctorPrescription = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().trim().min(8).max(120) }).parse(input),
  )
  .handler(async ({ data }): Promise<PublicVerification> => {
    const { prisma } = await import("@/server/db.server");
    const { verifyPrescriptionSignature, patientCode, doctorDisplayName, dateKey } = await import(
      "@/server/doctor-rx.server"
    );
    const rx = await prisma.doctor_prescriptions.findUnique({
      where: { verification_token: data.token },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (!rx) {
      return { found: false, valid: false, revoked: false, reason: "Aucune ordonnance ne correspond à ce QR code." };
    }
    const { valid, expected } = verifyPrescriptionSignature(rx, rx.items, rx.signature_hash);
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
        version: rx.version,
        status: rx.status,
        doctorName: doctorDisplayName(rx.doctor_name),
        doctorSpecialty: rx.doctor_specialty,
        doctorLicense: rx.doctor_license,
        establishmentName: rx.establishment_name,
        establishmentAddress: rx.establishment_address,
        establishmentPhone: rx.establishment_phone,
        patientName: rx.patient_name,
        patientBirthDate: dateKey(rx.patient_birth_date) || null,
        patientSex: rx.patient_sex,
        patientCode: patientCode(rx.patient_id),
        consultationDate: dateKey(rx.consultation_date),
        signedAt: rx.signed_at ? rx.signed_at.toISOString() : null,
        sentAt: rx.sent_at ? rx.sent_at.toISOString() : null,
        diagnosis: rx.diagnosis,
        advice: rx.advice,
        signatureHash: rx.signature_hash,
        identityVerified: rx.identity_verified,
        pdfSha256: rx.pdf_sha256,
        items: rx.items.map((i) => ({
          medicineName: i.medicine_name,
          dosage: i.dosage,
          form: i.form,
          quantity: i.quantity,
          posology: i.posology,
          frequency: i.frequency,
          duration: i.duration,
          route: i.route,
          instructions: i.instructions,
        })),
      },
    };
  });
