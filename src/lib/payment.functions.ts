import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Patient declares a mobile money transfer for their own unpaid reservation.
 * The order becomes visible to the pharmacy and waits for confirmation.
 */
export const declareMobileMoneyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reservationId: z.string().uuid(),
        method: z.enum(["orange_money", "moov_money"]),
        reference: z.string().trim().min(4).max(64),
        phone: z.string().trim().min(6).max(24).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: res } = await supabase
      .from("reservations")
      .select("id, patient_id, payment_status")
      .eq("id", data.reservationId)
      .single();
    if (!res || res.patient_id !== userId) throw new Error("Commande introuvable");
    if (res.payment_status === "paid") throw new Error("Cette commande est déjà payée");

    const { error } = await supabase
      .from("reservations")
      .update({
        payment_status: "pending_verification",
        payment_method: data.method,
        payment_reference: data.reference,
        ...(data.phone ? { patient_phone: data.phone } : {}),
      })
      .eq("id", data.reservationId);
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      action: "payment_declared",
      entity: "reservation",
      entity_id: data.reservationId,
      meta: { method: data.method },
    });

    return { ok: true };
  });

/**
 * Pharmacy or admin confirms the money was received, then a courier is assigned.
 */
export const confirmPaymentReceived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ reservationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS restricts this row to the pharmacy members and admins.
    const { data: res } = await supabase
      .from("reservations")
      .select("id, patient_id, payment_status")
      .eq("id", data.reservationId)
      .single();
    if (!res) throw new Error("Commande introuvable");
    if (res.patient_id === userId) throw new Error("Seule la pharmacie peut confirmer le paiement");

    const { error } = await supabase
      .from("reservations")
      .update({ payment_status: "paid", paid_at: new Date().toISOString() })
      .eq("id", data.reservationId);
    if (error) throw new Error(error.message);

    const { assignCourierCore } = await import("./routing-core.server");
    const courier = await assignCourierCore(supabase, data.reservationId, userId);

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      action: "payment_confirmed",
      entity: "reservation",
      entity_id: data.reservationId,
      meta: { courier_id: courier?.courierId ?? null },
    });

    return { ok: true, courierName: courier?.courierName ?? null };
  });
