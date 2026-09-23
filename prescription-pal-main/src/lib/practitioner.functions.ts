import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { toPlain } from "@/server/serialize";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type PrescribedItem = { name: string; dosage?: string; duration?: string };
export type TriageInfo = { urgency?: string; summary?: string; specialty_code?: string };

export type PractitionerAppointment = {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
  patient_address: string | null;
  patient_lat: number | null;
  patient_lng: number | null;
  reason: string;
  symptoms: string | null;
  triage: TriageInfo | null;
  at_home: boolean;
  status: string;
  requested_at: string;
  scheduled_at: string | null;
  proposed_at: string | null;
  practitioner_notes: string | null;
  report: string | null;
  rejection_reason: string | null;
  completed_at: string | null;
  prescribed_items: PrescribedItem[];
  patient_ack_at: string | null;
  patient_completed_at: string | null;
  last_reminder_at: string | null;
  reminder_count: number;
};

export type PractitionerMe = {
  id: string;
  full_name: string;
  type: "doctor" | "nurse";
  specialty_code: string;
  is_available: boolean;
  status: string;
  home_visits: boolean;
};

export type PractitionerDashboard = {
  me: PractitionerMe | null;
  appointments: PractitionerAppointment[];
  counts: { requested: number; today: number; upcoming: number; completed: number };
};

const ME_SELECT = {
  id: true,
  full_name: true,
  type: true,
  specialty_code: true,
  is_available: true,
  status: true,
  home_visits: true,
} as const;

async function getMyPractitioner(userId: string): Promise<PractitionerMe | null> {
  const { prisma } = await import("@/server/db.server");
  const data = await prisma.practitioners.findUnique({
    where: { user_id: userId },
    select: ME_SELECT,
  });
  if (data) return data as PractitionerMe;

  // Auto-claim: an admin invited this email but the account was created
  // (or the email changed) afterwards — link the profile on first visit.
  const user = await prisma.users.findUnique({ where: { id: userId }, select: { email: true } });
  const normalized = (user?.email ?? "").trim().toLowerCase();
  if (!normalized) return null;
  const invited = await prisma.practitioners.findFirst({
    where: { user_id: null, claim_email: { equals: normalized, mode: "insensitive" } },
    select: ME_SELECT,
  });
  if (!invited) return null;
  await prisma.practitioners.updateMany({
    where: { id: invited.id, user_id: null },
    data: { user_id: userId, claim_email: null },
  });
  const { addRole } = await import("@/server/auth.server");
  await addRole(userId, invited.type);
  return invited as PractitionerMe;
}

const APPT_SELECT = {
  id: true,
  patient_id: true,
  patient_phone: true,
  patient_address: true,
  patient_lat: true,
  patient_lng: true,
  reason: true,
  symptoms: true,
  triage: true,
  at_home: true,
  status: true,
  requested_at: true,
  scheduled_at: true,
  proposed_at: true,
  practitioner_notes: true,
  report: true,
  rejection_reason: true,
  completed_at: true,
  prescribed_items: true,
  patient_ack_at: true,
  patient_completed_at: true,
  last_reminder_at: true,
  reminder_count: true,
} as const;

async function attachPatients(rows: any[]): Promise<PractitionerAppointment[]> {
  if (rows.length === 0) return [];
  const { prisma } = await import("@/server/db.server");
  const ids = Array.from(new Set(rows.map((r) => r.patient_id as string)));
  const profiles = await prisma.profiles.findMany({
    where: { id: { in: ids } },
    select: { id: true, full_name: true, phone: true },
  });
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return rows.map((raw) => {
    const r = toPlain(raw) as any;
    const p = byId.get(r.patient_id);
    return {
      ...r,
      triage: r.triage && typeof r.triage === "object" ? (r.triage as TriageInfo) : null,
      prescribed_items: Array.isArray(r.prescribed_items)
        ? (r.prescribed_items as PrescribedItem[])
        : [],
      patient_name: p?.full_name?.trim() || "Patient",
      patient_phone: r.patient_phone || p?.phone || null,
    } as PractitionerAppointment;
  });
}

async function findOwnAppointment(practitionerId: string, id: string) {
  const { prisma } = await import("@/server/db.server");
  return prisma.appointments.findFirst({
    where: { id, practitioner_id: practitionerId },
    select: { id: true, status: true, reminder_count: true, last_reminder_at: true },
  });
}

async function updateAppointment(userId: string, id: string, patch: Record<string, unknown>) {
  const { updateAppointmentAs } = await import("./appointments-core.server");
  await updateAppointmentAs(userId, id, patch as never);
}

