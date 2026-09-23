import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";

/**
 * Patient declares a mobile money transfer for their own unpaid reservation.
 * The order becomes visible to the pharmacy and waits for confirmation.
 */
export const declareMobileMoneyPayment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const { updateReservationAs } = await import("./reservation-rules.server");

    const res = await prisma.reservations.findUnique({
      where: { id: data.reservationId },
      select: { id: true, patient_id: true, payment_status: true },
    });
    if (!res || res.patient_id !== userId) throw new Error("Commande introuvable");
    if (res.payment_status === "paid") throw new Error("Cette commande est déjà payée");

    await updateReservationAs(userId, data.reservationId, {
      payment_status: "pending_verification",
      payment_method: data.method,
      payment_reference: data.reference,
      ...(data.phone ? { patient_phone: data.phone } : {}),
    });

    await prisma.audit_logs.create({
      data: {
        actor_user_id: userId,
        action: "payment_declared",
        entity: "reservation",
        entity_id: data.reservationId,
        meta: { method: data.method },
      },
    });

    return { ok: true };
  });

/**
 * Pharmacy or admin confirms the money was received, then a courier is assigned.
 */
export const confirmPaymentReceived = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ reservationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const { reservationAccess } = await import("@/server/authz.server");
    const { updateReservationAs } = await import("./reservation-rules.server");

    // Même visibilité que l'ancienne RLS (pharmacie après déclaration du paiement, admin…).
    const res = await prisma.reservations.findUnique({
      where: { id: data.reservationId },
      select: {
        id: true,
        patient_id: true,
        pharmacy_id: true,
        courier_id: true,
        payment_status: true,
      },
    });
    if (!res || !(await reservationAccess(userId, res)).canRead) {
      throw new Error("Commande introuvable");
    }
    if (res.patient_id === userId) throw new Error("Seule la pharmacie peut confirmer le paiement");

    await updateReservationAs(userId, data.reservationId, {
      payment_status: "paid",
      paid_at: new Date(),
    });

    const { assignCourierCore } = await import("./routing-core.server");
    const courier = await assignCourierCore(data.reservationId, userId);

    await prisma.audit_logs.create({
      data: {
        actor_user_id: userId,
        action: "payment_confirmed",
        entity: "reservation",
        entity_id: data.reservationId,
        meta: { courier_id: courier?.courierId ?? null },
      },
    });

    return { ok: true, courierName: courier?.courierName ?? null };
  });
