import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Camera,
  Upload,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Store,
  Truck,
  Calendar,
  Check,
  Pill,
  Bike,
} from "lucide-react";
import { uploadPrescriptionFile } from "@/integrations/storage/client";
import { useServerFn } from "@tanstack/react-start";
import { extractPrescription } from "@/lib/pharmacy.functions";
import { createPrescriptionFromUpload, setPrescriptionDate } from "@/lib/prescriptions.functions";
import { quoteReservation, createReservation } from "@/lib/delivery.functions";
import { formatAmount } from "@/lib/payment-config";
import { flagPrescriptionForReview } from "@/lib/review.functions";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { Camera as NativeCamera, CameraResultType, CameraSource } from "@capacitor/camera";
import { useTranslation } from "react-i18next";
import { AutoFlowProgress, type StepState } from "@/components/AutoFlowProgress";
import { parseFlexibleDate, rxDateStatus } from "@/lib/date-utils";
import { DeliveryLocationPicker, type DeliveryLocation } from "@/components/DeliveryLocationPicker";

export const Route = createFileRoute("/_authenticated/app/scan")({
  component: Scan,
});

type Phase = 0 | 1 | 2 | 3 | 4;

type ExtractionResult = {
  confidence: number;
  authenticityScore: number;
  count: number;
  prescriptionDate: string | null;
  prescriptionDateRaw: string | null;
  dateStatus: "valid" | "expired" | "future" | "missing";
  unreadableZones: string[];
  inconsistencies: string[];
  qualityNotes: string | null;
  severity: "critical" | "moderate" | "minor";
  blocking: boolean;
  reasons: string[];
};

type CorrectionState = {
  rxId: string;
  needsDate: boolean;
  needsRetake: boolean;
  reasons: string[];
};

/** Devis d'une pharmacie pour l'ordonnance (étape 2), sans rien créer. */
type Quote = {
  pharmacyId: string;
  name: string;
  address: string | null;
  phone: string | null;
  distanceKm: number;
  matchedCount: number;
  missingCount: number;
  isFull: boolean;
  itemsTotal: number;
  deliveryFee: number;
  totalAmount: number;
  matched: { itemId: string; name: string; price: number | null }[];
  missing: { itemId: string; name: string }[];
  missingItems: {
    itemId: string;
    name: string;
    alternatives: {
      pharmacyId: string;
      name: string;
      address: string | null;
      phone: string | null;
      distanceKm: number;
      price: number | null;
    }[];
  }[];
};

