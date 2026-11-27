import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  FilePlus2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import {
  getPatientForDoctor,
  listDoctorPatients,
  searchDoctorPatients,
  type PatientSearchResult,
} from "@/lib/doctor-rx.functions";
import {
  RxStatusBadge,
  ageFromBirth,
  formatDateFr,
  formatDateTimeFr,
  sexLabel,
} from "@/components/doctor-rx/rx-ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/medecin/app/patients/")({
  validateSearch: z.object({ patientId: z.string().uuid().optional() }),
  component: PatientsPage,
});

type PatientDetail = Awaited<ReturnType<typeof getPatientForDoctor>>;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function PatientRow({
  patient,
  active,
  onClick,
}: {
  patient: PatientSearchResult;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition",
        active
          ? "border-[#2ee0aa]/40 bg-[#2ee0aa]/10"
          : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]",
      )}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#0fb98b] to-[#047857] text-xs font-bold text-white">
        {initials(patient.fullName) || <UserRound className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-bold text-white">{patient.fullName}</span>
        <span className="mt-0.5 block truncate text-[10px] text-[#9fc4b9]">
          {patient.phone || patient.email || "—"}
        </span>
        <span className="mt-0.5 block font-mono text-[9px] text-[#7da69b]">
          {patient.sahaCode}
          {patient.lastVisit ? ` · ${formatDateFr(patient.lastVisit)}` : ""}
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-white/[0.08] px-2 py-0.5 text-[9px] font-bold text-[#c9e5dd]">
        {patient.prescriptions}
      </span>
    </button>
  );
}

