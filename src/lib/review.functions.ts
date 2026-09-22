import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ReviewSeverity } from "@/lib/rx-core.server";

export type ReviewDetails = {
  confidence?: number;
  authenticityScore?: number;
  dateStatus?: string;
  dateRaw?: string | null;
  medicinesCount?: number;
  unreadableZones?: string[];
  inconsistencies?: string[];
  qualityNotes?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data: row } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!row) throw new Error("Accès réservé aux administrateurs");
}

/**
 * The AI found something suspicious (unreadable/expired date, low confidence,
 * no medicine found). The severity level controls whether the patient gets
 * a self-correction screen (minor) or goes straight to admin (critical/moderate).
 */
export const flagPrescriptionForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prescriptionId: z.string().uuid(),
        reason: z.string().trim().min(2).max(200),
        reasons: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
        severity: z.enum(["critical", "moderate", "minor"]).optional(),
        details: z
          .object({
            confidence: z.number().optional(),
            authenticityScore: z.number().optional(),
            dateStatus: z.string().optional(),
            dateRaw: z.string().nullable().optional(),
            medicinesCount: z.number().optional(),
            unreadableZones: z.array(z.string()).max(30).optional(),
            inconsistencies: z.array(z.string()).max(30).optional(),
            qualityNotes: z.string().nullable().optional(),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: rx } = await supabase
      .from("prescriptions")
      .select("id, patient_id")
      .eq("id", data.prescriptionId)
      .single();
    if (!rx || rx.patient_id !== userId) throw new Error("Ordonnance introuvable");

    const severity: ReviewSeverity = data.severity ?? "moderate";
    const reasons = data.reasons?.length ? data.reasons : [data.reason];
    const summary = reasons.join(" · ").slice(0, 300);

    await supabase
      .from("prescriptions")
      .update({
        review_severity: severity,
        review_status: "pending",
        review_reasons: reasons,
      })
      .eq("id", rx.id);

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      action: "prescription_flagged",
      entity: "prescription",
      entity_id: rx.id,
      meta: {
        reason: data.reason,
        reasons,
        severity,
        details: data.details ?? null,
      },
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: admins } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (admins?.length) {
      await supabaseAdmin.from("notifications").insert(
        admins.map((a) => ({
          user_id: a.user_id,
          type: "prescription_review",
          title:
            severity === "critical"
              ? "Ordonnance urgente à vérifier"
              : "Ordonnance à vérifier",
          body: summary,
          data: { prescription_id: rx.id, reasons, severity },
        })),
      );
    }

    // The patient is told exactly what is missing / suspicious.
    await supabaseAdmin.from("notifications").insert({
      user_id: rx.patient_id,
      type: "prescription_review",
      title: "Ordonnance en cours de vérification",
      body: `Votre ordonnance a été transmise à notre équipe. Motif : ${summary}`,
      data: { prescription_id: rx.id, reasons, severity },
    });

    return { ok: true, severity };
  });

const SEVERITY_ORDER: Record<ReviewSeverity, number> = {
  critical: 0,
  moderate: 1,
  minor: 2,
};

export const listPrescriptionReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: logs } = await supabaseAdmin
      .from("audit_logs")
      .select("entity_id, meta, created_at, action")
      .eq("entity", "prescription")
      .in("action", ["prescription_flagged", "prescription_review_resolved"])
      .order("created_at", { ascending: false })
      .limit(400);

    const resolved = new Set(
      (logs ?? [])
        .filter((l) => l.action === "prescription_review_resolved")
        .map((l) => l.entity_id as string),
    );
    const flagged = (logs ?? []).filter(
      (l) => l.action === "prescription_flagged" && !resolved.has(l.entity_id as string),
    );
    const unique = [...new Map(flagged.map((l) => [l.entity_id as string, l])).values()];
    if (unique.length === 0) return [];

    const ids = unique.map((l) => l.entity_id as string);
    const { data: rxs } = await supabaseAdmin
      .from("prescriptions")
      .select(
        "id, patient_id, file_path, file_mime, ai_confidence, ai_raw, prescription_date, prescription_date_raw, doctor_name, hospital, patient_name, status, created_at, review_severity, review_reasons, prescription_items(id, medicine_name_raw, strength, dosage, quantity, duration, instructions)",
      )
      .in("id", ids);

    const rows = await Promise.all(
      (rxs ?? []).map(async (rx) => {
        const { data: signed } = await supabaseAdmin.storage
          .from("prescriptions")
          .createSignedUrl(rx.file_path, 600);
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(rx.patient_id);
        const log = unique.find((l) => l.entity_id === rx.id);
        const meta = (log?.meta ?? null) as {
          reason?: string;
          reasons?: string[];
          severity?: ReviewSeverity;
          details?: ReviewDetails | null;
        } | null;
        const severity: ReviewSeverity =
          (rx.review_severity as ReviewSeverity) ??
          meta?.severity ??
          "moderate";
        const reasons: string[] = (Array.isArray(rx.review_reasons) ? (rx.review_reasons as unknown[]).map(String) : null) ?? meta?.reasons ?? [meta?.reason ?? "Document suspect"];
        return {
          id: rx.id,
          reason: meta?.reason ?? "Document suspect",
          reasons: reasons.length ? reasons : [meta?.reason ?? "Document suspect"],
          details: meta?.details ?? null,
          severity,
          flaggedAt: log?.created_at ?? rx.created_at,
          imageUrl: signed?.signedUrl ?? null,
          fileMime: rx.file_mime,
          confidence: rx.ai_confidence,
          aiRaw: rx.ai_raw ? (JSON.stringify(rx.ai_raw, null, 2) as string) : null,
          date: rx.prescription_date,
          dateRaw: rx.prescription_date_raw,
          doctor: rx.doctor_name,
          hospital: rx.hospital,
          patientName: rx.patient_name,
          patientEmail: u?.user?.email ?? null,
          patientPhone: u?.user?.phone ?? null,
          items: rx.prescription_items ?? [],
        };
      }),
    );

    // Sort by severity (critical first), then FIFO within each level
    rows.sort((a, b) => {
      const sv = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (sv !== 0) return sv;
      return (
        new Date(a.flaggedAt).getTime() - new Date(b.flaggedAt).getTime()
      );
    });

    return rows;
  });

