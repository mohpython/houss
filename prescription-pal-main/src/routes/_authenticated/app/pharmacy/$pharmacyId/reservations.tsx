import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { respondToReservation } from "@/lib/pharmacy.functions";
import { listPharmacyReservations } from "@/lib/pharmacy-portal.functions";
import { assignCourier } from "@/lib/delivery.functions";
import { confirmPaymentReceived } from "@/lib/payment.functions";
import { verifyPickupCode } from "@/lib/fulfillment.functions";
import { subscribeRealtime } from "@/integrations/realtime/client";
import { Input } from "@/components/ui/input";
import { formatAmount } from "@/lib/payment-config";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RxDateBadge } from "@/components/RxDateBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/i18n";

export const Route = createFileRoute("/_authenticated/app/pharmacy/$pharmacyId/reservations")({
  component: Reservations,
});

type R = {
  id: string;
  status: string;
  created_at: string;
  notes: string | null;
  prescription_id: string | null;
  payment_status: string;
  payment_method: string | null;
  payment_reference: string | null;
  total_amount: number | null;
  fulfillment_method: string;
  patient_name: string | null;
  patient_phone: string | null;
  pickup_code_verified_at: string | null;

  prescriptions: {
    file_path: string | null;
    file_mime: string | null;
    patient_name: string | null;
    doctor_name: string | null;
    hospital: string | null;
    prescription_date: string | null;
    ai_confidence: number | null;
  } | null;
  reservation_items: Array<{
    id: string;
    available: boolean;
    price: number | null;
    prescription_items: {
      medicine_name_raw: string;
      strength: string | null;
      quantity: string | null;
      dosage: string | null;
      duration: string | null;
      instructions: string | null;
    } | null;
  }>;
};