function Scan() {
  const { t } = useTranslation();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const geo = useRef<{ lat: number; lng: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(0);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [correction, setCorrection] = useState<CorrectionState | null>(null);
  const [manualDate, setManualDate] = useState("");
  /** Prescription en cours de parcours (étapes 1 à 3). */
  const [pendingRx, setPendingRx] = useState<string | null>(null);
  const [deliveryLoc, setDeliveryLoc] = useState<DeliveryLocation | null>(null);
  /** Étape 1 : domicile (livrée) ou retrait (par un livreur / soi-même). */
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  /** Étape 2 : devis classés, sans rien créer. */
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const extract = useServerFn(extractPrescription);
  const quoteFn = useServerFn(quoteReservation);
  const createFn = useServerFn(createReservation);
  const flagForReview = useServerFn(flagPrescriptionForReview);
  const createFromUpload = useServerFn(createPrescriptionFromUpload);
  const saveRxDate = useServerFn(setPrescriptionDate);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        geo.current = { lat: p.coords.latitude, lng: p.coords.longitude };
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const getGeo = () =>
    new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (geo.current) return resolve(geo.current);
      if (!("geolocation" in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => {
          geo.current = { lat: p.coords.latitude, lng: p.coords.longitude };
          resolve(geo.current);
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });

  const openCamera = async () => {
    if (!Capacitor.isNativePlatform()) {
      cameraRef.current?.click();
      return;
    }
    try {
      const photo = await NativeCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        saveToGallery: false,
      });
      if (!photo.base64String) return;
      const bin = atob(photo.base64String);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const nativeFile = new File([bytes], `ordonnance.${photo.format ?? "jpg"}`, {
        type: `image/${photo.format ?? "jpeg"}`,
      });
      void run(nativeFile);
    } catch (err) {
      if (err instanceof Error && /cancel/i.test(err.message)) return;
      toast.error(err instanceof Error ? err.message : t("scan.cameraError"));
    }
  };

  /** Lieu + mode sous forme d'entrée serveur (devis puis création). */
  const locData = (loc: DeliveryLocation) =>
    loc.mode === "neighborhood"
      ? {
          neighborhoodId: loc.neighborhoodId,
          patientAddress: loc.detail?.trim() || undefined,
        }
      : {
          patientLat: loc.lat,
          patientLng: loc.lng,
          patientAddress: loc.detail?.trim() || undefined,
        };

  /**
   * Étape 1 : extraction OK. Le lieu (GPS présélectionné si connu) et le mode
   * (domicile / retrait) se choisissent sur le même écran, puis un seul clic
   * lance l'étape 2 (liste des pharmacies classées).
   */
  const continueToStep1 = async (rxId: string) => {
    const pos = await getGeo();
    setDeliveryLoc(pos ? { mode: "gps", lat: pos.lat, lng: pos.lng } : null);
    setFulfillment("delivery");
    setQuotes(null);
    setPendingRx(rxId);
    setPhase(2);
  };

  /** Étape 2 : devis classés (100% en premier), avec prix et suggestions. */
  const loadQuotes = async () => {
    if (!pendingRx || !deliveryLoc) return;
    setQuoting(true);
    setPhase(3);
    try {
      const res = (await quoteFn({
        data: { prescriptionId: pendingRx, ...locData(deliveryLoc), fulfillmentMethod: fulfillment },
      })) as { quotes: Quote[] };
      setQuotes(res.quotes);
    } catch (err) {
      // La recherche a échoué : on rend la main plutôt que de laisser le
      // patient sur un écran bloqué. Lieu et mode restent proposés.
      setPhase(2);
      toast.error(err instanceof Error ? err.message : t("scan.error"));
    } finally {
      setQuoting(false);
    }
  };

  /**
   * Choix de la pharmacie : la commande est créée chez elle (le stock est
   * relu à la création), puis ouvre l'étape 3 (paiement).
   */
  const choosePharmacy = async (pharmacyId: string) => {
    if (!pendingRx || !deliveryLoc || creatingId) return;
    setCreatingId(pharmacyId);
    try {
      const created = (await createFn({
        data: {
          prescriptionId: pendingRx,
          pharmacyId,
          ...locData(deliveryLoc),
          fulfillmentMethod: fulfillment,
        },
      })) as { reservationId: string };
      setPhase(4);
      setPendingRx(null);
      setQuotes(null);
      router.navigate({
        to: "/app/reservations/$id/checkout",
        params: { id: created.reservationId },
      });
    } catch (err) {
      // Stock épuisé entre-temps le plus souvent : le patient relance
      // l'étape 2, qui recalcule les disponibilités.
      toast.error(err instanceof Error ? err.message : t("scan.error"));
    } finally {
      setCreatingId(null);
    }
  };

  /** Retour à l'étape 1 (lieu / mode) depuis la liste des pharmacies. */
  const backToStep1 = () => {
    setQuotes(null);
    setPhase(2);
  };

  const submitManualDate = async () => {
    if (!correction) return;
    const iso = parseFlexibleDate(manualDate);
    if (!iso) {
      toast.error(t("rxDate.notReadable"));
      return;
    }
    const status = rxDateStatus(iso);
    if (status === "expired") {
      toast.error(t("rxDate.blockExpired"));
      return;
    }
    if (status === "future") {
      toast.error(t("rxDate.blockFuture"));
      return;
    }

    try {
      await saveRxDate({
        data: { prescriptionId: correction.rxId, date: iso, raw: manualDate },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("scan.error"));
      return;
    }

    toast.success(t("rxDate.saved"));
    setCorrection(null);
    await continueToStep1(correction.rxId);
  };

  const run = async (file: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    setFailed(null);
    setReview(null);
    setCorrection(null);
    setRunning(true);
    setPhase(1);

    let rxId: string | null = null;
    try {
      const uploaded = await uploadPrescriptionFile(file);
      const inserted = await createFromUpload({
        data: { path: uploaded.path, mime: uploaded.mime || file.type || "image/jpeg" },
      });
      rxId = inserted.id;

      const res = (await extract({ data: { prescriptionId: rxId } })) as ExtractionResult;
      setPhase(2);

      if (res.blocking) {
        // Minor severity: let the patient self-correct before sending to admin
        if (res.severity === "minor" && res.dateStatus === "missing" && res.count > 0) {
          setCorrection({
            rxId,
            needsDate: true,
            needsRetake: res.qualityNotes !== null && res.qualityNotes !== "",
            reasons: res.reasons,
          });
          return;
        }

        // Critical or moderate: send straight to admin review
        await flagForReview({
          data: {
            prescriptionId: rxId,
            reason: res.reasons[0] ?? "Document suspect",
            reasons: res.reasons.map((r) => r.slice(0, 300)),
            severity: res.severity,
            details: {
              confidence: res.confidence,
              authenticityScore: res.authenticityScore,
              dateStatus: res.dateStatus,
              dateRaw: res.prescriptionDateRaw,
              medicinesCount: res.count,
              unreadableZones: res.unreadableZones,
              inconsistencies: res.inconsistencies,
              qualityNotes: res.qualityNotes,
            },
          },
        });
        setReview(res.reasons.join(" · "));
        return;
      }

      await continueToStep1(rxId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("scan.error");
      if (rxId) {
        try {
          await flagForReview({
            data: {
              prescriptionId: rxId,
              reason: msg.slice(0, 200),
              reasons: [`Traitement interrompu : ${msg}`.slice(0, 300)],
              severity: "moderate",
            },
          });
          setReview(`Traitement interrompu : ${msg}`);
          return;
        } catch {
          // fall through to the plain error state
        }
      }
      setFailed(msg);
    } finally {
      setRunning(false);
    }
  };

  const stateOf = (n: Phase): StepState => {
    if (failed && phase === n) return "error";
    if (phase > n) return "done";
    if (phase === n) return "active";
    return "pending";
  };

  const steps = [
    { icon: <ScanLine className="h-4 w-4" />, label: t("auto.step1"), state: stateOf(1) },
    { icon: <ShieldCheck className="h-4 w-4" />, label: t("auto.step2"), state: stateOf(2) },
    { icon: <Store className="h-4 w-4" />, label: t("auto.step3"), state: stateOf(3) },
    { icon: <Truck className="h-4 w-4" />, label: t("auto.step4"), state: stateOf(4) },
  ];

  const reset = () => {
    setPhase(0);
    setFailed(null);
    setReview(null);
    setCorrection(null);
    setPendingRx(null);
    setDeliveryLoc(null);
    setFulfillment("delivery");
    setQuotes(null);
    setQuoting(false);
    setCreatingId(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 py-8">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void run(f);
        }}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void run(f);
        }}
      />

      {phase === 0 && !failed && !review && !correction && (
        <>
          <button
            type="button"
            onClick={openCamera}
            aria-label={t("nav.scan")}
            className="flex h-40 w-40 items-center justify-center rounded-full aurora-bg text-on-aurora shadow-2xl shadow-primary/40 transition-transform active:scale-95"
          >
            <Camera className="h-16 w-16" />
          </button>
          <div className="mt-8 flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-12 w-12 rounded-full border border-border"
              aria-label={t("scan.file")}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-5 w-5" />
            </Button>
            <Link
              to="/app/otc"
              aria-label={t("nav.otc")}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-foreground/70 transition-colors hover:text-foreground"
            >
              <Pill className="h-5 w-5" />
            </Link>
          </div>
        </>
      )}

      {(phase > 0 || failed || review || correction) && (
        <div className="w-full">
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Aperçu de l'ordonnance scannée"
              className="mx-auto mb-6 max-h-52 rounded-2xl border border-border object-contain"
            />
          )}
          <AutoFlowProgress steps={steps} />

          {correction && (
            <div className="mt-6 space-y-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <Calendar className="h-5 w-5 text-accent" />
                <h3 className="font-display text-lg">{t("auto.correctionTitle")}</h3>
              </div>
              <p className="text-sm text-foreground/70">{t("auto.correctionDateHint")}</p>
              {correction.reasons.length > 0 && (
                <ul className="mx-auto max-w-sm space-y-1 rounded-2xl border border-warning/20 bg-warning/5 p-3 text-left text-xs text-foreground/70">
                  {correction.reasons.map((r, i) => (
                    <li key={i}>• {r}</li>
                  ))}
                </ul>
              )}
              <div className="space-y-2 text-left">
                <Label htmlFor="manual-date">{t("rxDate.title")}</Label>
                <Input
                  id="manual-date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  placeholder={t("auto.datePlaceholder")}
                  disabled={running}
                />
              </div>
              {correction.needsRetake && (
                <div className="rounded-2xl border border-warning/20 bg-warning/5 p-3 text-xs text-foreground/70">
                  {t("auto.retakeHint")}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={submitManualDate}
                  disabled={running || !manualDate.trim()}
                  className="flex-1 rounded-full"
                >
                  <Check className="mr-2 h-4 w-4" />
                  {t("common.confirm")}
                </Button>
                <Button
                  onClick={() => {
                    setCorrection(null);
                    reset();
                    openCamera();
                  }}
                  variant="ghost"
                  className="rounded-full"
                >
                  <Camera className="mr-2 h-4 w-4" />
                  {t("auto.retakePhoto")}
                </Button>
              </div>
            </div>
          )}

          {pendingRx && !correction && !review && !failed && !quotes && (
            <div className="mt-6 space-y-4">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <Truck className="h-5 w-5 text-accent" />
                  <h3 className="font-display text-lg">{t("delivery.where")}</h3>
                </div>
                <p className="mt-1 text-sm text-foreground/70">{t("delivery.whereHint")}</p>
              </div>
              <DeliveryLocationPicker
                value={deliveryLoc}
                onChange={setDeliveryLoc}
                disabled={quoting}
              />
              <p className="text-sm text-foreground/70">{t("pay.fulfillment")}</p>
              <div className="grid grid-cols-2 gap-2">
                {(["delivery", "pickup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFulfillment(m)}
                    aria-pressed={fulfillment === m}
                    className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm transition-colors ${
                      fulfillment === m
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-foreground/60"
                    }`}
                  >
                    {m === "delivery" ? <Bike className="h-4 w-4" /> : <Store className="h-4 w-4" />}
                    {m === "delivery" ? t("pay.deliverHome") : t("pay.pickupSelf")}
                  </button>
                ))}
              </div>
              <Button
                onClick={loadQuotes}
                disabled={quoting || !deliveryLoc}
                className="w-full rounded-full"
                size="lg"
              >
                <Check className="mr-2 h-4 w-4" />
                {quoting ? t("auto.step3") : t("pharmacies.seePharmacies")}
              </Button>
            </div>
          )}

          {pendingRx && quotes && !correction && !review && !failed && (
            <div className="mt-6 space-y-4">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <Store className="h-5 w-5 text-accent" />
                  <h3 className="font-display text-lg">{t("pharmacies.title")}</h3>
                </div>
                <p className="mt-1 text-sm text-foreground/70">{t("pharmacies.hint")}</p>
              </div>
              {quotes.length === 0 && (
                <p className="rounded-2xl border border-border p-4 text-center text-sm text-foreground/70">
                  {t("pharmacies.empty")}
                </p>
              )}
              {quotes.map((q) => (
                <div
                  key={q.pharmacyId}
                  className={`rounded-2xl border p-4 ${
                    q.isFull ? "border-success/40 bg-success/5" : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{q.name}</p>
                      <p className="text-xs text-foreground/60">
                        {q.distanceKm} km
                        {q.address ? ` · ${q.address}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        q.isFull
                          ? "bg-success/15 text-success"
                          : "bg-warning/15 text-warning"
                      }`}
                    >
                      {q.isFull
                        ? t("pharmacies.full")
                        : `${q.matchedCount}/${q.matchedCount + q.missingCount}`}
                    </span>
                  </div>
                  <dl className="mt-2 space-y-0.5 text-sm tabular-nums">
                    <div className="flex justify-between">
                      <dt className="text-foreground/60">{t("pay.items")}</dt>
                      <dd>{formatAmount(q.itemsTotal)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-foreground/60">{t("pay.delivery")}</dt>
                      <dd>{formatAmount(q.deliveryFee)}</dd>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <dt>{t("pay.total")}</dt>
                      <dd>{formatAmount(q.totalAmount)}</dd>
                    </div>
                  </dl>
                  {q.missing.length > 0 && (
                    <div className="mt-2 text-xs text-foreground/70">
                      <p className="font-semibold">{t("pharmacies.missing")}</p>
                      <ul className="mt-1 space-y-1">
                        {q.missingItems.map((m) => (
                          <li key={m.itemId}>
                            • {m.name}
                            {m.alternatives.length > 0 && (
                              <span className="text-foreground/60">
                                {" "}
                                — {t("pharmacies.availableAt")}{" "}
                                {m.alternatives
                                  .map(
                                    (a) =>
                                      `${a.name} (${formatAmount(a.price)} · ${a.distanceKm} km)`,
                                  )
                                  .join(", ")}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Button
                    onClick={() => choosePharmacy(q.pharmacyId)}
                    disabled={creatingId !== null}
                    className="mt-3 w-full rounded-full"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    {creatingId === q.pharmacyId ? t("auto.step4") : t("pharmacies.choose")}
                  </Button>
                </div>
              ))}
              <Button onClick={backToStep1} variant="ghost" className="w-full rounded-full">
                {t("pharmacies.retry")}
              </Button>
            </div>
          )}

          {review && !correction && (
            <div className="mt-6 space-y-3 text-center">
              <ShieldAlert className="mx-auto h-8 w-8 text-warning" />
              <p className="text-sm text-foreground">{t("auto.review")}</p>
              <ul className="mx-auto max-w-sm space-y-1 rounded-2xl border border-warning/20 bg-warning/5 p-3 text-left text-xs text-foreground/70">
                {review.split(" · ").map((r, i) => (
                  <li key={i}>• {r}</li>
                ))}
              </ul>
              <Button onClick={reset} variant="ghost" className="rounded-full">
                {t("auto.retry")}
              </Button>
            </div>
          )}

          {failed && !correction && (
            <div className="mt-6 space-y-3 text-center">
              <p className="text-sm text-destructive">{failed}</p>
              <Button onClick={reset} disabled={running} className="rounded-full">
                <RotateCcw className="mr-2 h-4 w-4" />
                {t("auto.retry")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