export const getMyPractitionerDashboard = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<PractitionerDashboard> => {
    const me = await getMyPractitioner(context.userId);
    if (!me)
      return {
        me: null,
        appointments: [],
        counts: { requested: 0, today: 0, upcoming: 0, completed: 0 },
      };

    const { prisma } = await import("@/server/db.server");
    const data = await prisma.appointments.findMany({
      where: { practitioner_id: me.id },
      select: APPT_SELECT,
      orderBy: { requested_at: "desc" },
      take: 300,
    });

    const appointments = await attachPatients(data);
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 86_400_000;
    const counts = { requested: 0, today: 0, upcoming: 0, completed: 0 };
    for (const a of appointments) {
      if (a.status === "requested") counts.requested++;
      else if (a.status === "completed") counts.completed++;
      else if (a.status === "accepted" && a.scheduled_at) {
        const ts = new Date(a.scheduled_at).getTime();
        if (ts >= startOfDay && ts < endOfDay) counts.today++;
        else if (ts >= endOfDay) counts.upcoming++;
      }
    }
    return { me, appointments, counts };
  });

export const getPractitionerAppointment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ appointment: PractitionerAppointment; history: PractitionerAppointment[] }> => {
      const me = await getMyPractitioner(context.userId);
      if (!me) throw new Error("Aucun profil praticien lié à ce compte.");
      const { prisma } = await import("@/server/db.server");
      const row = await prisma.appointments.findFirst({
        where: { id: data.id, practitioner_id: me.id },
        select: APPT_SELECT,
      });
      if (!row) throw new Error("Rendez-vous introuvable.");

      const hist = await prisma.appointments.findMany({
        where: { practitioner_id: me.id, patient_id: row.patient_id, id: { not: row.id } },
        select: APPT_SELECT,
        orderBy: { requested_at: "desc" },
        take: 20,
      });

      const [appointment] = await attachPatients([row]);
      const history = await attachPatients(hist);
      return { appointment, history };
    },
  );

export const respondToAppointment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["accept", "reschedule", "reject"]),
        at: z.string().datetime({ offset: true }).nullable().optional(),
        reason: z.string().max(300).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await getMyPractitioner(context.userId);
    if (!me) throw new Error("Aucun profil praticien lié à ce compte.");

    const row = await findOwnAppointment(me.id, data.id);
    if (!row) throw new Error("Rendez-vous introuvable.");
    if (["completed", "cancelled", "rejected"].includes(row.status)) {
      throw new Error("Ce rendez-vous est déjà clôturé.");
    }

    let patch: Record<string, unknown>;
    if (data.action === "accept") {
      if (!data.at) throw new Error("Choisissez une date et une heure.");
      const at = new Date(data.at);
      patch = { status: "accepted", scheduled_at: at, proposed_at: at, rejection_reason: null };
    } else if (data.action === "reschedule") {
      if (!data.at) throw new Error("Choisissez une nouvelle date.");
      patch = { status: "rescheduled", proposed_at: new Date(data.at), scheduled_at: null };
    } else {
      patch = { status: "rejected", rejection_reason: data.reason?.trim() || null };
    }

    await updateAppointment(context.userId, data.id, patch);
    return { ok: true };
  });

export const saveAppointmentNotes = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        notes: z.string().max(4000).nullable().optional(),
        report: z.string().max(4000).nullable().optional(),
        prescribedItems: z
          .array(
            z.object({
              name: z.string().min(1).max(160),
              dosage: z.string().max(160).optional(),
              duration: z.string().max(80).optional(),
            }),
          )
          .max(30)
          .optional(),
        complete: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await getMyPractitioner(context.userId);
    if (!me) throw new Error("Aucun profil praticien lié à ce compte.");
    const row = await findOwnAppointment(me.id, data.id);
    if (!row) throw new Error("Rendez-vous introuvable.");

    const patch: Record<string, unknown> = {};
    if (data.notes !== undefined) patch.practitioner_notes = data.notes;
    if (data.report !== undefined) patch.report = data.report;
    if (data.prescribedItems !== undefined) patch.prescribed_items = data.prescribedItems;
    if (data.complete) {
      if (!["accepted", "rescheduled", "requested"].includes(row.status)) {
        throw new Error("Ce rendez-vous ne peut plus être terminé.");
      }
      patch.status = "completed";
      patch.completed_at = new Date();
    }
    await updateAppointment(context.userId, data.id, patch);
    return { ok: true };
  });

export const setPractitionerAvailability = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ available: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await getMyPractitioner(context.userId);
    if (!me) throw new Error("Aucun profil praticien lié à ce compte.");
    const { prisma } = await import("@/server/db.server");
    await prisma.practitioners.update({
      where: { id: me.id },
      data: { is_available: data.available },
    });
    return { ok: true };
  });

/** Practitioner sends a manual reminder to the patient (notification created by the prisma hooks). */
export const sendAppointmentReminder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await getMyPractitioner(context.userId);
    if (!me) throw new Error("Aucun profil praticien lié à ce compte.");
    const row = await findOwnAppointment(me.id, data.id);
    if (!row) throw new Error("Rendez-vous introuvable.");
    if (["cancelled", "rejected"].includes(row.status))
      throw new Error("Ce rendez-vous est clôturé.");
    if (
      row.last_reminder_at &&
      Date.now() - new Date(row.last_reminder_at).getTime() < 15 * 60_000
    ) {
      throw new Error("Un rappel a déjà été envoyé il y a moins de 15 minutes.");
    }
    await updateAppointment(context.userId, data.id, {
      last_reminder_at: new Date(),
      reminder_count: (row.reminder_count ?? 0) + 1,
    });
    return { ok: true };
  });