function PatientsPage() {
  const search = Route.useSearch();
  const [query, setQuery] = useState("");
  const [list, setList] = useState<PatientSearchResult[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(search.patientId ?? null);
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (search.patientId) setSelectedId(search.patientId);
  }, [search.patientId]);

  useEffect(() => {
    let alive = true;
    const q = query.trim();
    setList(null);
    const timer = setTimeout(
      () => {
        const promise =
          q.length >= 2 ? searchDoctorPatients({ data: { query: q } }) : listDoctorPatients();
        promise
          .then((rows) => alive && setList(rows as PatientSearchResult[]))
          .catch((e: unknown) => {
            if (alive) setError(e instanceof Error ? e.message : "Chargement impossible");
          });
      },
      q.length >= 2 ? 300 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let alive = true;
    setLoadingDetail(true);
    getPatientForDoctor({ data: { patientId: selectedId } })
      .then((res) => alive && setDetail(res))
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Patient introuvable");
      })
      .finally(() => alive && setLoadingDetail(false));
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const selectedSummary = useMemo(
    () => list?.find((p) => p.id === selectedId) ?? null,
    [list, selectedId],
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2ee0aa]">
            Espace médecin
          </p>
          <h1 className="font-display text-3xl text-white sm:text-4xl">Mes patients</h1>
          <p className="mt-1 text-xs text-[#9fc4b9]">
            Retrouvez un patient par téléphone, e-mail ou nom, et consultez son historique.
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

      {error && (
        <div className="mb-3 rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* Liste */}
        <div className={cn("space-y-2", selectedId && "hidden lg:block")}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7da69b]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Téléphone, e-mail ou nom…"
              className="rx-field-dark pl-10"
            />
          </div>
          <p className="px-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#7da69b]">
            {query.trim().length >= 2 ? "Résultats" : "Patients récents"}
          </p>

          {!list && (
            <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] py-10 text-[#9fc4b9]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {list && list.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-8 text-center">
              <Users className="mx-auto h-7 w-7 text-[#5ff0c4]" />
              <p className="mt-2 text-[11px] font-bold text-white">Aucun patient trouvé</p>
              <p className="mt-1 text-[10px] leading-relaxed text-[#9fc4b9]">
                Le patient doit disposer d'un compte SAHA Santé avec ce numéro ou cet e-mail.
              </p>
            </div>
          )}
          {list?.map((p) => (
            <PatientRow
              key={p.id}
              patient={p}
              active={p.id === selectedId}
              onClick={() => setSelectedId(p.id)}
            />
          ))}
        </div>

        {/* Détail */}
        <div className={cn(!selectedId && "hidden lg:block")}>
          {!selectedId && (
            <div className="flex min-h-[340px] flex-col items-center justify-center rounded-[26px] border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-3xl bg-white/[0.06]">
                <UserRound className="h-8 w-8 text-[#2ee0aa]" />
              </span>
              <p className="mt-3 text-sm font-bold text-white">Sélectionnez un patient</p>
              <p className="mt-1 max-w-xs text-xs text-[#9fc4b9]">
                Son identité, son identifiant SAHA et l'historique de vos ordonnances apparaîtront
                ici.
              </p>
            </div>
          )}

          {selectedId && loadingDetail && !detail && (
            <div className="flex min-h-[340px] items-center justify-center rounded-[26px] border border-white/10 bg-white/[0.03] text-[#9fc4b9]">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}

          {detail && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#9fc4b9] lg:hidden"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Retour à la liste
              </button>

              <section className="rx-card rounded-[26px] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#0fb98b] to-[#047857] text-lg font-bold text-white shadow-lg">
                      {initials(detail.patient.fullName) || <UserRound className="h-6 w-6" />}
                    </span>
                    <div>
                      <h2 className="text-lg font-bold text-[#072b26]">{detail.patient.fullName}</h2>
                      <p className="font-mono text-[10px] text-[#047857]">{detail.patient.sahaCode}</p>
                      <p className="mt-0.5 text-[11px] text-[#5f7f76]">
                        {ageFromBirth(detail.patient.birthDate) ?? "—"} ans ·{" "}
                        {sexLabel(detail.patient.sex)}
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/medecin/app/ordonnances/nouvelle"
                    search={{ patientId: detail.patient.id }}
                    className="rx-btn-primary px-4 py-2 text-xs"
                  >
                    <FilePlus2 className="h-3.5 w-3.5" />
                    Prescrire
                  </Link>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {detail.patient.phone && (
                    <div className="flex items-center gap-2 rounded-xl bg-[#f4faf7] px-3 py-2 text-[11px] text-[#4f6f67]">
                      <Phone className="h-3.5 w-3.5 text-[#047857]" />
                      {detail.patient.phone}
                    </div>
                  )}
                  {detail.patient.email && (
                    <div className="flex min-w-0 items-center gap-2 rounded-xl bg-[#f4faf7] px-3 py-2 text-[11px] text-[#4f6f67]">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-[#047857]" />
                      <span className="truncate">{detail.patient.email}</span>
                    </div>
                  )}
                  {detail.patient.address && (
                    <div className="flex items-center gap-2 rounded-xl bg-[#f4faf7] px-3 py-2 text-[11px] text-[#4f6f67] sm:col-span-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-[#047857]" />
                      {detail.patient.address}
                    </div>
                  )}
                </div>
              </section>

              <section className="rx-card rounded-[26px] p-4 sm:p-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-[#072b26]">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
                      <CalendarDays className="h-3.5 w-3.5" />
                    </span>
                    Historique des ordonnances
                  </h3>
                  <span className="rx-chip bg-[#e2f7ee] text-[#047857]">
                    {detail.prescriptions.length}
                  </span>
                </div>
                {detail.prescriptions.length === 0 && (
                  <p className="rounded-xl border border-dashed border-[#d7e7e1] px-4 py-6 text-center text-[11px] text-[#6d8a82]">
                    Aucune ordonnance rédigée par vous pour ce patient.
                  </p>
                )}
                <div className="divide-y divide-[#eef5f2]">
                  {detail.prescriptions.map((rx) => (
                    <Link
                      key={rx.id}
                      to="/medecin/app/ordonnances/$id"
                      params={{ id: rx.id }}
                      className="flex items-center gap-3 py-2.5 transition hover:bg-[#f7fbf9]"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eef8f4]">
                        <img src="/icons3d/rx.png" alt="" aria-hidden className="h-5 w-5 object-contain" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] font-bold text-[#072b26]">
                            {rx.number}
                          </span>
                          <RxStatusBadge status={rx.status} />
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-[#6d8a82]">
                          {rx.diagnosis || "Sans diagnostic"} ·{" "}
                          {formatDateFr(rx.consultation_date)}
                        </span>
                      </span>
                      <span className="hidden text-[9px] text-[#8aa39c] sm:block">
                        {formatDateTimeFr(rx.created_at)}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#b7c9c3]" />
                    </Link>
                  ))}
                </div>
              </section>

              {selectedSummary && selectedSummary.lastVisit && (
                <p className="px-1 text-[10px] text-[#7da69b]">
                  Dernière consultation : {formatDateFr(selectedSummary.lastVisit)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
