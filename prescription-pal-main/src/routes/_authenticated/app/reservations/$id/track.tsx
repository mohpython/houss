import { createFileRoute, Link } from "@tanstack/react-router";

import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import type {
  Map as LeafletMap,
  Marker as LeafletMarker,
  Polyline as LeafletPolyline,
} from "leaflet";
import { getReservationTracking } from "@/lib/reservations.functions";
import { subscribeRealtime } from "@/integrations/realtime/client";
import { getDeliveryRoute } from "@/lib/delivery.functions";
import { loadLeaflet, decodePolyline, letterIcon, dotIcon } from "@/lib/osmap";
import { SpeakButton } from "@/components/speak-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, MapPin, Clock, Check } from "lucide-react";
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
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
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
  const { t, i18n } = useTranslation();
  const { id } = Route.useParams();
  const [res, setRes] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const mapInit = useRef(false);
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
    if (!res || !mapRef.current || mapInstance.current || mapInit.current) return;
    const pharm = res.pharmacies;
    if (!pharm?.lat || !pharm?.lng || !res.patient_lat || !res.patient_lng) return;

    mapInit.current = true;
    loadLeaflet()
      .then((L) => {
        const map = L.map(mapRef.current!, {
          center: [res.patient_lat!, res.patient_lng!],
          zoom: 13,
          zoomControl: true,
        });
        mapInstance.current = map;
        // Tuiles sombres CARTO, assorties au fond vert de la maquette.
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          maxZoom: 20,
          attribution: "&copy; OpenStreetMap &copy; CARTO",
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
      .catch((e: unknown) => {
        mapInit.current = false;
        toast.error(e instanceof Error ? e.message : t("track.mapUnavailable"));
      });
  }, [res, getRoute]);

  // Nettoyage de la carte au démontage (évite les fuites et la double init
  // observée en StrictMode).
  useEffect(() => {
    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
      markers.current = {};
    };
  }, []);

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
  const orderNo = res.id.split("-")[0].toUpperCase();
  const time = (value: string | null) =>
    value
      ? new Date(value).toLocaleTimeString(i18n.language, {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
  const steps = isPickup
    ? [
        { label: t("track.stepReceived"), at: res.created_at, done: true },
        {
          label: t("track.stepPrepared"),
          at: res.accepted_at,
          done: Boolean(res.accepted_at),
        },
        { label: t("track.stepReady"), at: res.ready_at, done: Boolean(res.ready_at) },
        {
          label: t("track.stepPickedUp"),
          at: res.delivered_at,
          done: Boolean(res.delivered_at),
        },
      ]
    : [
        { label: t("track.stepReceived"), at: res.created_at, done: true },
        {
          label: t("track.stepPrepared"),
          at: res.accepted_at,
          done: Boolean(res.accepted_at),
        },
        {
          label: t("track.stepDelivering"),
          at: res.picked_up_at,
          done: Boolean(res.picked_up_at),
        },
        {
          label: t("track.stepDelivered"),
          at: res.delivered_at,
          done: Boolean(res.delivered_at),
        },
      ];
  const statusLabel = isPickup
    ? t("track.pickupStatus")
    : (t(`track.s.${res.delivery_status}`, {
        defaultValue: res.delivery_status,
      }) as string);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#04150f] text-emerald-50">
      <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/app/reservations"
            className="text-xs font-semibold text-emerald-200/65 transition hover:text-emerald-200"
          >
            {t("track.back")}
          </Link>
          <SpeakButton
            phrase={isPickup ? "track.pickup" : "track.delivery"}
            text={[
              isPickup ? t("track.pickupTitle") : t("track.title"),
              t("track.pickupCode"),
              res.fulfillment_method === "pickup"
                ? t("track.pickupCodeHintPickup")
                : t("track.pickupCodeHint"),
              t("resStatus." + res.status, res.status),
            ].join(". ")}
          />
        </div>

        <section className="relative mt-3 overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-gradient-to-br from-emerald-700/80 via-emerald-900/80 to-[#06251b] p-5 shadow-2xl shadow-emerald-950/50 md:p-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-emerald-300/15 blur-3xl" />
          <div className="relative flex items-start justify-between gap-2">
            <div className="min-w-0 max-w-[64%]">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/25 bg-emerald-300/10 px-3 py-1 text-[11px] font-bold text-emerald-50">
                <img
                  src="/icons3d/tracking.png"
                  alt=""
                  aria-hidden
                  className="h-4 w-4 object-contain"
                />
                {t("track.title")}
              </span>
              <h1 className="mt-3 text-[2rem] font-extrabold leading-[1.05] tracking-tight text-white md:text-4xl">
                {t("track.heroLead")}{" "}
                <span className="text-yellow-300">{t("track.heroHighlight")}</span>
              </h1>
              <p className="mt-2 text-xs leading-relaxed text-emerald-100/75 md:text-sm">
                {t("track.heroDesc")}
              </p>
            </div>
            <div className="relative shrink-0">
              <div className="absolute inset-2 rounded-full bg-emerald-300/20 blur-2xl" />
              <img
                src={isPickup ? "/icons3d/pharmacy.png" : "/icons3d/scooter.png"}
                alt=""
                aria-hidden
                className="relative h-28 w-28 object-contain drop-shadow-2xl md:h-36 md:w-36"
              />
              <span className="absolute -right-1 -top-1 grid h-8 w-8 place-items-center rounded-full border border-yellow-300/60 bg-[#0a2a20] text-yellow-300 shadow-lg shadow-yellow-500/20">
                <MapPin className="h-4 w-4" />
              </span>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-[1.6rem] border border-emerald-300/15 bg-[#0a2a20]/90 p-4 shadow-xl shadow-black/30 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold text-emerald-100/60">
              {t("track.orderLabel", { id: orderNo })}
            </div>
            <span className="inline-flex items-center rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-[10.5px] font-bold text-emerald-200">
              {statusLabel}
            </span>
          </div>
          {res.pharmacies && (
            <div className="mt-3 flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-emerald-300/20 bg-white/[0.04]">
                <img
                  src="/icons3d/pharmacy.png"
                  alt=""
                  aria-hidden
                  className="h-8 w-8 object-contain"
                />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-white">{res.pharmacies.name}</div>
                <div className="truncate text-xs text-emerald-100/55">{res.pharmacies.address}</div>
              </div>
            </div>
          )}
          <div className="mt-5 grid grid-cols-4 gap-1">
            {steps.map((step, index) => (
              <div key={step.label} className="flex flex-col items-center">
                <div className="flex w-full items-center">
                  <div
                    className={`h-0.5 flex-1 ${
                      index === 0
                        ? "bg-transparent"
                        : step.done
                          ? "bg-emerald-300"
                          : "bg-emerald-300/20"
                    }`}
                  />
                  <div
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[11px] ${
                      step.done
                        ? "border-emerald-300 bg-emerald-300 text-emerald-950"
                        : "border-emerald-300/25 bg-[#02100b] text-emerald-100/50"
                    }`}
                  >
                    {step.done ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </div>
                  <div
                    className={`h-0.5 flex-1 ${
                      index === steps.length - 1
                        ? "bg-transparent"
                        : steps[index + 1].done
                          ? "bg-emerald-300"
                          : "bg-emerald-300/20"
                    }`}
                  />
                </div>
                <div
                  className={`mt-1.5 text-center text-[10px] font-semibold leading-tight ${
                    step.done ? "text-white" : "text-emerald-100/45"
                  }`}
                >
                  {step.label}
                </div>
                <div className="text-[9px] text-emerald-100/40">{time(step.at)}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-emerald-300/15 bg-[#0a2a20]/90 p-4">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-100/55">
              {t("track.pickupCode")}
            </div>
            <div className="mt-1 text-3xl font-extrabold tracking-[0.3em] text-white tabular-nums">
              {res.fulfillment_method === "pickup" ? (res.pickup_code ?? "——————") : "••••••"}
            </div>
            <p className="mt-1 text-xs text-emerald-100/50">
              {res.fulfillment_method === "pickup"
                ? t("track.pickupCodeHintPickup")
                : t("track.pickupCodeHint")}
            </p>
          </div>
          {res.fulfillment_method !== "pickup" && (
            <div className="rounded-2xl border border-emerald-300/15 bg-[#0a2a20]/90 p-4">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-100/55">
                {t("track.receiptCode")}
              </div>
              <div className="mt-1 text-3xl font-extrabold tracking-[0.3em] text-white tabular-nums">
                {res.receipt_code ?? "——————"}
              </div>
              <p className="mt-1 text-xs text-emerald-100/50">{t("track.receiptCodeHint")}</p>
            </div>
          )}
        </div>

        {!isPickup && (
          <div className="mt-4 overflow-hidden rounded-[1.6rem] border border-emerald-300/15 bg-[#0a2a20]/90">
            <div className="flex items-center gap-2 px-4 pt-4 text-sm font-bold text-white">
              <MapPin className="h-4 w-4 text-emerald-300" />
              {t("track.mapTitle")}
            </div>
            <div ref={mapRef} className="mt-3 h-[360px] w-full bg-[#02100b]" />
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-300/15 bg-[#0a2a20]/90 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-white">
                {isPickup ? t("track.pickupTitle") : t("track.deliveryStatus")}
              </div>
              <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                {statusLabel}
              </span>
            </div>
            {res.pharmacies && (
              <div className="mt-3 flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <div>
                  <div className="font-medium text-white">{res.pharmacies.name}</div>
                  <div className="text-xs text-emerald-100/50">{res.pharmacies.address}</div>
                </div>
              </div>
            )}
          </div>

          {!isPickup && (
            <div className="rounded-2xl border border-emerald-300/15 bg-[#0a2a20]/90 p-4">
              <div className="text-sm font-bold text-white">{t("track.courier")}</div>
              {res.couriers ? (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <img
                      src="/icons3d/scooter.png"
                      alt=""
                      aria-hidden
                      className="h-8 w-8 object-contain"
                    />
                    <div className="font-medium text-white">{res.couriers.full_name}</div>
                  </div>
                  <div className="text-xs text-emerald-100/50">
                    {t("track.vehicle")} : {res.couriers.vehicle_type}
                  </div>
                  <a
                    href={`tel:${res.couriers.phone}`}
                    className="inline-flex items-center gap-2 text-sm font-medium text-emerald-300 hover:underline"
                  >
                    <Phone className="h-4 w-4" /> {res.couriers.phone}
                  </a>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2 text-sm text-emerald-100/55">
                  <Clock className="h-4 w-4" /> {t("track.waiting")}
                </div>
              )}
            </div>
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
    </div>
  );
}
