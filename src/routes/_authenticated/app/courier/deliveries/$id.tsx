/// <reference types="google.maps" />
import { createFileRoute, Link } from "@tanstack/react-router";

import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCourierDelivery } from "@/lib/courier.functions";
import { getDeliveryRoute, updateDeliveryStatus } from "@/lib/delivery.functions";
import { verifyReceiptCode } from "@/lib/fulfillment.functions";
import { Input } from "@/components/ui/input";
import { loadGoogleMaps, decodePolyline } from "@/lib/gmaps";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ExternalLink, Phone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/courier/deliveries/$id")({
  component: DeliveryPage,
});

type Delivery = {
  id: string;
  delivery_status: string;
  patient_lat: number | null;
  patient_lng: number | null;
  patient_address: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  pickup_code: string | null;
  pickup_code_verified_at: string | null;
  receipt_code_verified_at: string | null;
  pharmacies: {
    name: string;
    address: string;
    phone: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  reservation_items: Array<{
    prescription_items: {
      medicine_name_raw: string;
      strength: string | null;
      quantity: string | null;
    } | null;
  }>;
};

const NEXT: Record<string, "picked_up" | "en_route" | "delivered" | null> = {
  assigned: "picked_up",
  picked_up: "en_route",
  en_route: "delivered",
  delivered: null,
};
const NEXT_LABEL: Record<string, string> = {
  picked_up: "J'ai récupéré la commande",
  en_route: "Je pars livrer",
  delivered: "Livraison effectuée",
};

function DeliveryPage() {
  const { id } = Route.useParams();
  const [d, setD] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const getRoute = useServerFn(getDeliveryRoute);
  const updateStatus = useServerFn(updateDeliveryStatus);
  const verifyReceipt = useServerFn(verifyReceiptCode);
  const [receiptCode, setReceiptCode] = useState("");
  const [checking, setChecking] = useState(false);

  const confirmReceipt = async () => {
    setChecking(true);
    try {
      await verifyReceipt({ data: { reservationId: id, code: receiptCode.trim() } });
      toast.success("Livraison confirmée");
      setReceiptCode("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Code incorrect");
    } finally {
      setChecking(false);
    }
  };

  const load = async () => {
    const data = await getCourierDelivery({ data: { id } }).catch(() => null);
    if (data) setD(data as unknown as Delivery);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!d || !mapRef.current || mapInstance.current) return;
    const pharm = d.pharmacies;
    const hasPharm = !!(pharm?.lat && pharm?.lng);
    const hasPatient = !!(d.patient_lat && d.patient_lng);
    if (!hasPharm && !hasPatient) return;

    loadGoogleMaps().then((google) => {
      const center = hasPharm
        ? { lat: pharm!.lat!, lng: pharm!.lng! }
        : { lat: d.patient_lat!, lng: d.patient_lng! };
      const map = new google.maps.Map(mapRef.current!, {
        center,
        zoom: 14,
        disableDefaultUI: true,
        zoomControl: true,
      });
      mapInstance.current = map;
      if (hasPharm) {
        new google.maps.Marker({
          position: { lat: pharm!.lat!, lng: pharm!.lng! },
          map,
          label: "P",
        });
      }
      if (hasPatient) {
        new google.maps.Marker({
          position: { lat: d.patient_lat!, lng: d.patient_lng! },
          map,
          label: "V",
        });
      }
      if (hasPharm && hasPatient) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: pharm!.lat!, lng: pharm!.lng! });
        bounds.extend({ lat: d.patient_lat!, lng: d.patient_lng! });
        map.fitBounds(bounds, 60);

        getRoute({
          data: {
            originLat: pharm!.lat!,
            originLng: pharm!.lng!,
            destLat: d.patient_lat!,
            destLng: d.patient_lng!,
          },
        })
          .then((r) => {
            if (r.polyline) {
              new google.maps.Polyline({
                path: decodePolyline(r.polyline),
                strokeColor: "#2563eb",
                strokeOpacity: 0.85,
                strokeWeight: 4,
                map,
              });
            }
          })
          .catch(() => {});
      }
    });
  }, [d, getRoute]);

  const advance = async () => {
    if (!d) return;
    const next = NEXT[d.delivery_status];
    if (!next) return;
    try {
      await updateStatus({ data: { reservationId: d.id, status: next } });
      toast.success("Statut mis à jour");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  if (loading)
    return (
      <div className="p-8">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (!d) return <div className="p-8">Course introuvable.</div>;

  const pharm = d.pharmacies;
  // La récupération en pharmacie et la livraison finale se valident par code.
  const next = d.delivery_status === "picked_up" ? NEXT[d.delivery_status] : null;
  const isPickup = d.delivery_status === "assigned";
  const dest =
    isPickup && pharm?.lat && pharm?.lng
      ? `${pharm.lat},${pharm.lng}`
      : d.patient_lat && d.patient_lng
        ? `${d.patient_lat},${d.patient_lng}`
        : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link to="/app/courier" className="text-sm text-muted-foreground hover:underline">
        ← Retour
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Course</h1>

      <Card className="mt-4 overflow-hidden">
        <div ref={mapRef} className="h-[350px] w-full bg-muted" />
      </Card>
      {(!d.patient_lat || !d.patient_lng) && (
        <p className="mt-2 text-xs text-warning">
          Position du patient non fournie — contactez-le pour l'adresse exacte.
        </p>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Retrait</div>
          <div className="mt-1 font-medium">{pharm?.name}</div>
          <div className="text-xs text-muted-foreground">{pharm?.address}</div>
          {pharm?.phone && (
            <a
              href={`tel:${pharm.phone}`}
              className="mt-2 inline-flex items-center gap-1 text-sm text-primary"
            >
              <Phone className="h-3 w-3" /> {pharm.phone}
            </a>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Livraison</div>
          <div className="mt-1 font-medium">{d.patient_name ?? "Client"}</div>
          <div className="text-xs text-muted-foreground">{d.patient_address ?? "Voir carte"}</div>
          {d.patient_phone && (
            <a
              href={`tel:${d.patient_phone}`}
              className="mt-2 inline-flex items-center gap-1 text-sm text-primary"
            >
              <Phone className="h-3 w-3" /> {d.patient_phone}
            </a>
          )}
        </Card>
      </div>

      <Card className="mt-4 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Articles</div>
          <Badge>{d.delivery_status}</Badge>
        </div>
        <ul className="mt-2 text-sm">
          {d.reservation_items.map((i, idx) => (
            <li key={idx}>
              • {i.prescription_items?.medicine_name_raw}{" "}
              <span className="text-muted-foreground">
                {i.prescription_items?.strength} {i.prescription_items?.quantity}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-4 p-4">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Codes</div>
        {!d.pickup_code_verified_at ? (
          <>
            <p className="mt-2 text-sm">Donnez ce code à la pharmacie pour récupérer le colis :</p>
            <div className="mt-1 text-3xl font-bold tracking-[0.3em] tabular-nums">
              {d.pickup_code ?? "——————"}
            </div>
          </>
        ) : !d.receipt_code_verified_at ? (
          <div className="mt-2 space-y-2">
            <p className="text-sm">Saisissez le code de réception donné par le client :</p>
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                maxLength={6}
                value={receiptCode}
                onChange={(e) => setReceiptCode(e.target.value)}
                placeholder="123456"
                aria-label="Code de réception"
              />
              <Button onClick={confirmReceipt} disabled={checking || receiptCode.trim().length < 4}>
                Valider
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-success">Livraison validée par le client.</p>
        )}
      </Card>

      <div className="mt-4 flex flex-wrap gap-2">
        {next && (
          <Button onClick={advance} size="lg">
            {NEXT_LABEL[next]}
          </Button>
        )}
        {dest && (
          <Button asChild variant="outline" size="lg">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Ouvrir dans Maps
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
