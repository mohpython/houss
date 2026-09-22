import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { respondToReservation } from "@/lib/pharmacy.functions";
import { assignCourier } from "@/lib/delivery.functions";
import { confirmPaymentReceived } from "@/lib/payment.functions";
import { verifyPickupCode } from "@/lib/fulfillment.functions";
import { Input } from "@/components/ui/input";
import { formatAmount } from "@/lib/payment-config";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RxDateBadge } from "@/components/RxDateBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { FileText } from "lucide-react";

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
  const verifyPickup = useServerFn(verifyPickupCode);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const handOver = async (rid: string) => {
    setCheckingId(rid);
    try {
      await verifyPickup({ data: { reservationId: rid, code: (codes[rid] ?? "").trim() } });
      toast.success("Code validé — colis remis");
      setCodes((c) => ({ ...c, [rid]: "" }));
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Code incorrect");
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
        r.courierName ? `Paiement confirmé · livreur ${r.courierName}` : "Paiement confirmé",
      );
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const load = async () => {
    const { data } = await supabase
      .from("reservations")
      .select(
        "id, status, delivery_status, created_at, notes, prescription_id, payment_status, payment_method, payment_reference, total_amount, fulfillment_method, patient_name, patient_phone, pickup_code_verified_at, prescriptions(file_path, file_mime, patient_name, doctor_name, hospital, prescription_date, ai_confidence), reservation_items(id, available, price, unit_price, prescription_items(medicine_name_raw, strength, quantity, dosage, duration, instructions))",
      )
      .eq("pharmacy_id", pharmacyId)
      .order("created_at", { ascending: false });
    const list = (data as unknown as R[]) ?? [];
    setRows(list);
    const urls: Record<string, string> = {};
    await Promise.all(
      list.map(async (r) => {
        const path = r.prescriptions?.file_path;
        if (!path) return;
        const { data: s } = await supabase.storage
          .from("prescriptions")
          .createSignedUrl(path, 3600);
        if (s?.signedUrl) urls[r.id] = s.signedUrl;
      }),
    );
    setRxUrls(urls);
  };
  useEffect(() => {
    load();
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
          toast.success(`Livreur assigné : ${r.courierName}`);
        } catch (e) {
          toast.warning(e instanceof Error ? e.message : "Livreur non assigné");
        }
      } else {
        toast.success("Mis à jour");
      }
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold">Réservations entrantes</h2>
      <div className="mt-3 space-y-3">
        {rows === null && <Skeleton className="h-24 w-full" />}
        {rows?.length === 0 && (
          <Card className="p-4 text-sm text-muted-foreground">Aucune réservation.</Card>
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
                    {new Date(r.created_at).toLocaleString("fr-FR")}
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
                  <Badge variant="secondary">{r.status}</Badge>
                  <Badge
                    variant="secondary"
                    className={
                      r.payment_status === "paid"
                        ? "border border-success/30 bg-success/10 text-success"
                        : "border border-warning/30 bg-warning/10 text-warning"
                    }
                  >
                    {r.payment_status === "paid" ? "Payé" : "Paiement à vérifier"} ·{" "}
                    {formatAmount(r.total_amount)}
                  </Badge>
                  {r.payment_reference && (
                    <span className="text-[10px] text-muted-foreground">
                      Réf. {r.payment_reference}
                    </span>
                  )}
                  {r.prescriptions?.ai_confidence !== null &&
                    r.prescriptions?.ai_confidence !== undefined && (
                      <span className="text-[10px] text-muted-foreground">
                        IA {r.prescriptions.ai_confidence}%
                      </span>
                    )}
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Médicaments extraits par l'IA
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
                            {p.quantity && <span>Qté: {p.quantity}</span>}
                            {p.dosage && <span>Posologie: {p.dosage}</span>}
                            {p.duration && <span>Durée: {p.duration}</span>}
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
                    Ordonnance originale
                  </div>
                  {rxUrl ? (
                    isImage ? (
                      <a href={rxUrl} target="_blank" rel="noreferrer">
                        <img
                          src={rxUrl}
                          alt="Ordonnance"
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
                        Ouvrir l'ordonnance (PDF)
                      </a>
                    )
                  ) : (
                    <div className="rounded border border-dashed p-4 text-xs text-muted-foreground">
                      Aucun fichier
                    </div>
                  )}
                </div>
              </div>

              {r.notes && <div className="mt-3 rounded bg-muted p-2 text-sm">{r.notes}</div>}

              <div className="mt-3 rounded-lg border p-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  {r.fulfillment_method === "pickup"
                    ? "Retrait par le client"
                    : "Remise au livreur"}
                </div>
                <div className="mt-1 text-sm">
                  {r.patient_name ?? "Client"}
                  {r.patient_phone && (
                    <a href={`tel:${r.patient_phone}`} className="ml-2 text-primary">
                      {r.patient_phone}
                    </a>
                  )}
                </div>
                {r.pickup_code_verified_at ? (
                  <p className="mt-2 text-sm text-success">Code validé, colis remis.</p>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      value={codes[r.id] ?? ""}
                      onChange={(e) => setCodes((c) => ({ ...c, [r.id]: e.target.value }))}
                      placeholder="Code de retrait"
                      aria-label="Code de retrait"
                    />
                    <Button
                      size="sm"
                      disabled={checkingId === r.id || (codes[r.id] ?? "").trim().length < 4}
                      onClick={() => handOver(r.id)}
                    >
                      Valider
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {r.payment_status === "pending_verification" && (
                  <Button size="sm" variant="outline" onClick={() => markPaid(r.id)}>
                    Confirmer le paiement reçu
                  </Button>
                )}

                {r.status === "pending" && (
                  <>
                    <Button size="sm" onClick={() => act(r.id, "accepted")}>
                      Accepter
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act(r.id, "rejected")}>
                      Refuser
                    </Button>
                  </>
                )}
                {r.status === "accepted" && (
                  <Button size="sm" onClick={() => act(r.id, "ready")}>
                    Marquer prête
                  </Button>
                )}
                {r.status === "ready" &&
                  r.pickup_code_verified_at &&
                  r.fulfillment_method === "pickup" && (
                    <Button size="sm" onClick={() => act(r.id, "completed")}>
                      Marquer récupérée
                    </Button>
                  )}
                {r.status === "ready" &&
                  r.pickup_code_verified_at &&
                  r.fulfillment_method !== "pickup" && (
                    <span className="text-xs text-muted-foreground">
                      Colis remis au livreur — la livraison sera confirmée par le code du patient.
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
