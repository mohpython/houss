import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { toPlain } from "@/server/serialize";

async function assertCallerIsAdmin(userId: string) {
  const { assertAdmin } = await import("@/server/authz.server");
  await assertAdmin(userId, "Accès réservé aux administrateurs");
}

export type AdminPractitionerRow = {
  id: string;
  full_name: string;
  type: "doctor" | "nurse";
  specialty_code: string;
  license_number: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  home_visits: boolean;
  consultation_fee: number | null;
  is_available: boolean;
  status: "pending" | "approved" | "rejected";
  bio: string | null;
  user_id: string | null;
  owner_email: string | null;
  claim_email: string | null;
};

export const listPractitionersAdmin = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminPractitionerRow[]> => {
    await assertCallerIsAdmin(context.userId);
    const { prisma } = await import("@/server/db.server");

    const rows = await prisma.practitioners.findMany({
      select: {
        id: true,
        full_name: true,
        type: true,
        specialty_code: true,
        license_number: true,
        phone: true,
        address: true,
        city: true,
        lat: true,
        lng: true,
        home_visits: true,
        consultation_fee: true,
        is_available: true,
        status: true,
        bio: true,
        user_id: true,
        claim_email: true,
        user: { select: { email: true } },
      },
      orderBy: { full_name: "asc" },
    });

    return toPlain(
      rows.map(({ user, ...r }) => ({
        ...r,
        owner_email: r.user_id ? (user?.email ?? null) : null,
      })),
    ) as AdminPractitionerRow[];
  });

const PractitionerInput = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().min(2).max(120),
  type: z.enum(["doctor", "nurse"]),
  specialty_code: z.string().min(2),
  license_number: z.string().max(80).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  home_visits: z.boolean().default(false),
  consultation_fee: z.number().nullable().optional(),
  is_available: z.boolean().default(true),
  status: z.enum(["pending", "approved", "rejected"]).default("approved"),
  bio: z.string().max(1000).nullable().optional(),
  claim_email: z.string().email().nullable().optional(),
});

export const upsertPractitioner = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => PractitionerInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertCallerIsAdmin(context.userId);
    const { prisma } = await import("@/server/db.server");

    const payload = {
      full_name: data.full_name,
      type: data.type,
      specialty_code: data.specialty_code,
      license_number: data.license_number ?? null,
      phone: data.phone ?? null,
      address: data.address ?? null,
      city: data.city ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      home_visits: data.home_visits,
      consultation_fee: data.consultation_fee ?? null,
      is_available: data.is_available,
      status: data.status,
      bio: data.bio ?? null,
      claim_email: data.claim_email ? data.claim_email.toLowerCase() : null,
    };

    if (data.id) {
      await prisma.practitioners.update({ where: { id: data.id }, data: payload });
      await linkExistingUser(data.id, payload.claim_email, data.type);
      return { id: data.id };
    }

    const inserted = await prisma.practitioners.create({ data: payload, select: { id: true } });
    await linkExistingUser(inserted.id, payload.claim_email, data.type);
    return { id: inserted.id };
  });

/** If the invited e-mail already has an account, link it immediately. */
async function linkExistingUser(
  practitionerId: string,
  email: string | null,
  type: "doctor" | "nurse",
) {
  if (!email) return;
  const { prisma } = await import("@/server/db.server");
  const match = await prisma.users.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (!match) return;
  try {
    await prisma.practitioners.update({
      where: { id: practitionerId },
      data: { user_id: match.id, claim_email: null },
    });
  } catch {
    // Comme avant : un échec de rattachement (compte déjà lié / autre rôle pro) est ignoré.
    return;
  }
  const { addRole } = await import("@/server/auth.server");
  await addRole(match.id, type);
}

export const setPractitionerStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "approved", "rejected"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.userId);
    const { prisma } = await import("@/server/db.server");
    await prisma.practitioners.updateMany({
      where: { id: data.id },
      data: { status: data.status },
    });
    return { ok: true };
  });

export const deletePractitioner = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.userId);
    const { prisma } = await import("@/server/db.server");
    await prisma.practitioners.deleteMany({ where: { id: data.id } });
    return { ok: true };
  });

export type AdminAppointmentRow = {
  id: string;
  status: string;
  reason: string;
  symptoms: string | null;
  at_home: boolean;
  requested_at: string;
  scheduled_at: string | null;
  proposed_at: string | null;
  patient_address: string | null;
  patient_phone: string | null;
  patient_lat: number | null;
  patient_lng: number | null;
  practitioner_notes: string | null;
  triage: {
    urgency?: string;
    summary?: string;
    advice?: string;
    possible_conditions?: string[];
  } | null;
  patient_name: string | null;
  patient_email: string | null;
  patient_profile_phone: string | null;
  practitioner_name: string | null;
  practitioner_type: "doctor" | "nurse" | null;
  practitioner_specialty: string | null;
  practitioner_phone: string | null;
  practitioner_city: string | null;
};

export const listAppointmentsAdmin = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminAppointmentRow[]> => {
    await assertCallerIsAdmin(context.userId);
    const { prisma } = await import("@/server/db.server");

    const rows = await prisma.appointments.findMany({
      select: {
        id: true,
        status: true,
        reason: true,
        symptoms: true,
        at_home: true,
        requested_at: true,
        scheduled_at: true,
        proposed_at: true,
        patient_address: true,
        patient_phone: true,
        patient_lat: true,
        patient_lng: true,
        practitioner_notes: true,
        triage: true,
        patient_id: true,
        practitioner_id: true,
        patient: {
          select: { email: true, profile: { select: { full_name: true, phone: true } } },
        },
        practitioners: {
          select: { full_name: true, type: true, specialty_code: true, phone: true, city: true },
        },
      },
      orderBy: { requested_at: "desc" },
      take: 200,
    });
    if (rows.length === 0) return [];

    return toPlain(
      rows.map((r) => {
        const prof = r.patient?.profile;
        const pr = r.practitioners;
        return {
          id: r.id,
          status: r.status,
          reason: r.reason,
          symptoms: r.symptoms,
          at_home: r.at_home,
          requested_at: r.requested_at,
          scheduled_at: r.scheduled_at,
          proposed_at: r.proposed_at,
          patient_address: r.patient_address,
          patient_phone: r.patient_phone,
          patient_lat: r.patient_lat,
          patient_lng: r.patient_lng,
          practitioner_notes: r.practitioner_notes,
          triage: (r.triage ?? null) as AdminAppointmentRow["triage"],
          patient_name: prof?.full_name ?? null,
          patient_email: r.patient?.email ?? null,
          patient_profile_phone: prof?.phone ?? null,
          practitioner_name: pr?.full_name ?? null,
          practitioner_type: pr?.type ?? null,
          practitioner_specialty: pr?.specialty_code ?? null,
          practitioner_phone: pr?.phone ?? null,
          practitioner_city: pr?.city ?? null,
        };
      }),
    ) as AdminAppointmentRow[];
  });