/* ---------- Patient side ---------- */

export type MyAppointmentRow = {
  id: string;
  reason: string;
  status: string;
  at_home: boolean;
  created_at: string;
  scheduled_at: string | null;
  proposed_at: string | null;
  report: string | null;
  rejection_reason: string | null;
  prescribed_items: PrescribedItem[] | null;
  patient_completed_at: string | null;
  practitioners: { full_name: string; type: string; phone: string | null } | null;
};

/** Patient's own appointments (was a direct `appointments` select from the browser). */
export const listMyAppointments = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<MyAppointmentRow[]> => {
    const { prisma } = await import("@/server/db.server");
    const rows = await prisma.appointments.findMany({
      where: { patient_id: context.userId },
      select: {
        id: true,
        reason: true,
        status: true,
        at_home: true,
        created_at: true,
        scheduled_at: true,
        proposed_at: true,
        report: true,
        rejection_reason: true,
        prescribed_items: true,
        patient_completed_at: true,
        practitioners: { select: { full_name: true, type: true, phone: true } },
      },
      orderBy: { created_at: "desc" },
    });
    return toPlain(rows) as unknown as MyAppointmentRow[];
  });

async function findPatientAppointment(userId: string, id: string) {
  const { prisma } = await import("@/server/db.server");
  return prisma.appointments.findFirst({
    where: { id, patient_id: userId },
    select: { id: true, status: true, proposed_at: true },
  });
}

/** Patient confirms attendance (accepted) or confirms the consultation took place (completed). */
export const patientConfirmAppointment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), kind: z.enum(["attendance", "completed"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = await findPatientAppointment(context.userId, data.id);
    if (!row) throw new Error("Rendez-vous introuvable.");
    const now = new Date();
    let patch: Record<string, unknown>;
    if (data.kind === "attendance") {
      if (row.status !== "accepted")
        throw new Error("Ce rendez-vous n'est pas confirmé par le praticien.");
      patch = { patient_ack_at: now };
    } else {
      if (row.status !== "completed") throw new Error("La consultation n'est pas encore terminée.");
      patch = { patient_completed_at: now };
    }
    await updateAppointment(context.userId, data.id, patch);
    return { ok: true };
  });

export const patientRespondToProposal = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), accept: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = await findPatientAppointment(context.userId, data.id);
    if (!row) throw new Error("Rendez-vous introuvable.");
    if (row.status !== "rescheduled") throw new Error("Aucune proposition en attente.");
    const patch = data.accept
      ? { status: "accepted" as const, scheduled_at: row.proposed_at }
      : { status: "cancelled" as const };
    await updateAppointment(context.userId, data.id, patch);
    return { ok: true };
  });

export const cancelAppointment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const row = await findPatientAppointment(context.userId, data.id);
    if (!row) throw new Error("Rendez-vous introuvable.");
    if (["completed", "cancelled", "rejected"].includes(row.status)) {
      throw new Error("Ce rendez-vous est déjà clôturé.");
    }
    await updateAppointment(context.userId, data.id, { status: "cancelled" });
    return { ok: true };
  });

/* ---------- Admin: responsiveness stats ---------- */

export type PractitionerResponseStats = Record<
  string,
  { pending: number; avgResponseHours: number | null }
>;

export const getPractitionerResponseStats = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<PractitionerResponseStats> => {
    const { isAdmin } = await import("@/server/authz.server");
    if (!(await isAdmin(context.userId))) throw new Error("Accès réservé aux administrateurs");
    const { prisma } = await import("@/server/db.server");
    const data = await prisma.appointments.findMany({
      where: { requested_at: { gte: new Date(Date.now() - 90 * 86_400_000) } },
      select: { practitioner_id: true, status: true, requested_at: true, updated_at: true },
    });
    const out: PractitionerResponseStats = {};
    for (const a of data) {
      const s = (out[a.practitioner_id] ??= { pending: 0, avgResponseHours: null });
      if (a.status === "requested") s.pending++;
      else if (a.status !== "cancelled") {
        const h =
          (new Date(a.updated_at).getTime() - new Date(a.requested_at).getTime()) / 3_600_000;
        const prevN = (s as any)._n ?? 0;
        (s as any)._n = prevN + 1;
        s.avgResponseHours = ((s.avgResponseHours ?? 0) * prevN + h) / (prevN + 1);
      }
    }
    for (const k of Object.keys(out)) delete (out[k] as any)._n;
    return out;
  });

// Lightweight check used by the app shell so an invited doctor/nurse who signs up
// afterwards immediately gets the "Praticien" entry in the navigation.
export const ensurePractitionerAccess = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ isPractitioner: boolean }> => {
    const me = await getMyPractitioner(context.userId);
    return { isPractitioner: !!me };
  });
