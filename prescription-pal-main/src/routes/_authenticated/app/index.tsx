import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  ChevronRight,
  MapPin,
  Package,
  Search,
  Sparkles,
  Truck,
} from "lucide-react";
import { subscribeRealtime } from "@/integrations/realtime/client";
import { listMyRecentReservations } from "@/lib/prescriptions.functions";
import { listApprovedPharmacies } from "@/lib/admin-data.functions";
import { PushSettingsCard } from "@/components/PushSettingsCard";
import { NotificationCheckBanner } from "@/components/NotificationCheckBanner";
import i18n, { getDateLocale } from "@/i18n";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: i18n.t("meta.appHomeTitle") },
      { name: "description", content: i18n.t("meta.appHomeDesc") },
      { property: "og:title", content: i18n.t("meta.appHomeTitle") },
      {
        property: "og:description",
        content: i18n.t("meta.appHomeDesc"),
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

type PartnerPharmacy = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
};

const TILE =
  "group flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-1.5 py-3 text-center backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-emerald-300/40 hover:bg-emerald-300/10";

function Home() {
  const { t } = useTranslation();
  const { user } = Route.useRouteContext();
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [pharmacies, setPharmacies] = useState<PartnerPharmacy[] | null>(null);
  const listRecent = useServerFn(listMyRecentReservations);
  const listPharmacies = useServerFn(listApprovedPharmacies);

  useEffect(() => {
    let alive = true;
    const loadRecent = async () => {
      try {
        const data = await listRecent();
        if (alive) setRecent((data as unknown as Recent[]) ?? []);
      } catch {
        if (alive) setRecent([]);
      }
    };
    void loadRecent();
    void listPharmacies()
      .then((rows) => {
        if (alive) setPharmacies((rows as unknown as PartnerPharmacy[]) ?? []);
      })
      .catch(() => {
        if (alive) setPharmacies([]);
      });
    const unsubscribe = subscribeRealtime(
      [{ table: "reservations", event: "*", filter: { patient_id: user.id } }],
      () => void loadRecent(),
      { onResync: () => void loadRecent() },
    );
    return () => {
      alive = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const waNumber = (import.meta.env.VITE_WHATSAPP_NUMBER as string | undefined)
    ?.replace(/\D/g, "");
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(t("home.assistanceMsg"))}`
    : null;

  const services = [
    {
      to: "/app/prescriptions",
      icon: "/icons3d/rx.png",
      label: t("nav.prescriptions"),
    },
    {
      to: "/app/pharmacies",
      icon: "/icons3d/pharmacy.png",
      label: t("nav.pharmacies"),
    },
    {
      to: "/app/appointments",
      icon: "/icons3d/calendar.png",
      label: t("nav.appointments"),
    },
    {
      to: "/app/otc",
      icon: "/icons3d/basket.png",
      label: t("nav.otc"),
    },
    {
      to: "/app/reservations",
      icon: "/icons3d/scooter.png",
      label: t("home.liveTracking"),
    },
    {
      to: "/app/health",
      icon: "/icons3d/records.png",
      label: t("home.records"),
      overlay: "/icons3d/heart.png",
    },
    {
      to: "/app/scan",
      icon: "/icons3d/camera.png",
      label: t("home.scanShort"),
    },
  ] as const;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#04150f] text-emerald-50">
      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-emerald-400/20 blur-[110px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-[-10%] top-72 h-72 w-72 rounded-full bg-teal-400/10 blur-[100px]"
        />

        <div className="relative mx-auto max-w-6xl px-4 pb-9 pt-4 md:px-6 md:pt-6">
          {/* Bandeau « Espace Patient » + localisation + recherche */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              to="/app"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-2 text-xs font-semibold text-emerald-50 backdrop-blur-xl"
            >
              <img
                src="/icons3d/person.png"
                alt=""
                className="h-5 w-5"
                loading="lazy"
              />
              {t("home.patientSpace")}
            </Link>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-2 text-xs font-medium text-emerald-50/85 backdrop-blur-xl">
                <MapPin className="h-3.5 w-3.5 text-emerald-300" />
                Bamako, Mali
              </span>
              <Link
                to="/app/pharmacies"
                aria-label={t("home.partnerSearch")}
                title={t("home.partnerSearch")}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-emerald-100/80 backdrop-blur-xl transition hover:border-emerald-300/40 hover:text-white"
              >
                <Search className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Hero */}
          <section className="relative mt-4 overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-gradient-to-br from-emerald-700/90 via-emerald-900/80 to-[#06251b] shadow-2xl shadow-emerald-950/60">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-emerald-300/20 blur-3xl"
            />
            <div className="relative flex flex-col gap-5 p-5 md:flex-row md:items-center md:p-8">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <img
                    src="/icons3d/robot.png"
                    alt=""
                    className="h-9 w-9 drop-shadow-lg"
                  />
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold text-white backdrop-blur">
                    <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                    {t("home.heroBadge")}
                  </span>
                </div>
                <h1 className="mt-4 max-w-xl text-[2rem] font-extrabold leading-[1.08] tracking-tight text-white md:text-5xl">
                  <HeroTitle />
                </h1>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-emerald-100/75 md:text-base">
                  {t("home.heroDesc")}
                </p>
                <Link
                  to="/app/scan"
                  className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-300 to-emerald-500 px-6 py-3 text-sm font-extrabold text-emerald-950 shadow-[0_14px_34px_-12px_rgba(52,227,164,0.9)] transition active:scale-[0.98] md:text-base"
                >
                  <CameraIcon />
                  {t("home.scanCta")}
                </Link>
              </div>
              <div className="relative mx-auto h-44 w-52 shrink-0 md:h-56 md:w-64">
                <img
                  src="/icons3d/rx.png"
                  alt=""
                  className="absolute left-0 top-0 w-40 rotate-[-8deg] drop-shadow-[0_18px_30px_rgba(0,0,0,0.45)] md:w-52"
                />
                <img
                  src="/icons3d/bottle.png"
                  alt=""
                  className="absolute bottom-0 right-0 w-20 rotate-6 drop-shadow-[0_14px_24px_rgba(0,0,0,0.45)] md:w-24"
                />
                <img
                  src="/icons3d/pill.png"
                  alt=""
                  className="absolute bottom-2 left-1 w-16 -rotate-12 drop-shadow-[0_12px_20px_rgba(0,0,0,0.4)] md:w-20"
                />
                <Sparkles className="absolute right-2 top-1 h-5 w-5 text-amber-300" />
              </div>
            </div>
          </section>

          {/* Services */}
          <section className="mt-8">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-xl font-extrabold tracking-tight text-white md:text-2xl">
                {t("home.servicesTitle")}
              </h2>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
                {t("home.seeAll")}
                <ChevronRight className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2.5 md:grid-cols-8 md:gap-3">
              {services.map((s) => (
                <Link key={s.to} to={s.to} className={TILE}>
                  <span className="relative flex h-11 w-11 items-center justify-center md:h-12 md:w-12">
                    <img
                      src={s.icon}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.45)] transition duration-200 group-hover:scale-110"
                    />
                    {"overlay" in s && s.overlay ? (
                      <img
                        src={s.overlay}
                        alt=""
                        loading="lazy"
                        className="absolute -bottom-1 -right-1 h-5 w-5 drop-shadow"
                      />
                    ) : null}
                  </span>
                  <span className="line-clamp-2 text-[10.5px] font-semibold leading-tight text-emerald-50/90 md:text-xs">
                    {s.label}
                  </span>
                </Link>
              ))}
              {waHref ? (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noreferrer"
                  className={TILE}
                >
                  <span className="flex h-11 w-11 items-center justify-center md:h-12 md:w-12">
                    <img
                      src="/icons3d/support.png"
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.45)] transition duration-200 group-hover:scale-110"
                    />
                  </span>
                  <span className="line-clamp-2 text-[10.5px] font-semibold leading-tight text-emerald-50/90 md:text-xs">
                    {t("home.support")}
                  </span>
                </a>
              ) : (
                <Link to="/app/health" className={TILE}>
                  <span className="flex h-11 w-11 items-center justify-center md:h-12 md:w-12">
                    <img
                      src="/icons3d/support.png"
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.45)] transition duration-200 group-hover:scale-110"
                    />
                  </span>
                  <span className="line-clamp-2 text-[10.5px] font-semibold leading-tight text-emerald-50/90 md:text-xs">
                    {t("home.support")}
                  </span>
                </Link>
              )}
            </div>
          </section>

          {/* Pharmacies recommandées */}
          <section className="mt-8">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-xl font-extrabold tracking-tight text-white md:text-2xl">
                {t("home.pharmaciesTitle")}
              </h2>
              <Link
                to="/app/pharmacies"
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200"
              >
                {pharmacies && pharmacies.length > 0
                  ? t("home.nearby", { count: pharmacies.length })
                  : t("home.seeAll")}
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-3 grid gap-2.5 md:grid-cols-2">
              {pharmacies === null &&
                [0, 1].map((i) => (
                  <div
                    key={i}
                    className="h-[70px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"
                  />
                ))}
              {pharmacies?.slice(0, 4).map((p) => (
                <Link
                  key={p.id}
                  to="/app/pharmacies"
                  className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3 backdrop-blur-xl transition hover:border-emerald-300/40 hover:bg-emerald-300/10"
                >
                  <img
                    src="/icons3d/pharmacy.png"
                    alt=""
                    loading="lazy"
                    className="h-11 w-11 shrink-0 drop-shadow-lg"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">
                      {p.name}
                    </span>
                    <span className="block truncate text-[11px] text-emerald-100/55">
                      {[p.address, p.city].filter(Boolean).join(" · ") ||
                        "Bamako, Mali"}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-emerald-200/50 transition group-hover:translate-x-0.5" />
                </Link>
              ))}
              {pharmacies?.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-sm text-emerald-100/70 md:col-span-2">
                  {t("home.partnerEmpty")}
                </div>
              )}
            </div>
          </section>

          {/* Activité récente */}
          {recent && recent.length > 0 && (
            <section className="mt-8">
              <div className="flex items-end justify-between gap-3">
                <h2 className="text-xl font-extrabold tracking-tight text-white md:text-2xl">
                  {t("home.recentActivity")}
                </h2>
                <Link
                  to="/app/reservations"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200"
                >
                  {t("home.seeAll")}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="mt-3 space-y-2">
                {recent.slice(0, 3).map((r) => {
                  const done = r.status === "completed";
                  const shipping =
                    r.delivery_status === "in_transit" ||
                    r.delivery_status === "picked_up";
                  return (
                    <Link
                      key={r.id}
                      to="/app/reservations/$id"
                      params={{ id: r.id }}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-3.5 py-3 backdrop-blur-xl transition hover:border-emerald-300/40"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                          done
                            ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-300"
                            : shipping
                              ? "border-amber-300/30 bg-amber-300/10 text-amber-300"
                              : "border-white/10 bg-white/5 text-emerald-200"
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
                      <span className="min-w-0 flex-1 truncate text-sm text-emerald-50">
                        {r.pharmacies?.name ?? t("home.pharmacyLabel")}
                      </span>
                      <span className="shrink-0 text-xs text-emerald-100/45">
                        {new Date(r.created_at).toLocaleTimeString(
                          getDateLocale(),
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Blocs utilitaires, hors du fond sombre pour rester lisibles dans les
          deux themes (le reste du site reste clair si l'utilisateur le choisit). */}
      <div className="mx-auto max-w-md space-y-4 px-4 py-6">
        <NotificationCheckBanner userId={user.id} />
        <PushSettingsCard />
      </div>
    </div>
  );
}

function HeroTitle() {
  const { t } = useTranslation();
  const title = t("home.heroTitle");
  const highlight = t("home.heroHighlight");
  const index = highlight ? title.indexOf(highlight) : -1;
  if (index < 0) return <>{title}</>;
  return (
    <>
      {title.slice(0, index)}
      <span className="text-amber-300">{highlight}</span>
      {title.slice(index + highlight.length)}
    </>
  );
}

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}
