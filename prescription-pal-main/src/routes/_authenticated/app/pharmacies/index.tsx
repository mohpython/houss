import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { listApprovedPharmacies } from "@/lib/admin-data.functions";

export const Route = createFileRoute("/_authenticated/app/pharmacies/")({
  component: Pharmacies,
});

type PartnerPharmacy = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
};

function Pharmacies() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<PartnerPharmacy[] | null>(null);
  const [query, setQuery] = useState("");
  const listPharmacies = useServerFn(listApprovedPharmacies);

  useEffect(() => {
    listPharmacies()
      .then((data) => setRows((data as unknown as PartnerPharmacy[]) ?? []))
      .catch(() => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!rows) return [];
    if (!q) return rows;
    return rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.address ?? "").toLowerCase().includes(q) ||
        (p.city ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#04150f] text-emerald-50">
      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-emerald-400/20 blur-[100px]"
        />
        <div className="relative mx-auto max-w-4xl px-4 pb-12 pt-4 md:px-6 md:pt-6">
          <div className="flex items-center gap-3">
            <Link
              to="/app"
              aria-label={t("nav.home")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-emerald-100 backdrop-blur-xl transition hover:border-emerald-300/40"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-extrabold tracking-tight text-white">
                {t("home.partnerTitle")}
              </h1>
              <p className="truncate text-xs text-emerald-100/60">
                {t("home.partnerSubtitle")}
              </p>
            </div>
            <img
              src="/icons3d/pharmacy.png"
              alt=""
              className="h-12 w-12 shrink-0 drop-shadow-xl"
            />
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-100/45" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("home.partnerSearch")}
                className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.05] pl-9 pr-3 text-sm text-white placeholder:text-emerald-100/40 focus:border-emerald-300/50 focus:outline-none focus:ring-2 focus:ring-emerald-300/20"
              />
            </label>
            <Link
              to="/app/scan"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 shadow-[0_12px_28px_-12px_rgba(52,227,164,0.8)] transition active:scale-[0.98]"
            >
              {t("home.partnerScan")}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {rows === null &&
              [0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-[76px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"
                />
              ))}
            {filtered.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3.5 backdrop-blur-xl"
              >
                <img
                  src="/icons3d/pharmacy.png"
                  alt=""
                  loading="lazy"
                  className="h-12 w-12 shrink-0 drop-shadow-lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {p.name}
                  </p>
                  <p className="truncate text-[11px] text-emerald-100/55">
                    {[p.address, p.city].filter(Boolean).join(" · ") ||
                      "Bamako, Mali"}
                  </p>
                </div>
                <Link
                  to="/app/scan"
                  aria-label={t("home.partnerScan")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-300/10 text-emerald-300 transition hover:bg-emerald-300/20"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
            {rows !== null && filtered.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 text-sm text-emerald-100/70 sm:col-span-2">
                {t("home.partnerEmpty")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