function Reservations() {
  const { t } = useTranslation();
  const verifyPickup = useServerFn(verifyPickupCode);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const handOver = async (rid: string) => {
    setCheckingId(rid);
    try {
      await verifyPickup({ data: { reservationId: rid, code: (codes[rid] ?? "").trim() } });
      toast.success(t("pharm.handOverOk"));
      setCodes((c) => ({ ...c, [rid]: "" }));
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("courier.codeIncorrect"));
    } finally {
      setCheckingId(null);
    }
  };

  const { pharmacyId } = Route.useParams();
  const [rows, setRows] = useState<R[] | null>(null);
  const [rxUrls, setRxUrls] = useState<Record<string, string>>({});
  const respond = useServerFn(respondToReservation);
  const assign = useServerFn(assignCourier);
  const confirmPayment = useServerFn(confirmPaymentReceived);

  const markPaid = async (reservationId: string) => {
    try {
      const r = await confirmPayment({ data: { reservationId } });
      toast.success(
        r.courierName
          ? t("pharm.payConfirmedCourier", { name: r.courierName })
          : t("pharm.payConfirmed"),
      );
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  };

  const fetchReservations = useServerFn(listPharmacyReservations);

  const load = async () => {
    try {
      const { rows: list, rxUrls: urls } = await fetchReservations({ data: { pharmacyId } });
      setRows((list as unknown as R[]) ?? []);
      setRxUrls(urls);
    } catch {
      setRows([]);
      setRxUrls({});
    }
  };
  useEffect(() => {
    load();
    // Nouvelles commandes / changements de statut en direct.
    return subscribeRealtime(
      [{ table: "reservations", event: "*", filter: { pharmacy_id: pharmacyId } }],
      () => load(),
      { onResync: () => load() },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pharmacyId]);

  const act = async (
    reservationId: string,
    decision: "accepted" | "rejected" | "ready" | "completed",
  ) => {
    try {
      await respond({ data: { reservationId, decision } });
      if (decision === "ready") {
        try {
          const r = await assign({ data: { reservationId } });
          toast.success(t("pharm.courierAssigned", { name: r.courierName }));
        } catch (e) {
          toast.warning(e instanceof Error ? e.message : t("pharm.courierNotAssigned"));
        }
      } else {
        toast.success(t("common.updated"));
      }
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold">{t("pharm.incoming")}</h2>
      <div className="mt-3 space-y-3">
        {rows === null && <Skeleton className="h-24 w-full" />}
        {rows?.length === 0 && (
          <Card className="p-4 text-sm text-muted-foreground">{t("pharm.empty")}</Card>
        )}
        {rows?.map((r) => {
          const rxUrl = rxUrls[r.id];
          const mime = r.prescriptions?.file_mime ?? "";
          const isImage = mime.startsWith("image/");
          return (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString(getDateLocale())}
                  </div>
                  {(r.prescriptions?.patient_name ||
                    r.prescriptions?.doctor_name ||
                    r.prescriptions?.hospital) && (
                    <div className="mt-1 text-sm">
                      {r.prescriptions?.patient_name && (
                        <span className="font-medium">{r.prescriptions.patient_name}</span>
                      )}
                      {r.prescriptions?.doctor_name && (
                        <span className="text-muted-foreground">
                          {" "}
                          · Dr {r.prescriptions.doctor_name}
                        </span>
                      )}
                      {r.prescriptions?.hospital && (
                        <span className="text-muted-foreground"> · {r.prescriptions.hospital}</span>
                      )}
                    </div>
                  )}
                  <div className="mt-2">
                    <RxDateBadge date={r.prescriptions?.prescription_date ?? null} />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="secondary">{t("resStatus." + r.status, r.status)}</Badge>
                  <Badge
                    variant="secondary"
                    className={
                      r.payment_status === "paid"
                        ? "border border-success/30 bg-success/10 text-success"
                        : "border border-warning/30 bg-warning/10 text-warning"
                    }
                  >
                    {r.payment_status === "paid" ? t("pay.paid") : t("pharm.payToCheck")} ·{" "}
                    {formatAmount(r.total_amount)}
                  </Badge>
                  {r.payment_reference && (
                    <span className="text-[10px] text-muted-foreground">
                      {t("pharm.refLabel")} {r.payment_reference}
                    </span>
                  )}
                  {r.prescriptions?.ai_confidence !== null &&
                    r.prescriptions?.ai_confidence !== undefined && (
                      <span className="text-[10px] text-muted-foreground">
                        {t("pharm.aiShort")} {r.prescriptions.ai_confidence}%
                      </span>
                    )}
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("pharm.aiExtractedMeds")}
                  </div>
                  <ul className="space-y-2 text-sm">
                    {r.reservation_items.map((i) => {
                      const p = i.prescription_items;
                      if (!p) return null;
                      return (
                        <li key={i.id} className="rounded border bg-background/50 p-2">
                          <div className="font-medium">
                            {p.medicine_name_raw}
                            {p.strength && (
                              <span className="ml-2 text-muted-foreground">{p.strength}</span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            {p.quantity && <span>{t("pharm.qtyShort")} {p.quantity}</span>}
                            {p.dosage && <span>{t("pharm.doseShort")} {p.dosage}</span>}
                            {p.duration && <span>{t("pharm.durShort")} {p.duration}</span>}
                          </div>
                          {p.instructions && (
                            <div className="mt-1 text-xs italic text-muted-foreground">
                              {p.instructions}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("pharm.originalRx")}
                  </div>
                  {rxUrl ? (
                    isImage ? (
                      <a href={rxUrl} target="_blank" rel="noreferrer">
                        <img
                          src={rxUrl}
                          alt={t("pharm.rxAlt")}
                          className="max-h-64 w-full rounded-lg border object-contain"
                        />
                      </a>
                    ) : (
                      <a
                        href={rxUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-primary hover:bg-secondary"
                      >
                        <FileText className="h-4 w-4" />
                        {t("pharm.openRx")}
                      </a>
                    )
                  ) : (
                    <div className="rounded border border-dashed p-4 text-xs text-muted-foreground">
                      {t("pharm.noFile")}
                    </div>
                  )}
                </div>
              </div>

              {r.notes && <div className="mt-3 rounded bg-muted p-2 text-sm">{r.notes}</div>}

              <div className="mt-3 rounded-lg border p-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  {r.fulfillment_method === "pickup"
                    ? t("pharm.byClientPickup")
                    : t("pharm.toCourier")}
                </div>
                <div className="mt-1 text-sm">
                  {r.patient_name ?? t("courier.clientFallback")}
                  {r.patient_phone && (
                    <a href={`tel:${r.patient_phone}`} className="ml-2 text-primary">
                      {r.patient_phone}
                    </a>
                  )}
                </div>
                {r.pickup_code_verified_at ? (
                  <p className="mt-2 text-sm text-success">{t("pharm.codeOkHanded")}</p>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      value={codes[r.id] ?? ""}
                      onChange={(e) => setCodes((c) => ({ ...c, [r.id]: e.target.value }))}
                      placeholder={t("pharm.pickupCode")}
                      aria-label={t("pharm.pickupCode")}
                    />
                    <Button
                      size="sm"
                      disabled={checkingId === r.id || (codes[r.id] ?? "").trim().length < 4}
                      onClick={() => handOver(r.id)}
                    >
                      {t("courier.validateBtn")}
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {r.payment_status === "pending_verification" && (
                  <Button size="sm" variant="outline" onClick={() => markPaid(r.id)}>
                    {t("pharm.confirmPayReceived")}
                  </Button>
                )}

                {r.status === "pending" && (
                  <>
                    <Button size="sm" onClick={() => act(r.id, "accepted")}>
                      {t("pharm.accept")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act(r.id, "rejected")}>
                      {t("pharm.reject")}
                    </Button>
                  </>
                )}
                {r.status === "accepted" && (
                  <Button size="sm" onClick={() => act(r.id, "ready")}>
                    {t("pharm.markReady")}
                  </Button>
                )}
                {r.status === "ready" &&
                  r.pickup_code_verified_at &&
                  r.fulfillment_method === "pickup" && (
                    <Button size="sm" onClick={() => act(r.id, "completed")}>
                      {t("pharm.markPickedUp")}
                    </Button>
                  )}
                {r.status === "ready" &&
                  r.pickup_code_verified_at &&
                  r.fulfillment_method !== "pickup" && (
                    <span className="text-xs text-muted-foreground">
                      {t("pharm.handedNote")}
                    </span>
                  )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
