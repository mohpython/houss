import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { getOrangePaymentStatus } from "@/lib/payment.functions";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

/**
 * Page de retour après paiement Orange Money WebPay.
 *
 * Orange redirige le patient ici (return_url / cancel_url), sans garantie
 * de paiement : cette redirection ne prouve RIEN. On vérifie donc le statut
 * réel via /transactionstatus côté serveur (getOrangePaymentStatus), avec
 * quelques relances car la confirmation Orange peut arriver une fraction de
 * seconde après le retour du patient.
 */
export const Route = createFileRoute("/_authenticated/app/payments/orange/return")({
  head: () => ({
    meta: [{ title: i18n.t("meta.checkoutTitle") || "Paiement Orange Money" }],
  }),
  component: OrangeReturn,
});

type CheckState = "checking" | "success" | "pending" | "failed";

function OrangeReturn() {
  const { t } = useTranslation();
  const router = useRouter();
  const [state, setState] = useState<CheckState>("checking");
  const check = useServerFn(getOrangePaymentStatus);
  const startedAt = useRef(Date.now());

  const [reservationId, setReservationId] = useState<string | null>(null);
  // null = URL pas encore lue ; "" = rid absent de l'URL.

  useEffect(() => {
    const rid = new URLSearchParams(window.location.search).get("rid") || "";
    setReservationId(rid);
  }, []);

  useEffect(() => {
    if (reservationId === null) return; // URL pas encore lue
    if (!reservationId) {
      setState("failed");
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const run = async (attempt: number) => {
      try {
        const res = await check({ data: { reservationId } });
        if (cancelled) return;
        if (res?.state === "SUCCESS") {
          setState("success");
          return;
        }
        // Tant qu'Orange n'a pas fini de confirmer, on relance (6 essais max).
        if (res?.state === "INITIATED" || res?.state === "PENDING" || res?.state === "UNKNOWN") {
          if (attempt < 6 && Date.now() - startedAt.current < 30_000) {
            timer = setTimeout(() => run(attempt + 1), 3_000);
            return;
          }
          setState("pending");
          return;
        }
        if (res?.state === "NONE") {
          setState("pending");
          return;
        }
        // FAILED / EXPIRED / NOT FOUND
        setState("failed");
      } catch {
        if (cancelled) return;
        if (attempt < 3) {
          timer = setTimeout(() => run(attempt + 1), 3_000);
        } else {
          setState("pending");
        }
      }
    };

    void run(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  const goOrders = () => router.navigate({ to: "/app/reservations" });
  const goHome = () => router.navigate({ to: "/app" });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        {state === "checking" && (
          <>
            <Loader2 className="mx-auto h-16 w-16 animate-spin text-primary" />
            <h1 className="mt-6 text-2xl font-bold">
              {t("pay.orange.checking", "Vérification du paiement…")}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {t("pay.orange.checkingDesc", "Nous confirmons votre paiement Orange Money.")}
            </p>
          </>
        )}

        {state === "success" && (
          <>
            <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
            <h1 className="mt-6 text-2xl font-bold">
              {t("pay.orange.success", "Paiement reçu !")}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {t(
                "pay.orange.successDesc",
                "Votre paiement Orange Money a été enregistré. La pharmacie va préparer votre commande.",
              )}
            </p>
            <Button onClick={goOrders} className="mt-6 w-full" size="lg">
              {t("pay.orange.viewOrder", "Voir ma commande")}
            </Button>
          </>
        )}

        {state === "pending" && (
          <>
            <Clock className="mx-auto h-16 w-16 text-amber-500" />
            <h1 className="mt-6 text-2xl font-bold">
              {t("pay.orange.pending", "Paiement en cours de confirmation")}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {t(
                "pay.orange.pendingDesc",
                "Orange Money confirme encore la transaction. Votre commande sera mise à jour automatiquement dans quelques instants.",
              )}
            </p>
            <Button onClick={goOrders} className="mt-6 w-full" size="lg" variant="outline">
              {t("pay.orange.viewOrder", "Voir ma commande")}
            </Button>
          </>
        )}

        {state === "failed" && (
          <>
            <XCircle className="mx-auto h-16 w-16 text-destructive" />
            <h1 className="mt-6 text-2xl font-bold">
              {t("pay.orange.cancelled", "Paiement non confirmé")}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {t(
                "pay.orange.cancelledDesc",
                "Le paiement a été annulé ou a échoué. Vous pouvez réessayer depuis votre commande.",
              )}
            </p>
            <Button onClick={goOrders} className="mt-6 w-full" size="lg" variant="outline">
              {t("pay.orange.retry", "Réessayer")}
            </Button>
            <Button onClick={goHome} className="mt-2 w-full" size="lg" variant="ghost">
              {t("nav.home", "Accueil")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
