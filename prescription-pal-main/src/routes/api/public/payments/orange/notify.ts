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

          // 2. Vérification serveur-à-serveur STRICTE : on interroge l'API Orange
          // avec le montant et le pay_token connus de NOTRE base (jamais ceux du
          // payload HTTP, qui n'est pas signé). En cas d'erreur réseau vers Orange,
          // on renvoie 500 pour qu'Orange réessaie, sans jamais faire confiance au payload.
          const payToken = res.payment_pay_token;
          if (!payToken || !res.total_amount || res.total_amount <= 0) {
            console.warn("[orange-money] pay_token ou montant absent en base, notification rejetée");
            return new Response("ok", { status: 200 });
          }

          let finalStatus = "UNKNOWN";
          try {
            const { checkOrangePaymentStatus } = await import("@/lib/orange-money.server");
            const check = await checkOrangePaymentStatus(orderId, res.total_amount, payToken);
            finalStatus = check.status.toUpperCase();
            console.log(`[orange-money] vérification API → ${finalStatus}`);
          } catch (err) {
            console.error("[orange-money] échec vérification statut auprès d'Orange", err);
            return new Response("Verification failed", { status: 502 });
          }

          if (finalStatus !== "SUCCESS") {
            console.log(`[orange-money] paiement non validé (${finalStatus}), commande maintenue impayée`);
            if (finalStatus === "FAILED" || finalStatus === "EXPIRED" || finalStatus === "CANCELLED") {
              await prisma.audit_logs.create({
                data: {
                  actor_user_id: "system",
                  action: "payment_orange_failed",
                  entity: "reservation",
                  entity_id: res.id,
                  meta: { orderId, amount: res.total_amount, status: finalStatus },
                },
              });
            }
            return new Response("ok", { status: 200 });
          }

          // 3. Paiement confirmé par Orange : on passe la commande en « payée »
          // et on déclenche l'assignation automatique d'un livreur.
          const { updateReservationAs } = await import("@/lib/reservation-rules.server");
          await updateReservationAs("system", res.id, {
            payment_status: "paid",
            payment_method: "orange_money",
            payment_reference: orderId,
            paid_at: new Date(),
          });

          try {
            const { assignCourierCore } = await import("@/lib/routing-core.server");
            await assignCourierCore(res.id, "system");
          } catch (err) {
            console.error("[orange-money] assignation livreur après paiement", err);
          }

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
