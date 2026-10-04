import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { DELIVERY_FEE } from "./payment-config";

const MAX_ATTEMPTS = 10;

/** Patient chooses home delivery or pharmacy pickup (pickup removes the delivery fee). */
export const setFulfillmentMethod = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reservationId: z.string().uuid(),
        method: z.enum(["delivery", "pickup"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { reservationAccess } = await import("@/server/authz.server");
    const { prisma } = await import("@/server/db.server");
    const { updateReservationAs } = await import("./reservation-rules.server");

    const res = await prisma.reservations.findUnique({
      where: { id: data.reservationId },
      select: {
        id: true,
        patient_id: true,
        pharmacy_id: true,
        courier_id: true,
        items_total: true,
        delivery_fee: true,
        payment_status: true,
        fulfillment_method: true,
      },
    });
    if (!res || !(await reservationAccess(userId, res)).canRead) {
      throw new Error("Commande introuvable");
    }
    if (res.patient_id !== userId) throw new Error("Non autorisé");
    if (res.payment_status !== "unpaid") throw new Error("Commande déjà payée");

    const fee = data.method === "pickup" ? 0 : DELIVERY_FEE;
    const itemsTotal = Number(res.items_total ?? 0);

    await updateReservationAs(userId, data.reservationId, {
      fulfillment_method: data.method,
      delivery_fee: fee,
      total_amount: itemsTotal + fee,
    });

    return { method: data.method, deliveryFee: fee, totalAmount: itemsTotal + fee };
  });

type Stage = "pickup" | "receipt";

async function verifyCode(userId: string, reservationId: string, code: string, stage: Stage) {
  const { loadReservationForUser } = await import("@/server/authz.server");
  const { prisma } = await import("@/server/db.server");
  const { updateReservationAs } = await import("./reservation-rules.server");

  let res;
  try {
    res = (await loadReservationForUser(userId, reservationId)).reservation;
  } catch {
    throw new Error("Commande introuvable");
  }

  if ((res.code_attempts ?? 0) >= MAX_ATTEMPTS) {
    throw new Error("Trop de tentatives, contactez le support");
  }

  const expected = stage === "pickup" ? res.pickup_code : res.receipt_code;
  const ok = !!expected && expected === code.trim();

  if (!ok) {
    // Comme avant : l'échec éventuel de cette mise à jour (droits) est ignoré.
    await updateReservationAs(userId, reservationId, {
      code_attempts: (res.code_attempts ?? 0) + 1,
    }).catch(() => undefined);
    await prisma.audit_logs.create({
      data: {
        actor_user_id: userId,
        action: "fulfillment_code_failed",
        entity: "reservation",
        entity_id: reservationId,
        meta: { stage },
      },
    });
    throw new Error("Code incorrect");
  }

  const now = new Date();
  const isPickup = res.fulfillment_method === "pickup";
  const patch: {
    code_attempts: number;
    pickup_code_verified_at?: Date;
    receipt_code_verified_at?: Date;
    status?: "completed";
    delivered_at?: Date;
    picked_up_at?: Date;
    delivery_status?: "delivered" | "picked_up";
  } = { code_attempts: 0 };

  if (stage === "pickup") {
    patch.pickup_code_verified_at = now;
    if (isPickup) {
      patch.status = "completed";
      patch.receipt_code_verified_at = now;
      patch.delivered_at = now;
      patch.delivery_status = "delivered";
    } else {
      patch.delivery_status = "picked_up";
      patch.picked_up_at = now;
    }
  } else {
    patch.receipt_code_verified_at = now;
    patch.delivery_status = "delivered";
    patch.delivered_at = now;
    patch.status = "completed";
  }

  await updateReservationAs(userId, reservationId, patch);

  await prisma.audit_logs.create({
    data: {
      actor_user_id: userId,
      action: "fulfillment_code_verified",
      entity: "reservation",
      entity_id: reservationId,
      meta: { stage, fulfillment_method: res.fulfillment_method },
    },
  });

  return { ok: true, stage, completed: stage === "receipt" || isPickup };
}

/** Pharmacy validates the code given by the courier (or by the patient on pickup). */
export const verifyPickupCode = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ reservationId: z.string().uuid(), code: z.string().trim().min(4).max(10) })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    verifyCode(context.userId, data.reservationId, data.code, "pickup"),
  );

/** Courier validates the code given by the patient on delivery. */
export const verifyReceiptCode = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ reservationId: z.string().uuid(), code: z.string().trim().min(4).max(10) })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    verifyCode(context.userId, data.reservationId, data.code, "receipt"),
  );
