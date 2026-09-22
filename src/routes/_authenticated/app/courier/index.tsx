import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyCourier, listMyDeliveries } from "@/lib/courier.functions";
import { subscribeRealtime } from "@/integrations/realtime/client";
import { setCourierOnline, updateCourierPosition } from "@/lib/delivery.functions";
import { Card } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PageSkeleton } from "@/components/ui/skeletons";
import { toast } from "sonner";
import { MapPin, Navigation, Bike, CheckCircle2, Package, Truck } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/app/courier/")({
  component: CourierDashboard,
  head: () => ({
    meta: [
      { title: "Espace livreur — SAHA Santé" },
      {
        name: "description",
        content:
          "Passez en ligne, recevez vos livraisons et suivez l'itinéraire pharmacie → patient en un écran.",
      },
      { property: "og:title", content: "Espace livreur — SAHA Santé" },
      {
        property: "og:description",
        content: "Un bouton pour se mettre en ligne, une carte par livraison : simple et rapide.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Courier = { id: string; status: string; is_online: boolean; full_name: string };
type Delivery = {
  id: string;
  delivery_status: string;
  patient_address: string | null;
  patient_lat: number | null;
  patient_lng: number | null;
  created_at: string;
  assigned_at: string | null;
  pharmacies: { name: string; address: string; lat: number | null; lng: number | null } | null;
};
type Stats = { active: number; done: number };

function CourierDashboard() {
  const { t } = useTranslation();
  const { user } = Route.useRouteContext();
  const [courier, setCourier] = useState<Courier | null | undefined>(undefined);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [stats, setStats] = useState<Stats>({ active: 0, done: 0 });
  const [toggling, setToggling] = useState(false);
  const setOnline = useServerFn(setCourierOnline);
  const updatePos = useServerFn(updateCourierPosition);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    getMyCourier()
      .then((data) => setCourier(data))
      .catch(() => setCourier(null));
  }, [user.id]);

  useEffect(() => {
    if (!courier) return;
    const load = async () => {
      const res = await listMyDeliveries().catch(() => null);
      const list = (res?.deliveries as unknown as Delivery[]) ?? [];
      setDeliveries(list);
      setStats({ active: list.length, done: res?.done ?? 0 });
    };
    load();
    return subscribeRealtime(
      [{ table: "reservations", event: "*", filter: { courier_id: courier.id } }],
      () => load(),
      { onResync: () => load() },
    );
  }, [courier]);

  useEffect(() => {
    if (!courier?.is_online) {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      return;
    }
    let last = 0;
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const now = Date.now();
        if (now - last < 10000) return;
        last = now;
        const active = deliveries.find((d) =>
          ["assigned", "picked_up", "en_route"].includes(d.delivery_status),
        );
        updatePos({
          data: {
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            reservationId: active?.id ?? null,
          },
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [courier?.is_online, deliveries, updatePos]);

  const toggle = async (online: boolean) => {
    if (toggling) return;
    setToggling(true);
    try {
      let coords: { lat: number; lng: number } | undefined;
      if (online) {
        coords = await new Promise((resolve) =>
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve(undefined as unknown as { lat: number; lng: number }),
            { enableHighAccuracy: true },
          ),
        );
      }
      await setOnline({ data: { online, ...(coords ?? {}) } });
      setCourier(courier ? { ...courier, is_online: online } : null);
      toast.success(online ? t("courier.youAreOnline") : t("courier.youAreOffline"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setToggling(false);
    }
  };

  if (courier === undefined) return <PageSkeleton rows={2} />;
  if (!courier) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{t("courier.notRegistered")}</h1>
        <Link
          to="/app/courier/onboarding"
          className="mt-4 inline-block text-primary hover:underline"
        >
          {t("courier.signup")}
        </Link>
      </div>
    );
  }
  if (courier.status !== "approved") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">
          {t("courier.accountStatus", { status: courier.status })}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("courier.waitApproval")}</p>
      </div>
    );
  }

  const nextAction = deliveries[0];
  const nextLabel =
    nextAction?.delivery_status === "assigned"
      ? t("courier.goToPharm")
      : nextAction?.delivery_status === "picked_up" || nextAction?.delivery_status === "en_route"
        ? t("courier.deliverPatient")
        : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header>
        <div className="flex items-center gap-2">
          <Bike className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight">{t("courier.title")}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          1. Passez en ligne · 2. Ouvrez la livraison · 3. Suivez l'itinéraire.
        </p>
      </header>

      <Card
        className={`mt-4 border-2 p-5 transition-colors ${
          courier.is_online ? "border-success/50 bg-success/5" : "border-primary/60 bg-primary/5"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full ${
                courier.is_online ? "bg-success/20 text-success" : "bg-primary/20 text-primary"
              }`}
              aria-hidden="true"
            >
              <MapPin className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-base font-bold">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${courier.is_online ? "bg-success" : "bg-muted-foreground"}`}
                  aria-hidden="true"
                />
                {courier.is_online ? t("courier.online") : t("courier.offline")}
              </div>
              <div className="text-xs text-muted-foreground">{t("courier.gpsShare")}</div>
            </div>
          </div>
          <Switch
            checked={courier.is_online}
            onCheckedChange={toggle}
            disabled={toggling}
            aria-label={courier.is_online ? "Se mettre hors ligne" : "Se mettre en ligne"}
            className="scale-150 data-[state=unchecked]:bg-primary/40"
          />
        </div>
        {!courier.is_online && (
          <LoadingButton
            onClick={() => toggle(true)}
            loading={toggling}
            className="mt-4 min-h-12 w-full"
            size="lg"
          >
            <MapPin className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("courier.activateLocation", "Activer ma localisation")}
          </LoadingButton>
        )}
      </Card>

      <section aria-label="Mes chiffres" className="mt-4 grid grid-cols-2 gap-3">
        <Kpi
          icon={<Package className="h-4 w-4" />}
          label={t("courier.activeDeliveries")}
          value={stats.active}
          tone="primary"
        />
        <Kpi
          icon={<CheckCircle2 className="h-4 w-4" />}
          label={t("courier.done")}
          value={stats.done}
          tone="success"
        />
      </section>

      {nextAction && (
        <section aria-labelledby="next-action" className="mt-6">
          <h2
            id="next-action"
            className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {t("courier.nextAction")}
          </h2>
          <Link
            to="/app/courier/deliveries/$id"
            params={{ id: nextAction.id }}
            className="mt-2 block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="bg-primary p-5 text-primary-foreground shadow-lg">
              <div className="text-lg font-bold">{nextLabel}</div>
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{nextAction.pharmacies?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Navigation className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {nextAction.patient_address ?? t("courier.clientAddress")}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex min-h-12 w-full items-center justify-center rounded-md bg-background font-semibold text-foreground">
                {t("courier.openDelivery")}
              </div>
            </Card>
          </Link>
        </section>
      )}

      <section aria-labelledby="all-deliveries" className="mt-8">
        <h2 id="all-deliveries" className="flex items-center gap-2 text-lg font-semibold">
          <Truck className="h-4 w-4" aria-hidden="true" /> {t("courier.allDeliveries")}
        </h2>
        <ul className="mt-3 space-y-3">
          {deliveries.length === 0 && (
            <li>
              <Card className="p-6 text-center text-sm text-muted-foreground">
                {t("courier.noActive")}
              </Card>
            </li>
          )}
          {deliveries.map((d) => (
            <li key={d.id}>
              <Link
                to="/app/courier/deliveries/$id"
                params={{ id: d.id }}
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="min-h-16 p-4 transition-colors hover:border-primary hover:bg-secondary/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span className="truncate font-medium">
                          Retrait : {d.pharmacies?.name ?? t("home.pharmacyLabel")}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-sm">
                        <Navigation className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span className="truncate">
                          Livraison : {d.patient_address ?? t("courier.clientAddress")}
                        </span>
                      </div>
                    </div>
                    <Badge variant="secondary">{deliveryLabel(d.delivery_status)}</Badge>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function deliveryLabel(status: string) {
  return status === "assigned"
    ? "À récupérer"
    : status === "picked_up"
      ? "Colis récupéré"
      : status === "en_route"
        ? "En route"
        : status === "delivered"
          ? "Livrée"
          : status;
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "primary" | "success";
}) {
  const t = tone === "success" ? "bg-success/10 text-success" : "bg-primary/10 text-primary";
  return (
    <Card className="p-3">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${t}`}>{icon}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}
