import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

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

const ME_COLS = "id, full_name, type, specialty_code, is_available, status, home_visits";

async function getMyPractitioner(
  supabase: any,
  userId: string,
  email?: string | null,
): Promise<PractitionerMe | null> {
  const { data, error } = await supabase
    .from("practitioners")
    .select(ME_COLS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as PractitionerMe;

  // Auto-claim: an admin invited this email but the account was created
  // (or the email changed) afterwards — link the profile on first visit.
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: invited } = await supabaseAdmin
    .from("practitioners")
    .select(`${ME_COLS}, claim_email`)
    .ilike("claim_email", normalized)
    .is("user_id", null)
    .maybeSingle();
  if (!invited) return null;
  await supabaseAdmin
    .from("practitioners")
    .update({ user_id: userId, claim_email: null })
    .eq("id", invited.id)
    .is("user_id", null);
  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role: invited.type }, { onConflict: "user_id,role" });
  const { claim_email: _drop, ...me } = invited as PractitionerMe & { claim_email: string | null };
  return me;
}

async function attachPatients(rows: any[]): Promise<PractitionerAppointment[]> {
  if (rows.length === 0) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ids = Array.from(new Set(rows.map((r) => r.patient_id as string)));
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, phone")
    .in("id", ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((r) => {
    const p = byId.get(r.patient_id);
    return {
      ...r,
      triage: (r.triage && typeof r.triage === "object" ? (r.triage as TriageInfo) : null),
      prescribed_items: Array.isArray(r.prescribed_items) ? (r.prescribed_items as PrescribedItem[]) : [],
      patient_name: p?.full_name?.trim() || "Patient",
      patient_phone: r.patient_phone || p?.phone || null,
    } as PractitionerAppointment;
  });
}

const APPT_COLS =
  "id, patient_id, patient_phone, patient_address, patient_lat, patient_lng, reason, symptoms, triage, at_home, status, requested_at, scheduled_at, proposed_at, practitioner_notes, report, rejection_reason, completed_at, prescribed_items, patient_ack_at, patient_completed_at, last_reminder_at, reminder_count";

export const getMyPractitionerDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PractitionerDashboard> => {
    const me = await getMyPractitioner(context.supabase, context.userId, (context.claims as any)?.email);
    if (!me) return { me: null, appointments: [], counts: { requested: 0, today: 0, upcoming: 0, completed: 0 } };

    const { data, error } = await context.supabase
      .from("appointments")
      .select(APPT_COLS)
      .eq("practitioner_id", me.id)
      .order("requested_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    const appointments = await attachPatients(data ?? []);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(
    async ({ data, context }): Promise<{ appointment: PractitionerAppointment; history: PractitionerAppointment[] }> => {
      const me = await getMyPractitioner(context.supabase, context.userId, (context.claims as any)?.email);
      if (!me) throw new Error("Aucun profil praticien lié à ce compte.");
      const { data: row, error } = await context.supabase
        .from("appointments")
        .select(APPT_COLS)
        .eq("id", data.id)
        .eq("practitioner_id", me.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Rendez-vous introuvable.");

      const { data: hist } = await context.supabase
        .from("appointments")
        .select(APPT_COLS)
        .eq("practitioner_id", me.id)
        .eq("patient_id", row.patient_id)
        .neq("id", row.id)
        .order("requested_at", { ascending: false })
        .limit(20);

      const [appointment] = await attachPatients([row]);
      const history = await attachPatients(hist ?? []);
      return { appointment, history };
    },
  );

export const respondToAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    const me = await getMyPractitioner(context.supabase, context.userId, (context.claims as any)?.email);
    if (!me) throw new Error("Aucun profil praticien lié à ce compte.");

    const { data: row } = await context.supabase
      .from("appointments")
      .select("id, status")
      .eq("id", data.id)
      .eq("practitioner_id", me.id)
      .maybeSingle();
    if (!row) throw new Error("Rendez-vous introuvable.");
    if (["completed", "cancelled", "rejected"].includes(row.status)) {
      throw new Error("Ce rendez-vous est déjà clôturé.");
    }

    type Patch = Database["public"]["Tables"]["appointments"]["Update"];
    let patch: Patch;
    if (data.action === "accept") {
      if (!data.at) throw new Error("Choisissez une date et une heure.");
      patch = { status: "accepted", scheduled_at: data.at, proposed_at: data.at, rejection_reason: null };
    } else if (data.action === "reschedule") {
      if (!data.at) throw new Error("Choisissez une nouvelle date.");
      patch = { status: "rescheduled", proposed_at: data.at, scheduled_at: null };
    } else {
      patch = { status: "rejected", rejection_reason: data.reason?.trim() || null };
    }

    const { error } = await context.supabase.from("appointments").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveAppointmentNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    const me = await getMyPractitioner(context.supabase, context.userId, (context.claims as any)?.email);
    if (!me) throw new Error("Aucun profil praticien lié à ce compte.");
    const { data: row } = await context.supabase
      .from("appointments")
      .select("id, status")
      .eq("id", data.id)
      .eq("practitioner_id", me.id)
      .maybeSingle();
    if (!row) throw new Error("Rendez-vous introuvable.");

    const patch: Database["public"]["Tables"]["appointments"]["Update"] = {};
    if (data.notes !== undefined) patch.practitioner_notes = data.notes;
    if (data.report !== undefined) patch.report = data.report;
    if (data.prescribedItems !== undefined) patch.prescribed_items = data.prescribedItems;
    if (data.complete) {
      if (!["accepted", "rescheduled", "requested"].includes(row.status)) {
        throw new Error("Ce rendez-vous ne peut plus être terminé.");
      }
      patch.status = "completed";
      patch.completed_at = new Date().toISOString();
    }
    const { error } = await context.supabase.from("appointments").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setPractitionerAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ available: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await getMyPractitioner(context.supabase, context.userId, (context.claims as any)?.email);
    if (!me) throw new Error("Aucun profil praticien lié à ce compte.");
    const { error } = await context.supabase
      .from("practitioners")
      .update({ is_available: data.available })
      .eq("id", me.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Practitioner sends a manual reminder to the patient (notification created by DB trigger). */
export const sendAppointmentReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await getMyPractitioner(context.supabase, context.userId, (context.claims as any)?.email);
    if (!me) throw new Error("Aucun profil praticien lié à ce compte.");
    const { data: row } = await context.supabase
      .from("appointments")
      .select("id, status, reminder_count, last_reminder_at")
      .eq("id", data.id)
      .eq("practitioner_id", me.id)
      .maybeSingle();
    if (!row) throw new Error("Rendez-vous introuvable.");
    if (["cancelled", "rejected"].includes(row.status)) throw new Error("Ce rendez-vous est clôturé.");
    if (row.last_reminder_at && Date.now() - new Date(row.last_reminder_at).getTime() < 15 * 60_000) {
      throw new Error("Un rappel a déjà été envoyé il y a moins de 15 minutes.");
    }
    const { error } = await context.supabase
      .from("appointments")
      .update({ last_reminder_at: new Date().toISOString(), reminder_count: (row.reminder_count ?? 0) + 1 })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Patient side ---------- */

/** Patient confirms attendance (accepted) or confirms the consultation took place (completed). */
export const patientConfirmAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), kind: z.enum(["attendance", "completed"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("appointments")
      .select("id, status")
      .eq("id", data.id)
      .eq("patient_id", context.userId)
      .maybeSingle();
    if (!row) throw new Error("Rendez-vous introuvable.");
    const now = new Date().toISOString();
    let patch: Database["public"]["Tables"]["appointments"]["Update"];
    if (data.kind === "attendance") {
      if (row.status !== "accepted") throw new Error("Ce rendez-vous n'est pas confirmé par le praticien.");
      patch = { patient_ack_at: now };
    } else {
      if (row.status !== "completed") throw new Error("La consultation n'est pas encore terminée.");
      patch = { patient_completed_at: now };
    }
    const { error } = await context.supabase.from("appointments").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const patientRespondToProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), accept: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("appointments")
      .select("id, status, proposed_at")
      .eq("id", data.id)
      .eq("patient_id", context.userId)
      .maybeSingle();
    if (!row) throw new Error("Rendez-vous introuvable.");
    if (row.status !== "rescheduled") throw new Error("Aucune proposition en attente.");
    const patch = data.accept
      ? { status: "accepted" as const, scheduled_at: row.proposed_at }
      : { status: "cancelled" as const };
    const { error } = await context.supabase.from("appointments").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("appointments")
      .select("id, status")
      .eq("id", data.id)
      .eq("patient_id", context.userId)
      .maybeSingle();
    if (!row) throw new Error("Rendez-vous introuvable.");
    if (["completed", "cancelled", "rejected"].includes(row.status)) {
      throw new Error("Ce rendez-vous est déjà clôturé.");
    }
    const { error } = await context.supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Admin: responsiveness stats ---------- */

export type PractitionerResponseStats = Record<
  string,
  { pending: number; avgResponseHours: number | null }
>;

export const getPractitionerResponseStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PractitionerResponseStats> => {
    const { data: adm } = await context.supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adm) throw new Error("Accès réservé aux administrateurs");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("appointments")
      .select("practitioner_id, status, requested_at, updated_at")
      .gte("requested_at", new Date(Date.now() - 90 * 86_400_000).toISOString());
    const out: PractitionerResponseStats = {};
    for (const a of data ?? []) {
      const s = (out[a.practitioner_id] ??= { pending: 0, avgResponseHours: null });
      if (a.status === "requested") s.pending++;
      else if (a.status !== "cancelled") {
        const h = (new Date(a.updated_at).getTime() - new Date(a.requested_at).getTime()) / 3_600_000;
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ isPractitioner: boolean }> => {
    const me = await getMyPractitioner(
      context.supabase,
      context.userId,
      (context.claims as any)?.email,
    );
    return { isPractitioner: !!me };
  });
