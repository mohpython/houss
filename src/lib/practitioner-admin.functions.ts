import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function assertCallerIsAdmin(supabase: any, userId: string) {
  const { data: row } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!row) throw new Error("Accès réservé aux administrateurs");
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminPractitionerRow[]> => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("practitioners")
      .select(
        "id, full_name, type, specialty_code, license_number, phone, address, city, lat, lng, home_visits, consultation_fee, is_available, status, bio, user_id, claim_email",
      )
      .order("full_name");
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const emails = new Map<string, string>();
    await Promise.all(
      Array.from(new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v))).map(
        async (id) => {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
          if (u?.user?.email) emails.set(id, u.user.email);
        },
      ),
    );

    return rows.map((r) => ({
      ...r,
      owner_email: r.user_id ? (emails.get(r.user_id) ?? null) : null,
    })) as AdminPractitionerRow[];
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PractitionerInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
      const { error } = await supabaseAdmin.from("practitioners").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await linkExistingUser(supabaseAdmin, data.id, payload.claim_email, data.type);
      return { id: data.id };
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("practitioners")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await linkExistingUser(supabaseAdmin, inserted.id, payload.claim_email, data.type);
    return { id: inserted.id };
  });

/** If the invited e-mail already has an account, link it immediately. */
async function linkExistingUser(
  supabaseAdmin: any,
  practitionerId: string,
  email: string | null,
  type: "doctor" | "nurse",
) {
  if (!email) return;
  for (let page = 1; page <= 20; page++) {
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return;
    const match = list.users.find((u: any) => (u.email ?? "").toLowerCase() === email);
    if (match) {
      await supabaseAdmin
        .from("practitioners")
        .update({ user_id: match.id, claim_email: null })
        .eq("id", practitionerId);
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: match.id, role: type })
        .select("id")
        .maybeSingle();
      return;
    }
    if (list.users.length < 200) return;
  }
}

export const setPractitionerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "approved", "rejected"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("practitioners")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePractitioner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("practitioners").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
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
  triage: { urgency?: string; summary?: string; advice?: string; possible_conditions?: string[] } | null;
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAppointmentRow[]> => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("appointments")
      .select(
        "id, status, reason, symptoms, at_home, requested_at, scheduled_at, proposed_at, patient_address, patient_phone, patient_lat, patient_lng, practitioner_notes, triage, patient_id, practitioner_id",
      )
      .order("requested_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) return [];

    const patientIds = Array.from(new Set(rows.map((r: any) => r.patient_id)));
    const practIds = Array.from(new Set(rows.map((r: any) => r.practitioner_id)));

    const [{ data: profiles }, { data: pracs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, phone").in("id", patientIds),
      supabaseAdmin
        .from("practitioners")
        .select("id, full_name, type, specialty_code, phone, city")
        .in("id", practIds),
    ]);

    const emails = new Map<string, string>();
    await Promise.all(
      patientIds.map(async (id) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id as string);
        if (u?.user?.email) emails.set(id as string, u.user.email);
      }),
    );

    const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const prMap = new Map((pracs ?? []).map((p: any) => [p.id, p]));

    return rows.map((r: any) => {
      const prof = pMap.get(r.patient_id);
      const pr = prMap.get(r.practitioner_id);
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
        patient_email: emails.get(r.patient_id) ?? null,
        patient_profile_phone: prof?.phone ?? null,
        practitioner_name: pr?.full_name ?? null,
        practitioner_type: pr?.type ?? null,
        practitioner_specialty: pr?.specialty_code ?? null,
        practitioner_phone: pr?.phone ?? null,
        practitioner_city: pr?.city ?? null,
      };
    });
  });