export const resolvePrescriptionReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prescriptionId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rx } = await supabaseAdmin
      .from("prescriptions")
      .select("id, patient_id")
      .eq("id", data.prescriptionId)
      .single();
    if (!rx) throw new Error("Ordonnance introuvable");

    await supabaseAdmin
      .from("prescriptions")
      .update({
        status: data.decision === "approved" ? "verified" : "failed",
        review_status: "resolved",
      })
      .eq("id", rx.id);

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: context.userId,
      action: "prescription_review_resolved",
      entity: "prescription",
      entity_id: rx.id,
      meta: { decision: data.decision, note: data.note ?? null },
    });

    await supabaseAdmin.from("notifications").insert({
      user_id: rx.patient_id,
      type: "prescription_review",
      title:
        data.decision === "approved" ? "Ordonnance validée" : "Ordonnance refusée",
      body:
        data.note ??
        (data.decision === "approved"
          ? "Votre ordonnance a été validée, vous pouvez continuer votre commande."
          : "Votre ordonnance n'a pas été validée par notre équipe."),
      data: { prescription_id: rx.id, decision: data.decision },

    });

    return { ok: true };
  });

/**
 * Admin asks the patient to retake the photo. Keeps the same prescription_id,
 * notifies the patient, and sets review_status to 'retake_requested'.
 */
export const requestRetake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prescriptionId: z.string().uuid(),
        note: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rx } = await supabaseAdmin
      .from("prescriptions")
      .select("id, patient_id")
      .eq("id", data.prescriptionId)
      .single();
    if (!rx) throw new Error("Ordonnance introuvable");

    await supabaseAdmin
      .from("prescriptions")
      .update({ review_status: "retake_requested" })
      .eq("id", rx.id);

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: context.userId,
      action: "prescription_review_resolved",
      entity: "prescription",
      entity_id: rx.id,
      meta: { decision: "retake_requested", note: data.note ?? null },
    });

    await supabaseAdmin.from("notifications").insert({
      user_id: rx.patient_id,
      type: "prescription_review",
      title: "Nouvelle photo requise",
      body:
        data.note ??
        "Notre équipe vous demande de reprendre la photo de votre ordonnance. Ouvrez l'application et scannez à nouveau.",
      data: { prescription_id: rx.id, action: "retake" },
    });

    return { ok: true };
  });

/**
 * Admin corrects the extraction (date, doctor, or a medicine) then validates.
 */
export const editExtraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prescriptionId: z.string().uuid(),
        prescriptionDate: z.string().trim().max(20).optional(),
        doctorName: z.string().trim().max(200).optional(),
        hospital: z.string().trim().max(200).optional(),
        items: z
          .array(
            z.object({
              id: z.string().uuid(),
              medicineNameRaw: z.string().trim().max(300).optional(),
              strength: z.string().trim().max(100).optional(),
              dosage: z.string().trim().max(200).optional(),
              quantity: z.string().trim().max(100).optional(),
              duration: z.string().trim().max(200).optional(),
            }),
          )
          .max(50)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rx } = await supabaseAdmin
      .from("prescriptions")
      .select("id, patient_id")
      .eq("id", data.prescriptionId)
      .single();
    if (!rx) throw new Error("Ordonnance introuvable");

    const patch = {
      review_status: "corrected",
      status: "verified" as const,
      ...(data.prescriptionDate ? { prescription_date: data.prescriptionDate } : {}),
      ...(data.doctorName !== undefined ? { doctor_name: data.doctorName } : {}),
      ...(data.hospital !== undefined ? { hospital: data.hospital } : {}),
    };

    await supabaseAdmin
      .from("prescriptions")
      .update(patch)
      .eq("id", rx.id);

    if (data.items?.length) {
      for (const item of data.items) {
        const itemPatch = {
          ...(item.medicineNameRaw !== undefined
            ? { medicine_name_raw: item.medicineNameRaw, normalized_medicine_id: null }
            : {}),
          ...(item.strength !== undefined ? { strength: item.strength } : {}),
          ...(item.dosage !== undefined ? { dosage: item.dosage } : {}),
          ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
          ...(item.duration !== undefined ? { duration: item.duration } : {}),
        };
        if (Object.keys(itemPatch).length > 0) {
          await supabaseAdmin
            .from("prescription_items")
            .update(itemPatch)
            .eq("id", item.id);
        }
      }
    }

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: context.userId,
      action: "prescription_review_resolved",
      entity: "prescription",
      entity_id: rx.id,
      meta: {
        decision: "corrected",
        editedFields: Object.keys(patch).filter((k) => k !== "review_status" && k !== "status"),
        itemsEdited: data.items?.length ?? 0,
      },
    });

    await supabaseAdmin.from("notifications").insert({
      user_id: rx.patient_id,
      type: "prescription_review",
      title: "Ordonnance validée",
      body: "Notre équipe a corrigé et validé votre ordonnance. Vous pouvez continuer votre commande.",
      data: { prescription_id: rx.id },
    });

    return { ok: true };
  });
