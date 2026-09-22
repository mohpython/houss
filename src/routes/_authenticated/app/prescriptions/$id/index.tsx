import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { autoRouteReservation } from "@/lib/delivery.functions";
import {
  deletePrescriptionItem,
  getPrescriptionDetail,
  markPrescriptionVerified,
  setPrescriptionDate,
  updatePrescriptionItem,
} from "@/lib/prescriptions.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AlertTriangle, MapPin, Trash2, Zap, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RxDateBadge } from "@/components/RxDateBadge";
import { rxDateStatus } from "@/lib/date-utils";

export const Route = createFileRoute("/_authenticated/app/prescriptions/$id/")({
  component: Detail,
});

type Item = {
  id: string;
  medicine_name_raw: string;
  strength: string | null;
  quantity: string | null;
  dosage: string | null;
  duration: string | null;
  instructions: string | null;
  patient_verified: boolean;
};

function Detail() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const router = useRouter();
  const autoRoute = useServerFn(autoRouteReservation);
  const getDetail = useServerFn(getPrescriptionDetail);
  const updateItemFn = useServerFn(updatePrescriptionItem);
  const deleteItemFn = useServerFn(deletePrescriptionItem);
  const saveDateFn = useServerFn(setPrescriptionDate);
  const markVerifiedFn = useServerFn(markPrescriptionVerified);
  const [autoBusy, setAutoBusy] = useState(false);
  const [rx, setRx] = useState<{
    patient_name: string | null;
    doctor_name: string | null;
    hospital: string | null;
    prescription_date: string | null;
    ai_confidence: number | null;
    status: string;
    prescription_date_raw: string | null;
    date_source: string | null;
  } | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const detail = await getDetail({ data: { prescriptionId: id } });
        setRx(detail.rx);
        setItems((detail.items as Item[]) ?? []);
      } catch {
        setRx(null);
        setItems([]);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const updateItem = async (itemId: string, patch: Partial<Item>) => {
    setItems((cur) => cur?.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) ?? null);
    // A renamed medicine must be re-linked to the catalog on the next search
    // (done server side by updatePrescriptionItem).
    await updateItemFn({ data: { itemId, patch } }).catch(() => undefined);
  };

  const deleteItem = async (itemId: string) => {
    setItems((cur) => cur?.filter((i) => i.id !== itemId) ?? null);
    await deleteItemFn({ data: { itemId } }).catch(() => undefined);
  };

  const saveDate = async (value: string) => {
    const next = value || null;
    setRx((r) => (r ? { ...r, prescription_date: next, date_source: "manual" } : r));
    try {
      await saveDateFn({ data: { prescriptionId: id, date: next } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
      return;
    }
    toast.success(t("rxDate.saved"));
  };

  const markVerified = async () => {
    await markVerifiedFn({ data: { prescriptionId: id } }).catch(() => undefined);
    setRx((r) => (r ? { ...r, status: "verified" } : r));
    toast.success(t("rxDetail.rxVerified"));
  };

  const getGeo = () =>
    new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!("geolocation" in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });

  const autoReserve = async () => {
    if (dateBlocked) {
      toast.error(dateStatus === "expired" ? t("rxDate.blockExpired") : t("rxDate.blockFuture"));
      return;
    }
    setAutoBusy(true);
    try {
      const geo = await getGeo();
      if (!geo) {
        toast.error(t("rxDetail.geoRequired"));
        return;
      }
      const r = await autoRoute({
        data: { prescriptionId: id, patientLat: geo.lat, patientLng: geo.lng },
      });
      toast.success(t("rxDetail.sentTo", { name: r.pharmacyName, count: r.matchedCount }));
      router.navigate({ to: "/app/reservations/$id/track", params: { id: r.reservationId } });
    } catch (err) {
      toast.message(t("rxDetail.noPharmFound"), {
        description: err instanceof Error ? err.message : undefined,
      });
      router.navigate({ to: "/app/prescriptions/$id/pharmacies", params: { id } });
    } finally {
      setAutoBusy(false);
    }
  };

  const lowConfidence = rx && rx.ai_confidence !== null && rx.ai_confidence < 85;
  const dateStatus = rxDateStatus(rx?.prescription_date);
  const dateBlocked = dateStatus === "expired" || dateStatus === "future";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {!rx && <Skeleton className="h-40 w-full" />}
      {rx && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {rx.doctor_name ? `Dr. ${rx.doctor_name}` : t("rxDetail.title")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {rx.hospital ?? ""} {rx.prescription_date ? `· ${rx.prescription_date}` : ""}
              </p>
            </div>
            {rx.ai_confidence !== null && (
              <Badge
                variant="secondary"
                className={
                  lowConfidence ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
                }
              >
                {t("rxDetail.confidence")} {rx.ai_confidence}%
              </Badge>
            )}
          </div>

          {lowConfidence && (
            <Card className="mt-4 flex gap-3 border-warning/40 bg-warning/5 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
              <div className="text-sm">
                <div className="font-medium text-warning">{t("rxDetail.verifyWarning")}</div>
                <div className="text-muted-foreground">{t("rxDetail.verifyWarningText")}</div>
              </div>
            </Card>
          )}

          <Card className="mt-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{t("rxDate.title")}</div>
                <p className="text-xs text-muted-foreground">
                  {rx.prescription_date_raw
                    ? t("rxDate.readOnDoc", { value: rx.prescription_date_raw })
                    : t("rxDate.notReadable")}
                  {rx.date_source === "manual" ? ` · ${t("rxDate.manual")}` : ""}
                </p>
              </div>
              <RxDateBadge date={rx.prescription_date} />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Input
                type="date"
                value={rx.prescription_date ?? ""}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => saveDate(e.target.value)}
                className="max-w-[200px]"
              />
              <span className="text-xs text-muted-foreground">{t("rxDate.correctHint")}</span>
            </div>
            {dateStatus === "expired" && (
              <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                {t("rxDate.blockExpired")}
              </div>
            )}
            {dateStatus === "missing" && (
              <div className="mt-3 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
                {t("rxDate.warnMissing")}
              </div>
            )}
          </Card>

          <h2 className="mt-6 text-lg font-semibold">{t("rxDetail.medicines")}</h2>
          <div className="mt-3 space-y-3">
            {items?.length === 0 && (
              <Card className="p-4 text-sm text-muted-foreground">{t("rxDetail.noMedicines")}</Card>
            )}
            {items?.map((it) => (
              <Card key={it.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-2">
                    <Input
                      value={it.medicine_name_raw}
                      onChange={(e) => updateItem(it.id, { medicine_name_raw: e.target.value })}
                      className="font-medium"
                    />
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Input
                        placeholder={t("rxDetail.dosage")}
                        value={it.strength ?? ""}
                        onChange={(e) => updateItem(it.id, { strength: e.target.value })}
                      />
                      <Input
                        placeholder={t("rxDetail.quantity")}
                        value={it.quantity ?? ""}
                        onChange={(e) => updateItem(it.id, { quantity: e.target.value })}
                      />
                      <Input
                        placeholder={t("rxDetail.posology")}
                        value={it.dosage ?? ""}
                        onChange={(e) => updateItem(it.id, { dosage: e.target.value })}
                      />
                      <Input
                        placeholder={t("rxDetail.duration")}
                        value={it.duration ?? ""}
                        onChange={(e) => updateItem(it.id, { duration: e.target.value })}
                      />
                    </div>
                    <Input
                      placeholder={t("rxDetail.instructions")}
                      value={it.instructions ?? ""}
                      onChange={(e) => updateItem(it.id, { instructions: e.target.value })}
                    />
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox
                        checked={it.patient_verified}
                        onCheckedChange={(v) => updateItem(it.id, { patient_verified: !!v })}
                      />
                      {t("rxDetail.verified")}
                    </label>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteItem(it.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {items && items.length > 0 && (
              <Button onClick={autoReserve} disabled={autoBusy || dateBlocked} size="lg">
                {autoBusy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                {t("rxDetail.autoReserve")}
              </Button>
            )}
            {items && items.length > 0 && (
              <Link to="/app/prescriptions/$id/pharmacies" params={{ id }}>
                <Button variant="outline">
                  <MapPin className="mr-2 h-4 w-4" />
                  {t("rxDetail.choosePharm")}
                </Button>
              </Link>
            )}
            {rx.status !== "verified" && items && items.length > 0 && (
              <Button variant="ghost" onClick={markVerified}>
                {t("rxDetail.markVerified")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
