import { createFileRoute, Link } from "@tanstack/react-router";

import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { Map as LeafletMap, Marker as LeafletMarker, Polyline as LeafletPolyline } from "leaflet";
import { getReservationTracking } from "@/lib/reservations.functions";
import { subscribeRealtime } from "@/integrations/realtime/client";
import { getDeliveryRoute } from "@/lib/delivery.functions";
import { loadLeaflet, decodePolyline, letterIcon, dotIcon } from "@/lib/osmap";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, MapPin, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { MissingItemsPanel, type MissingEntry } from "@/components/MissingItemsPanel";
export const Route = createFileRoute("/_authenticated/app/reservations/$id/track")({
  component: TrackPage,
});

type Reservation = {
  id: string;
  status: string;
  delivery_status: string;
  is_partial: boolean;
  missing_items: MissingEntry[];
  prescription_id: string;
  neighborhood_id: string | null;
  patient_address: string | null;
  patient_lat: number | null;
  patient_lng: number | null;
  courier_id: string | null;
  fulfillment_method: string;
  pickup_code: string | null;
  receipt_code: string | null;
  pharmacies: {
    name: string;
    lat: number | null;
    lng: number | null;
    address: string;
    phone: string | null;
  } | null;
  couriers: {
    id: string;
    full_name: string;
    phone: string;
    current_lat: number | null;
    current_lng: number | null;
    vehicle_type: string;
  } | null;
};

function TrackPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const [res, setRes] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const markers = useRef<{
    pharm?: LeafletMarker;
    patient?: LeafletMarker;
    courier?: LeafletMarker;
    route?: LeafletPolyline;
  }>({});
  const getRoute = useServerFn(getDeliveryRoute);

  // Load reservation
  const load = async () => {
    const data = await getReservationTracking({ data: { id } }).catch(() => null);
    if (data) setRes(data as unknown as Reservation);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Realtime updates
    return subscribeRealtime(
      [
        { table: "reservations", event: "UPDATE", filter: { id } },
        { table: "courier_positions", event: "INSERT", filter: { reservation_id: id } },
      ],
      (payload) => {
        if (payload.table === "reservations") {
          load();
          return;
        }
        const p = payload.new as { lat: number; lng: number };
        if (markers.current.courier && mapInstance.current) {
          markers.current.courier.setLatLng([p.lat, p.lng]);
        }
      },
      { onResync: () => load() },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Init map
  useEffect(() => {
    if (!res || !mapRef.current || mapInstance.current) return;
    const pharm = res.pharmacies;
    if (!pharm?.lat || !pharm?.lng || !res.patient_lat || !res.patient_lng) return;

    loadLeaflet()
      .then((L) => {
        const map = L.map(mapRef.current!, {
          center: [res.patient_lat!, res.patient_lng!],
          zoom: 13,
          zoomControl: true,
        });
        mapInstance.current = map;
        // Tuiles OpenStreetMap (sans clé).
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap",
        }).addTo(map);

        markers.current.pharm = L.marker([pharm.lat!, pharm.lng!], {
          icon: letterIcon(L, "P", "#2563eb"),
          title: pharm.name,
        }).addTo(map);
        markers.current.patient = L.marker([res.patient_lat!, res.patient_lng!], {
          icon: letterIcon(L, "V", "#dc2626"),
          title: "Vous",
        }).addTo(map);

        // Fit bounds
        map.fitBounds(
          L.latLngBounds([
            [pharm.lat!, pharm.lng!],
            [res.patient_lat!, res.patient_lng!],
          ]),
          { padding: [60, 60] },
        );

        // Fetch directions (OSRM côté serveur, polyline encodée en retour)
        getRoute({
          data: {
            originLat: pharm.lat!,
            originLng: pharm.lng!,
            destLat: res.patient_lat!,
            destLng: res.patient_lng!,
          },
        })
          .then((r) => {
            if (r.polyline) {
              const path = decodePolyline(r.polyline);
              markers.current.route = L.polyline(
                path.map((pt) => L.latLng(pt.lat, pt.lng)),
                { color: "#2563eb", opacity: 0.85, weight: 4 },
              ).addTo(map);
            }
          })
          .catch(() => {});
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Carte indisponible"),
      );
  }, [res, getRoute]);

  // Courier marker
  useEffect(() => {
    if (!mapInstance.current || !res?.couriers) return;
    const c = res.couriers;
    if (!c.current_lat || !c.current_lng) return;
    if (!markers.current.courier) {
      loadLeaflet()
        .then((L) => {
          markers.current.courier = L.marker([c.current_lat!, c.current_lng!], {
            icon: dotIcon(L, "#16a34a"),
            title: c.full_name,
          }).addTo(mapInstance.current!);
        })
        .catch(() => {});
    } else {
      markers.current.courier.setLatLng([c.current_lat, c.current_lng]);
    }
  }, [res]);

  if (loading)
    return (
      <div className="p-8">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (!res) return <div className="p-8">{t("track.notFound")}</div>;

  const isPickup = res.fulfillment_method === "pickup";

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-center gap-2">
        <Link to="/app/reservations" className="text-sm text-muted-foreground hover:underline">
          {t("track.back")}
        </Link>
      </div>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">
        {isPickup ? t("track.pickupTitle") : t("track.title")}
      </h1>

      {!isPickup && (
        <Card className="mt-4 overflow-hidden">
          <div ref={mapRef} className="h-[400px] w-full bg-muted" />
        </Card>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            {t("track.pickupCode")}
          </div>
          <div className="mt-1 text-3xl font-bold tracking-[0.3em] tabular-nums">
            {res.fulfillment_method === "pickup" ? (res.pickup_code ?? "——————") : "••••••"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {res.fulfillment_method === "pickup"
              ? t("track.pickupCodeHintPickup")
              : t("track.pickupCodeHint")}
          </p>
        </Card>
        {res.fulfillment_method !== "pickup" && (
          <Card className="p-4">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              {t("track.receiptCode")}
            </div>
            <div className="mt-1 text-3xl font-bold tracking-[0.3em] tabular-nums">
              {res.receipt_code ?? "——————"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("track.receiptCodeHint")}</p>
          </Card>
        )}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">
              {isPickup ? t("track.pickupTitle") : t("track.deliveryStatus")}
            </div>
            <Badge>
              {isPickup
                ? t("track.pickupStatus")
                : (t(`track.s.${res.delivery_status}`, {
                    defaultValue: res.delivery_status,
                  }) as string)}
            </Badge>
          </div>
          {res.pharmacies && (
            <div className="mt-3 flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <div className="font-medium">{res.pharmacies.name}</div>
                <div className="text-xs text-muted-foreground">{res.pharmacies.address}</div>
              </div>
            </div>
          )}
        </Card>

        {!isPickup && (
          <Card className="p-4">
            <div className="text-sm font-semibold">{t("track.courier")}</div>
            {res.couriers ? (
              <div className="mt-2 space-y-2">
                <div className="font-medium">{res.couriers.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {t("track.vehicle")} : {res.couriers.vehicle_type}
                </div>
                <a
                  href={`tel:${res.couriers.phone}`}
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Phone className="h-4 w-4" /> {res.couriers.phone}
                </a>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" /> {t("track.waiting")}
              </div>
            )}
          </Card>
        )}
      </div>

      {res.is_partial && res.missing_items.length > 0 && (
        <MissingItemsPanel
          className="mt-4"
          prescriptionId={res.prescription_id}
          missingItems={res.missing_items}
          current={{
            neighborhoodId: res.neighborhood_id,
            lat: res.patient_lat,
            lng: res.patient_lng,
            address: res.patient_address,
          }}
        />
      )}
    </div>
  );
}
