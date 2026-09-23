import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import type { Triage, MatchedPractitioner, SpecialtyRow } from "./health-core.server";

export type { Triage, MatchedPractitioner, SpecialtyRow };

const SPECIALTY_SELECT = {
  code: true,
  label_fr: true,
  label_en: true,
  label_ar: true,
  practitioner_type: true,
  keywords: true,
} as const;

export const listSpecialties = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async (): Promise<SpecialtyRow[]> => {
    const { prisma } = await import("@/server/db.server");
    const data = await prisma.practitioner_specialties.findMany({
      select: SPECIALTY_SELECT,
      orderBy: { label_fr: "asc" },
    });
    return data as SpecialtyRow[];
  });

export const triageAndMatch = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
  .handler(async ({ data }): Promise<{ triage: Triage; practitioners: MatchedPractitioner[] }> => {
    const { triageSymptoms, findPractitionersCore } = await import("./health-core.server");

    const { prisma } = await import("@/server/db.server");
    const specs = await prisma.practitioner_specialties.findMany({ select: SPECIALTY_SELECT });

    const triage = await triageSymptoms(specs as SpecialtyRow[], data.symptoms, data.language);

    let practitioners = await findPractitionersCore({
      specialtyCode: triage.specialty_code,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      homeVisitOnly: data.homeVisitOnly ?? false,
    });

    // Fallback: nothing in this specialty => widen to the practitioner type.
    if (practitioners.length === 0) {
      practitioners = await findPractitionersCore({
        type: triage.practitioner_type,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        homeVisitOnly: data.homeVisitOnly ?? false,
      });
    }

    return { triage, practitioners };
  });

export const searchPractitioners = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
  .handler(async ({ data }): Promise<MatchedPractitioner[]> => {
    const { findPractitionersCore } = await import("./health-core.server");
    return findPractitionersCore({
      specialtyCode: data.specialtyCode ?? null,
      type: data.type ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      homeVisitOnly: data.homeVisitOnly ?? false,
    });
  });

export const requestAppointment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
    const { prisma, Prisma } = await import("@/server/db.server");
    const prac = await prisma.practitioners.findUnique({
      where: { id: data.practitionerId },
      select: { id: true, status: true, home_visits: true, is_available: true, user_id: true },
    });
    // RLS : seuls les praticiens approuvés (ou soi-même / admin) étaient visibles ;
    // un praticien non approuvé est de toute façon refusé ci-dessous.
    if (!prac || prac.status !== "approved" || !prac.is_available) {
      throw new Error("Ce praticien n'est pas disponible actuellement.");
    }
    if (data.atHome && !prac.home_visits) {
      throw new Error("Ce praticien ne fait pas de visite à domicile.");
    }

    const inserted = await prisma.appointments.create({
      data: {
        patient_id: context.userId,
        practitioner_id: data.practitionerId,
        symptoms: data.symptoms ?? null,
        reason: data.reason?.trim() || "Consultation",
        at_home: data.atHome,
        patient_address: data.patientAddress ?? null,
        patient_phone: data.patientPhone ?? null,
        patient_lat: data.patientLat ?? null,
        patient_lng: data.patientLng ?? null,
        ...(data.preferredAt ? { proposed_at: new Date(data.preferredAt) } : {}),
        triage: (data.triage ?? Prisma.DbNull) as never,
        status: "requested",
      },
      select: { id: true },
    });

    return { appointmentId: inserted.id };
  });
