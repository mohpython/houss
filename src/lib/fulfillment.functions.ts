import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_ATTEMPTS = 10;

/** Patient chooses home delivery or pharmacy pickup (pickup removes the delivery fee). */
export const setFulfillmentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reservationId: z.string().uuid(),
        method: z.enum(["delivery", "pickup"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: res, error } = await supabase
      .from("reservations")
      .select("id, patient_id, items_total, delivery_fee, payment_status, fulfillment_method")
      .eq("id", data.reservationId)
      .single();
    if (error || !res) throw new Error("Commande introuvable");
    if (res.patient_id !== userId) throw new Error("Non autorisé");
    if (res.payment_status !== "unpaid") throw new Error("Commande déjà payée");

    const DELIVERY_FEE = 1000;
    const fee = data.method === "pickup" ? 0 : DELIVERY_FEE;
    const itemsTotal = Number(res.items_total ?? 0);

    const { error: upErr } = await supabase
      .from("reservations")
      .update({
        fulfillment_method: data.method,
        delivery_fee: fee,
        total_amount: itemsTotal + fee,
      })
      .eq("id", data.reservationId);
    if (upErr) throw new Error(upErr.message);

    return { method: data.method, deliveryFee: fee, totalAmount: itemsTotal + fee };
  });

type Stage = "pickup" | "receipt";

async function verifyCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  reservationId: string,
  code: string,
  stage: Stage,
) {
  const { data: res, error } = await supabase
    .from("reservations")
    .select(
      "id, patient_id, pharmacy_id, courier_id, fulfillment_method, pickup_code, receipt_code, pickup_code_verified_at, receipt_code_verified_at, code_attempts",
    )
    .eq("id", reservationId)
    .single();
  if (error || !res) throw new Error("Commande introuvable");

  if ((res.code_attempts ?? 0) >= MAX_ATTEMPTS) {
    throw new Error("Trop de tentatives, contactez le support");
  }

  const expected = stage === "pickup" ? res.pickup_code : res.receipt_code;
  const ok = !!expected && expected === code.trim();

  if (!ok) {
    await supabase
      .from("reservations")
      .update({ code_attempts: (res.code_attempts ?? 0) + 1 })
      .eq("id", reservationId);
    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      action: "fulfillment_code_failed",
      entity: "reservation",
      entity_id: reservationId,
      meta: { stage },
    });
    throw new Error("Code incorrect");
  }

  const now = new Date().toISOString();
  const isPickup = res.fulfillment_method === "pickup";
  const patch: Record<string, unknown> = { code_attempts: 0 };

  if (stage === "pickup") {
    patch["pickup_code_verified_at"] = now;
    if (isPickup) {
      patch["status"] = "completed";
      patch["receipt_code_verified_at"] = now;
      patch["delivered_at"] = now;
      patch["delivery_status"] = "delivered";
    } else {
      patch["delivery_status"] = "picked_up";
      patch["picked_up_at"] = now;
    }
  } else {
    patch["receipt_code_verified_at"] = now;
    patch["delivery_status"] = "delivered";
    patch["delivered_at"] = now;
    patch["status"] = "completed";
  }

  const { error: upErr } = await supabase
    .from("reservations")
    .update(patch)
    .eq("id", reservationId);
  if (upErr) throw new Error(upErr.message);

  await supabase.from("audit_logs").insert({
    actor_user_id: userId,
    action: "fulfillment_code_verified",
    entity: "reservation",
    entity_id: reservationId,
    meta: { stage, fulfillment_method: res.fulfillment_method },
  });

  return { ok: true, stage, completed: stage === "receipt" || isPickup };
}

/** Pharmacy validates the code given by the courier (or by the patient on pickup). */
export const verifyPickupCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ reservationId: z.string().uuid(), code: z.string().trim().min(4).max(10) })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    verifyCode(context.supabase, context.userId, data.reservationId, data.code, "pickup"),
  );

/** Courier validates the code given by the patient on delivery. */
export const verifyReceiptCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ reservationId: z.string().uuid(), code: z.string().trim().min(4).max(10) })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    verifyCode(context.supabase, context.userId, data.reservationId, data.code, "receipt"),
  );
