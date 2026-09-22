import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { subscribeRealtime } from "@/integrations/realtime/client";
import { listMyRecentReservations } from "@/lib/prescriptions.functions";
import { Camera, ListChecks, Store, Stethoscope, Package, Truck, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/i18n";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Accueil — SAHA Santé" },
      { name: "description", content: "Scannez votre ordonnance : SAHA Santé s'occupe du reste." },
      { property: "og:title", content: "Accueil — SAHA Santé" },
      {
        property: "og:description",
        content: "Scannez votre ordonnance : SAHA Santé s'occupe du reste.",
      },
    ],
  }),
  component: Home,
});

type Recent = {
  id: string;
  status: string;
  delivery_status: string | null;
  created_at: string;
  pharmacies: { name: string } | null;
};

function Home() {
  const { t } = useTranslation();
  const { user } = Route.useRouteContext();
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const listRecent = useServerFn(listMyRecentReservations);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await listRecent();
        setRecent((data as unknown as Recent[]) ?? []);
      } catch {
        setRecent([]);
      }
    };
    load();
    return subscribeRealtime(
      [{ table: "reservations", event: "*", filter: { patient_id: user.id } }],
      () => void load(),
      { onResync: () => void load() },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-10">
      <Link to="/app/scan" className="flex flex-col items-center gap-3" aria-label={t("nav.scan")}>
        <span className="flex h-40 w-40 items-center justify-center rounded-full aurora-bg text-primary-foreground shadow-2xl shadow-primary/40 transition-transform active:scale-95">
          <Camera className="h-20 w-20" />
        </span>
        <span className="text-base font-semibold">{t("nav.scan")}</span>
      </Link>

      <div className="mt-10 grid w-full grid-cols-3 gap-4">
        <IconLink
          to="/app/prescriptions"
          label={t("nav.prescriptions")}
          icon={<ListChecks className="h-7 w-7" />}
        />
        <IconLink
          to="/app/reservations"
          label={t("nav.reservations")}
          icon={<Store className="h-7 w-7" />}
        />
        <IconLink
          to="/app/health"
          label={t("health.title")}
          icon={<Stethoscope className="h-7 w-7" />}
        />
      </div>

      <div className="mt-10 w-full space-y-2">
        {recent === null && (
          <>
            <div className="h-14 w-full animate-pulse rounded-2xl bg-white/5" aria-hidden />
            <div className="h-14 w-full animate-pulse rounded-2xl bg-white/5" aria-hidden />
          </>
        )}
        {recent?.map((r) => {
          const done = r.status === "completed";
          const shipping = r.delivery_status === "in_transit" || r.delivery_status === "picked_up";
          return (
            <Link
              key={r.id}
              to="/app/reservations/$id"
              params={{ id: r.id }}
              className="flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                  done
                    ? "border-success/30 bg-success/10 text-success"
                    : shipping
                      ? "border-warning/30 bg-warning/10 text-warning"
                      : "border-white/10 bg-white/5 text-primary"
                }`}
                aria-hidden
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : shipping ? (
                  <Truck className="h-4 w-4" />
                ) : (
                  <Package className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {r.pharmacies?.name ?? t("home.pharmacyLabel")}
              </span>
              <span className="shrink-0 text-xs text-foreground/50">
                {new Date(r.created_at).toLocaleTimeString(getDateLocale(), {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function IconLink({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="group flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-2 py-4 text-center transition-colors hover:border-primary/50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="text-xs font-medium leading-tight text-foreground/80 group-hover:text-foreground">
        {label}
      </span>
    </Link>
  );
}
