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
} from "lucide-react";
import { uploadPrescriptionFile } from "@/integrations/storage/client";
import { useServerFn } from "@tanstack/react-start";
import { extractPrescription } from "@/lib/pharmacy.functions";
import { createPrescriptionFromUpload, setPrescriptionDate } from "@/lib/prescriptions.functions";
import { autoRouteReservation } from "@/lib/delivery.functions";
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
  /** Prescription waiting for the patient to choose a delivery location. */
  const [pendingRx, setPendingRx] = useState<string | null>(null);
  const [deliveryLoc, setDeliveryLoc] = useState<DeliveryLocation | null>(null);
  const [routing, setRouting] = useState(false);
  const extract = useServerFn(extractPrescription);
  const autoRoute = useServerFn(autoRouteReservation);
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

  /** Extraction is done: ask the patient where to deliver before routing. */
  const continueToRouting = async (rxId: string) => {
    const pos = geo.current;
    setDeliveryLoc(pos ? { mode: "gps", lat: pos.lat, lng: pos.lng } : null);
    setPendingRx(rxId);
  };

  const confirmDelivery = async () => {
    if (!pendingRx || !deliveryLoc) return;
    setRouting(true);
    setPhase(3);
    try {
      const routed = await autoRoute({
        data:
          deliveryLoc.mode === "neighborhood"
            ? {
                prescriptionId: pendingRx,
                neighborhoodId: deliveryLoc.neighborhoodId,
                patientAddress: deliveryLoc.detail?.trim() || undefined,
              }
            : {
                prescriptionId: pendingRx,
                patientLat: deliveryLoc.lat,
                patientLng: deliveryLoc.lng,
                patientAddress: deliveryLoc.detail?.trim() || undefined,
              },
      });
      setPhase(4);
      setPendingRx(null);
      router.navigate({
        to: "/app/reservations/$id/checkout",
        params: { id: routed.reservationId },
      });
    } catch (err) {
      setPhase(2);
      toast.error(err instanceof Error ? err.message : t("scan.error"));
    } finally {
      setRouting(false);
    }
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
    await continueToRouting(correction.rxId);
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

      await continueToRouting(rxId);
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
            className="flex h-40 w-40 items-center justify-center rounded-full aurora-bg text-primary-foreground shadow-2xl shadow-primary/40 transition-transform active:scale-95"
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

          {pendingRx && !correction && !review && !failed && (
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
                disabled={routing}
              />
              <Button
                onClick={confirmDelivery}
                disabled={routing || !deliveryLoc}
                className="w-full rounded-full"
                size="lg"
              >
                <Check className="mr-2 h-4 w-4" />
                {routing ? t("auto.step3") : t("delivery.confirm")}
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
