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

/**
 * Initie un paiement Orange Money WebPay pour une commande du patient.
 * Retourne l'URL de paiement vers laquelle le patient doit être redirigé.
 */
export const startOrangePayment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ reservationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const { initOrangePayment } = await import("./orange-money.server");

    const res = await prisma.reservations.findUnique({
      where: { id: data.reservationId },
      select: {
        id: true,
        patient_id: true,
        payment_status: true,
        total_amount: true,
        pharmacies: { select: { name: true, orange_merchant_key: true } },
      },
    });
    if (!res || res.patient_id !== userId) throw new Error("Commande introuvable");
    if (res.payment_status === "paid") throw new Error("Cette commande est déjà payée");
    if (!res.total_amount || res.total_amount <= 0) throw new Error("Montant invalide");

    // Montant total = médicaments + livraison le cas échéant : tout va à la pharmacie.
    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const pharmacyName = res.pharmacies?.name || "SAHA Santé";

    // Chaque pharmacie encaisse sur SON compte Orange Money (ou clé par défaut
    // configurée dans l'environnement tant que la pharmacie n'a pas la sienne).
    const merchantKey =
      res.pharmacies?.orange_merchant_key?.trim() ||
      process.env.ORANGE_MONEY_MERCHANT_KEY?.trim();
    if (!merchantKey) {
      throw new Error(
        "Le paiement en ligne n'est pas encore activé pour cette pharmacie.",
      );
    }

    const init = await initOrangePayment(
      {
        reservationId: res.id,
        amount: Number(res.total_amount),
        description: `SAHA Santé — ${pharmacyName}`,
        merchantKey,
      },
      baseUrl,
    );

    // On mémorise l'order_id et le pay_token pour que le webhook Orange puisse
    // retrouver la commande et vérifier le statut réel (payment_order_id unique).
    await prisma.reservations.update({
      where: { id: res.id },
      data: { payment_order_id: init.orderId, payment_pay_token: init.payToken },
    });

    await prisma.audit_logs.create({
      data: {
        actor_user_id: userId,
        action: "payment_orange_initiated",
        entity: "reservation",
        entity_id: res.id,
        meta: { orderId: init.orderId, amount: res.total_amount },
      },
    });

    return { paymentUrl: init.paymentUrl, orderId: init.orderId };
  });

/**
 * Vérification côté serveur du statut réel d'un paiement Orange Money.
 * Utilisée par la page de retour : la redirection de navigateur seule ne
 * prouve rien — seul le /transactionstatus d'Orange fait foi.
 */
export const getOrangePaymentStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ reservationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");

    const res = await prisma.reservations.findUnique({
      where: { id: data.reservationId },
      select: { id: true, patient_id: true, payment_status: true, total_amount: true, payment_order_id: true, payment_pay_token: true },
    });
    if (!res || res.patient_id !== userId) throw new Error("Commande introuvable");

    // Déjà confirmée par le webhook : inutile d'interroger Orange.
    if (res.payment_status === "paid") {
      return { state: "SUCCESS" as const, paymentStatus: res.payment_status };
    }
    if (!res.payment_order_id || !res.payment_pay_token) {
      return { state: "NONE" as const, paymentStatus: res.payment_status };
    }

    try {
      const { checkOrangePaymentStatus } = await import("./orange-money.server");
      const check = await checkOrangePaymentStatus(
        res.payment_order_id,
        res.total_amount,
        res.payment_pay_token,
      );
      const state = check.status.toUpperCase();

      // Le webhook peut avoir échoué (Orange n'envoie pas toujours la
      // notification) : on profite du passage du patient pour rattraper.
      if (state === "SUCCESS" && res.payment_status !== "paid") {
        const { updateReservationAs } = await import("./reservation-rules.server");
        await updateReservationAs("system", res.id, {
          payment_status: "paid",
          payment_method: "orange_money",
          payment_reference: res.payment_order_id,
          paid_at: new Date(),
        });
        await prisma.audit_logs.create({
          data: {
            actor_user_id: userId,
            action: "payment_orange_webpay_return",
            entity: "reservation",
            entity_id: res.id,
            meta: { orderId: res.payment_order_id, state },
          },
        });
      }

      return { state, paymentStatus: state === "SUCCESS" ? "paid" : res.payment_status };
    } catch (err) {
      console.error("[orange-money] vérification retour échouée", err);
      return { state: "UNKNOWN" as const, paymentStatus: res.payment_status };
    }
  });
