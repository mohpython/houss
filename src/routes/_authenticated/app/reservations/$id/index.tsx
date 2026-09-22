import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { respondToReservation } from "@/lib/pharmacy.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Phone, Navigation } from "lucide-react";
import { toast } from "sonner";
import { ReservationTimeline } from "@/components/ReservationTimeline";
import { useTranslation } from "react-i18next";
import { FeedbackForm } from "@/components/FeedbackForm";
import { submitReservationFeedback } from "@/lib/feedback.functions";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/reservations/$id/")({
  component: Detail,
});

type Detail = {
  id: string;
  status: string;
  notes: string | null;
  patient_id: string;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  delivery_status: string | null;
  fulfillment_method: string | null;
  courier_id: string | null;
  pharmacies: { name: string; address: string; phone: string | null } | null;
  reservation_items: Array<{
    id: string;
    prescription_items: { medicine_name_raw: string; strength: string | null; quantity: string | null } | null;
  }>;
};

function Detail() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const [row, setRow] = useState<Detail | null>(null);
  const respond = useServerFn(respondToReservation);
  const submitFeedback = useServerFn(submitReservationFeedback);
  const [fbDone, setFbDone] = useState(false);
  const [fbSending, setFbSending] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("reservations")
      .select(
        "id, status, notes, patient_id, created_at, accepted_at, ready_at, assigned_at, picked_up_at, delivered_at, delivery_status, fulfillment_method, courier_id, pharmacies(name, address, phone), reservation_items(id, prescription_items(medicine_name_raw, strength, quantity))",
      )
      .eq("id", id)
      .single();
    setRow(data as unknown as Detail);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`reservation-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "reservations", filter: `id=eq.${id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const act = async (decision: "cancelled" | "completed") => {
    try {
      await respond({ data: { reservationId: id, decision } });
      toast.success(t("common.updated"));
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  };

  if (!row) return <div className="mx-auto max-w-3xl px-4 py-8"><Skeleton className="h-40 w-full" /></div>;

  const isPickup = row.fulfillment_method === "pickup";
  const showTracking = !isPickup && row.courier_id && ["assigned", "picked_up", "en_route"].includes(row.delivery_status ?? "");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{t("resDetail.title")}</h1>

      <Card className="mt-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{row.pharmacies?.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {row.pharmacies?.address && (
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{row.pharmacies.address}</span>
              )}
              {row.pharmacies?.phone && (
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{row.pharmacies.phone}</span>
              )}
            </div>
          </div>
          <Badge variant="secondary">{row.status}</Badge>
        </div>

        {(showTracking || (isPickup && ["accepted", "ready"].includes(row.status))) && (
          <Link to="/app/reservations/$id/track" params={{ id: row.id }}>
            <Button className="mt-4 w-full gap-2" variant="default">
              <Navigation className="h-4 w-4" />{" "}
              {isPickup ? t("track.pickupCode") : t("resDetail.track")}
            </Button>
          </Link>
        )}
      </Card>

      <Card className="mt-4 p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase text-muted-foreground">{t("resDetail.progress")}</h3>
        <ReservationTimeline r={row} />
      </Card>

      <Card className="mt-4 p-5">
        <h3 className="text-sm font-semibold">{t("resDetail.reservedMeds")}</h3>
        <ul className="mt-2 divide-y">
          {row.reservation_items.map((i) => (
            <li key={i.id} className="py-2 text-sm">
              <div className="font-medium">{i.prescription_items?.medicine_name_raw}</div>
              <div className="text-xs text-muted-foreground">
                {i.prescription_items?.strength} {i.prescription_items?.quantity}
              </div>
            </li>
          ))}
        </ul>
        {row.notes && <div className="mt-4 rounded-md bg-muted p-3 text-sm">{row.notes}</div>}

        {row.patient_id === user.id && ["pending", "accepted", "ready"].includes(row.status) && (
          <div className="mt-5 flex flex-wrap gap-2">
            {row.status === "ready" && isPickup && !row.courier_id && (
              <Button onClick={() => act("completed")}>{t("resDetail.markPickedUp")}</Button>
            )}
            <Button variant="outline" onClick={() => act("cancelled")}>{t("resDetail.cancel")}</Button>
          </div>
        )}
      </Card>

      {row.patient_id === user.id && row.status === "completed" && (
        <Card className="mt-4 p-5">
          <h3 className="text-sm font-semibold">{t("feedback.orderCardTitle")}</h3>
          {fbDone ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 text-primary" /> {t("feedback.thanks")}
            </div>
          ) : (
            <div className="mt-3">
              <FeedbackForm
                submitting={fbSending}
                onSubmit={async ({ rating, comment }) => {
                  setFbSending(true);
                  try {
                    await submitFeedback({ data: { reservationId: id, rating, comment } });
                    setFbDone(true);
                    toast.success(t("feedback.thanks"));
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t("common.error"));
                  } finally {
                    setFbSending(false);
                  }
                }}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
