import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import {
  ChevronRight,
  FilePlus2,
  Files,
  Loader2,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { listDoctorPrescriptions } from "@/lib/doctor-rx.functions";
import { RxStatusBadge, formatDateFr } from "@/components/doctor-rx/rx-ui";
import { cn } from "@/lib/utils";

const STATUSES = ["all", "draft", "signed", "sent", "cancelled", "amended"] as const;
const TABS: Array<{ value: (typeof STATUSES)[number]; label: string }> = [
  { value: "all", label: "Toutes" },
  { value: "draft", label: "Brouillons" },
  { value: "signed", label: "Signées" },
  { value: "sent", label: "Envoyées" },
  { value: "cancelled", label: "Annulées" },
  { value: "amended", label: "Avenants" },
];

export const Route = createFileRoute("/medecin/app/ordonnances/")({
  validateSearch: z.object({
    statut: z.enum(STATUSES).optional().default("all"),
  }),
  component: PrescriptionsList,
});

type Row = Awaited<ReturnType<typeof listDoctorPrescriptions>>[number];

function PrescriptionsList() {
  const search = Route.useSearch();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>(search.statut ?? "all");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(search.statut ?? "all");
  }, [search.statut]);

  useEffect(() => {
    let alive = true;
    setRows(null);
    const timer = setTimeout(() => {
      listDoctorPrescriptions({ data: { status, query } })
        .then((r) => alive && setRows(r as Row[]))
        .catch((e: unknown) => {
          if (alive) setError(e instanceof Error ? e.message : "Chargement impossible");
        });
    }, query ? 280 : 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [status, query]);

  const total = useMemo(() => rows?.length ?? 0, [rows]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2ee0aa]">
            Espace médecin
          </p>
          <h1 className="font-display text-3xl text-white sm:text-4xl">Mes ordonnances</h1>
          <p className="mt-1 text-xs text-[#9fc4b9]">
            Retrouvez, signez et transmettez vos documents électroniques.
          </p>
        </div>
        <Link
          to="/medecin/app/ordonnances/nouvelle"
          className="rx-btn-primary px-4 py-2.5 text-sm"
        >
          <FilePlus2 className="h-4 w-4" />
          Nouvelle ordonnance
        </Link>
      </div>

      <div className="rx-glass mb-3 rounded-[22px] p-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7da69b]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher par patient, numéro ou diagnostic…"
              className="rx-field-dark pl-10"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto rx-scroll">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setStatus(t.value)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-2 text-[11px] font-bold transition",
                  status === t.value
                    ? "bg-[#2ee0aa] text-[#041e1a]"
                    : "text-[#9fc4b9] hover:bg-white/[0.08] hover:text-white",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-xs text-rose-200">
          {error}
        </div>
      )}

      {!rows && !error && (
        <div className="flex items-center justify-center rounded-[24px] border border-white/10 bg-white/[0.03] py-16 text-[#9fc4b9]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="rounded-[26px] border border-dashed border-white/15 bg-white/[0.03] px-6 py-14 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white/[0.06]">
            <Files className="h-8 w-8 text-[#2ee0aa]" />
          </span>
          <p className="mt-3 text-sm font-bold text-white">Aucune ordonnance trouvée</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-[#9fc4b9]">
            {query
              ? "Aucun document ne correspond à votre recherche. Essayez un autre nom ou numéro."
              : "Créez votre première ordonnance électronique : elle sera signée, archivée et transmise au patient."}
          </p>
          <Link
            to="/medecin/app/ordonnances/nouvelle"
            className="rx-btn-primary mt-5 px-4 py-2.5 text-xs"
          >
            <FilePlus2 className="h-4 w-4" />
            Rédiger une ordonnance
          </Link>
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#8fb8ac]">
              <SlidersHorizontal className="h-3 w-3" />
              {total} document{total > 1 ? "s" : ""}
            </span>
            <span className="text-[10px] text-[#7da69b]">Les plus récentes d'abord</span>
          </div>

          {/* Tablette / desktop */}
          <div className="hidden overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 text-[9px] uppercase tracking-[0.14em] text-[#8fb8ac]">
                  <th className="px-4 py-3 font-bold">Patient</th>
                  <th className="px-4 py-3 font-bold">Document</th>
                  <th className="px-4 py-3 font-bold">Diagnostic</th>
                  <th className="px-4 py-3 font-bold">Date</th>
                  <th className="px-4 py-3 font-bold">Statut</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {rows.map((rx) => (
                  <tr key={rx.id} className="group transition hover:bg-white/[0.04]">
                    <td className="px-4 py-3">
                      <Link
                        to="/medecin/app/ordonnances/$id"
                        params={{ id: rx.id }}
                        className="flex items-center gap-2.5"
                      >
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.07]">
                          <img
                            src="/icons3d/rx.png"
                            alt=""
                            aria-hidden
                            className="h-6 w-6 object-contain"
                          />
                        </span>
                        <span>
                          <span className="block text-[12px] font-bold text-white">
                            {rx.patient_name}
                          </span>
                          <span className="block text-[10px] text-[#8fb8ac]">
                            {rx.patient_phone || "—"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-[#b7d6cd]">
                      {rx.number}
                      {rx.version > 1 && (
                        <span className="ml-1 text-[9px] text-[#5ff0c4]">v{rx.version}</span>
                      )}
                    </td>
                    <td className="max-w-[180px] px-4 py-3">
                      <span className="block truncate text-[11px] text-[#c9e5dd]">
                        {rx.diagnosis || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-[#9fc4b9]">
                      {formatDateFr(rx.consultation_date)}
                    </td>
                    <td className="px-4 py-3">
                      <RxStatusBadge status={rx.status} dark />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to="/medecin/app/ordonnances/$id"
                        params={{ id: rx.id }}
                        className="inline-grid h-8 w-8 place-items-center rounded-full border border-white/10 text-[#9fc4b9] transition group-hover:border-[#2ee0aa]/40 group-hover:text-[#5ff0c4]"
                        aria-label="Ouvrir"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            {rows.map((rx) => (
              <Link
                key={rx.id}
                to="/medecin/app/ordonnances/$id"
                params={{ id: rx.id }}
                className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.05] p-3 transition active:bg-white/[0.09]"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.07]">
                  <img src="/icons3d/rx.png" alt="" aria-hidden className="h-7 w-7 object-contain" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-bold text-white">
                      {rx.patient_name}
                    </span>
                    <RxStatusBadge status={rx.status} dark />
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-[#9fc4b9]">
                    {rx.diagnosis || "Sans diagnostic"}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[9px] text-[#7da69b]">
                    <span className="font-mono">{rx.number}</span>
                    <span>·</span>
                    <span>{formatDateFr(rx.consultation_date)}</span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#7da69b]" />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
