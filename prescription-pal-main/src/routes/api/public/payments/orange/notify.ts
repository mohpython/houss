/**
 * Orange Money WebPay — notification serveur-à-serveur.
 *
 * Orange appelle cette URL quand un paiement aboutit, échoue ou expire.
 * Le corps JSON contient : status (SUCCESS/FAILED/EXPIRED), order_id,
 * amount, currency, notif_token, customer_msisdn…
 *
 * Sécurité : on ne fait PAS confiance à la notification seule. On vérifie
 * toujours le statut réel via l'API Orange (checkOrangePaymentStatus) avant
 * de marquer la commande comme payée.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/payments/orange/notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: Record<string, any>;
        try {
          payload = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const status = String(payload.status || "").toUpperCase();
        const orderId = String(payload.order_id || payload.orderId || "");
        const notifPayToken = String(payload.pay_token || "");

        console.log(
          `[orange-money] notification reçue status=${status} order_id=${orderId}`,
        );

        if (!orderId) {
          return new Response("Missing order_id", { status: 400 });
        }

        try {
          const { prisma } = await import("@/server/db.server");

          // 1. On retrouve la commande à partir de l'order_id mémorisé à l'initiation.
          const res = await prisma.reservations.findUnique({
            where: { payment_order_id: orderId },
            select: { id: true, payment_status: true, total_amount: true, payment_pay_token: true },
          });
          if (!res) {
            console.warn(`[orange-money] commande introuvable pour order_id ${orderId}`);
            return new Response("ok", { status: 200 });
          }
          if (res.payment_status === "paid") {
            return new Response("ok", { status: 200 });
          }

          // 2. Vérification serveur-à-serveur : on interroge l'API Orange avec
          // le montant et le pay_token connus du serveur (jamais ceux du payload).
          const payToken = res.payment_pay_token || notifPayToken;
          let finalStatus = status;
          if (payToken && res.total_amount > 0) {
            try {
              const { checkOrangePaymentStatus } = await import("@/lib/orange-money.server");
              const check = await checkOrangePaymentStatus(orderId, res.total_amount, payToken);
              finalStatus = check.status.toUpperCase();
              console.log(`[orange-money] vérification API → ${finalStatus}`);
            } catch (err) {
              console.error("[orange-money] échec vérification statut", err);
              // On garde le statut de la notification en secours.
            }
          } else {
            console.warn("[orange-money] pay_token ou montant indisponible, statut non vérifié");
          }

          if (finalStatus !== "SUCCESS") {
            console.log(`[orange-money] paiement non validé (${finalStatus}), commande inchangée`);
            return new Response("ok", { status: 200 });
          }

          // 3. Paiement confirmé : on passe la commande en « payée ».
          const { updateReservationAs } = await import("@/lib/reservation-rules.server");
          await updateReservationAs("system", res.id, {
            payment_status: "paid",
            payment_method: "orange_money",
            payment_reference: orderId,
            paid_at: new Date(),
          });

          await prisma.audit_logs.create({
            data: {
              actor_user_id: "system",
              action: "payment_orange_webpay",
              entity: "reservation",
              entity_id: res.id,
              meta: {
                orderId,
                amount: res.total_amount,
                status: finalStatus,
                notifToken: payload.notif_token,
              },
            },
          });

          console.log(`[orange-money] commande ${res.id} marquée comme payée ✅`);
        } catch (err) {
          console.error("[orange-money] erreur traitement notification", err);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
