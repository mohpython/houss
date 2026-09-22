import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Triage, MatchedPractitioner, SpecialtyRow } from "./health-core.server";

export type { Triage, MatchedPractitioner, SpecialtyRow };

export const listSpecialties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SpecialtyRow[]> => {
    const { data, error } = await context.supabase
      .from("practitioner_specialties")
      .select("code, label_fr, label_en, label_ar, practitioner_type, keywords")
      .order("label_fr");
    if (error) throw new Error(error.message);
    return (data ?? []) as SpecialtyRow[];
  });

export const triageAndMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        symptoms: z.string().min(5).max(2000),
        language: z.string().default("fr"),
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
        homeVisitOnly: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ triage: Triage; practitioners: MatchedPractitioner[] }> => {
      const { triageSymptoms, findPractitionersCore } = await import("./health-core.server");

      const { data: specs, error } = await context.supabase
        .from("practitioner_specialties")
        .select("code, label_fr, label_en, label_ar, practitioner_type, keywords");
      if (error) throw new Error(error.message);

      const triage = await triageSymptoms(
        (specs ?? []) as SpecialtyRow[],
        data.symptoms,
        data.language,
      );

      let practitioners = await findPractitionersCore(context.supabase, {
        specialtyCode: triage.specialty_code,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        homeVisitOnly: data.homeVisitOnly ?? false,
      });

      // Fallback: nothing in this specialty => widen to the practitioner type.
      if (practitioners.length === 0) {
        practitioners = await findPractitionersCore(context.supabase, {
          type: triage.practitioner_type,
          lat: data.lat ?? null,
          lng: data.lng ?? null,
          homeVisitOnly: data.homeVisitOnly ?? false,
        });
      }

      return { triage, practitioners };
    },
  );

export const searchPractitioners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        specialtyCode: z.string().nullable().optional(),
        type: z.enum(["doctor", "nurse"]).nullable().optional(),
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
        homeVisitOnly: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<MatchedPractitioner[]> => {
    const { findPractitionersCore } = await import("./health-core.server");
    return findPractitionersCore(context.supabase, {
      specialtyCode: data.specialtyCode ?? null,
      type: data.type ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      homeVisitOnly: data.homeVisitOnly ?? false,
    });
  });

export const requestAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        practitionerId: z.string().uuid(),
        symptoms: z.string().max(2000).optional(),
        reason: z.string().max(300).optional(),
        atHome: z.boolean().default(false),
        patientAddress: z.string().max(300).nullable().optional(),
        patientPhone: z.string().max(40).nullable().optional(),
        patientLat: z.number().nullable().optional(),
        patientLng: z.number().nullable().optional(),
        preferredAt: z.string().nullable().optional(),
        triage: z.record(z.string(), z.unknown()).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ appointmentId: string }> => {
    const { data: prac, error: pErr } = await context.supabase
      .from("practitioners")
      .select("id, status, home_visits, is_available")
      .eq("id", data.practitionerId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!prac || prac.status !== "approved" || !prac.is_available) {
      throw new Error("Ce praticien n'est pas disponible actuellement.");
    }
    if (data.atHome && !prac.home_visits) {
      throw new Error("Ce praticien ne fait pas de visite à domicile.");
    }

    const { data: inserted, error } = await context.supabase
      .from("appointments")
      .insert({
        patient_id: context.userId,
        practitioner_id: data.practitionerId,
        symptoms: data.symptoms ?? null,
        reason: data.reason?.trim() || "Consultation",
        at_home: data.atHome,
        patient_address: data.patientAddress ?? null,
        patient_phone: data.patientPhone ?? null,
        patient_lat: data.patientLat ?? null,
        patient_lng: data.patientLng ?? null,
        ...(data.preferredAt ? { proposed_at: data.preferredAt } : {}),
        triage: (data.triage ?? null) as never,
        status: "requested",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { appointmentId: inserted.id };
  });
