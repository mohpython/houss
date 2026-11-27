import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  FilePlus2,
  FileSignature,
  Files,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
} from "lucide-react";
import { getDoctorDashboard } from "@/lib/doctor-rx.functions";
import { RxStatusBadge, formatDateFr } from "@/components/doctor-rx/rx-ui";

export const Route = createFileRoute("/medecin/app/")({
  component: DoctorDashboard,
});

type Dashboard = Awaited<ReturnType<typeof getDoctorDashboard>>;

function StatTile({
  to,
  icon,
  label,
  value,
  hint,
  accent,
}: {
  to: string;
  icon: string;
  label: string;
  value: string | number;
  hint: string;
  accent: string;
}) {
  return (
    <Link
      to={to}
      className="group rx-card relative overflow-hidden rounded-[24px] p-3.5 transition duration-200 hover:-translate-y-1 hover:shadow-[0_24px_50px_-20px_rgba(0,0,0,0.55)] sm:p-4"
    >
      <div className="flex items-start justify-between">
        <img
          src={`/icons3d/${icon}`}
          alt=""
          aria-hidden
          className="rx-icon-3d h-12 w-12 object-contain sm:h-14 sm:w-14"
        />
        <span className={`grid h-7 w-7 place-items-center rounded-full ${accent}`}>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-2 text-[12px] font-bold leading-tight text-[#072b26] sm:text-[13px]">
        {label}
      </p>
      <p className="mt-0.5 text-[11px] text-[#6d8a82]">{hint}</p>
      <p className="mt-1 text-2xl font-black leading-none text-[#047857]">{value}</p>
    </Link>
  );
}

function DoctorDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getDoctorDashboard()
      .then((d) => alive && setData(d))
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Chargement impossible");
      });
    return () => {
      alive = false;
    };
  }, []);

  const now = new Date();
  const greeting = now.getHours() < 18 ? "Bonjour" : "Bonsoir";
  const dateLabel = now.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  if (error) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-rose-300/25 bg-rose-400/10 p-6 text-sm text-rose-200">
        {error}
      </div>
    );
  }

  const me = data?.me;
  const counts = data?.counts;
  const displayName = me?.full_name?.replace(/^dr\.?\s+/i, "") ?? "Docteur";

  return (
    <div className="mx-auto max-w-6xl">
      {/* Salutation + visuel */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[radial-gradient(120%_130%_at_100%_0%,rgba(0,201,149,0.28),transparent_55%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-6 -top-10 h-56 w-56 rounded-full bg-[#00c995]/20 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2ee0aa]/25 bg-[#2ee0aa]/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#5ff0c4]">
              <Stethoscope className="h-3 w-3" />
              Espace médecin
            </span>
            <h1 className="mt-3 font-display text-3xl leading-tight text-white sm:text-4xl">
              {greeting} Dr. {displayName}
            </h1>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-[#a9ccc2] sm:text-sm">
              Gérez vos ordonnances électroniques en toute sécurité. Chaque signature est
              horodatée et vérifiable.
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-semibold capitalize text-[#8fb8ac]">
              <CalendarDays className="h-3.5 w-3.5" />
              {dateLabel}
            </p>
          </div>
          <div className="relative hidden shrink-0 sm:block">
            <div className="absolute inset-0 scale-125 rounded-full bg-[#00c995]/20 blur-2xl" />
            <div className="relative grid h-28 w-28 place-items-center rounded-full border border-white/10 bg-white/[0.05]">
              <img
                src="/icons3d/stethoscope.png"
                alt=""
                aria-hidden
                className="rx-float rx-icon-3d h-20 w-20 object-contain"
              />
            </div>
            <img
              src="/icons3d/pill.png"
              alt=""
              aria-hidden
              className="absolute -right-4 bottom-1 h-9 w-9 object-contain drop-shadow-xl"
            />
            <img
              src="/icons3d/rx.png"
              alt=""
              aria-hidden
              className="absolute -left-3 top-0 h-9 w-9 object-contain drop-shadow-xl"
            />
          </div>
        </div>
      </section>

      {/* CTA nouvelle ordonnance */}
      <Link
        to="/medecin/app/ordonnances/nouvelle"
        className="group relative mt-3 flex items-center gap-4 overflow-hidden rounded-[26px] bg-gradient-to-br from-[#0fb98b] via-[#00a97c] to-[#047857] p-4 shadow-[0_24px_50px_-18px_rgba(4,120,87,0.7)] transition hover:brightness-105 sm:p-5"
      >
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <span className="relative grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 sm:h-20 sm:w-20">
          <img
            src="/icons3d/rx.png"
            alt=""
            aria-hidden
            className="rx-icon-3d h-12 w-12 object-contain sm:h-14 sm:w-14"
          />
        </span>
        <div className="relative min-w-0 flex-1">
          <p className="font-display text-xl leading-tight text-white sm:text-2xl">
            Nouvelle ordonnance
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-white/80 sm:text-xs">
            Rédiger et signer une ordonnance électronique
          </p>
        </div>
        <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[#047857] shadow-lg transition group-hover:translate-x-0.5">
          <ArrowRight className="h-5 w-5" />
        </span>
      </Link>

      {/* Tuiles */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          to="/medecin/app/ordonnances"
          icon="rx.png"
          label="Mes ordonnances"
          hint="Toutes les versions"
          value={counts?.total ?? "—"}
          accent="bg-[#e2f7ee] text-[#047857]"
        />
        <StatTile
          to="/medecin/app/patients"
          icon="person.png"
          label="Mes patients"
          hint="Suivi et historique"
          value={counts?.patients ?? "—"}
          accent="bg-[#e2f7ee] text-[#047857]"
        />
        <StatTile
          to="/medecin/app/modeles"
          icon="records.png"
          label="Modèles"
          hint="Prescriptions types"
          value={counts?.templates ?? "—"}
          accent="bg-[#e2f7ee] text-[#047857]"
        />
        <StatTile
          to="/medecin/app/ordonnances"
          icon="testtube.png"
          label="Statistiques"
          hint="Signées & envoyées"
          value={`${counts?.sent ?? 0} / ${counts?.signed ?? 0}`}
          accent="bg-[#e2f7ee] text-[#047857]"
        />
      </div>

      {/* Contenu */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <section className="rx-card rounded-[26px] p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-[#072b26]">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
                  <Files className="h-3.5 w-3.5" />
                </span>
                Dernières ordonnances
              </h2>
              <p className="mt-0.5 text-[10px] text-[#7a978f]">Vos documents les plus récents</p>
            </div>
            <Link
              to="/medecin/app/ordonnances"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#047857]"
            >
              Tout voir
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {!data && (
            <div className="flex items-center justify-center py-10 text-[#5f7f76]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {data && data.recent.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#d7e7e1] px-4 py-8 text-center">
              <FileSignature className="mx-auto h-8 w-8 text-[#9fc4b9]" />
              <p className="mt-2 text-xs font-bold text-[#072b26]">Aucune ordonnance pour le moment</p>
              <p className="mt-1 text-[10px] text-[#6d8a82]">
                Créez votre première ordonnance électronique en quelques secondes.
              </p>
              <Link
                to="/medecin/app/ordonnances/nouvelle"
                className="rx-btn-primary mt-3 px-4 py-2 text-[11px]"
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                Nouvelle ordonnance
              </Link>
            </div>
          )}
          {data && data.recent.length > 0 && (
            <div className="divide-y divide-[#eef5f2]">
              {data.recent.map((rx) => (
                <Link
                  key={rx.id}
                  to="/medecin/app/ordonnances/$id"
                  params={{ id: rx.id }}
                  className="flex items-center gap-3 py-2.5 transition hover:bg-[#f7fbf9]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eef8f4]">
                    <img src="/icons3d/rx.png" alt="" aria-hidden className="h-6 w-6 object-contain" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[12px] font-bold text-[#072b26]">
                        {rx.patient_name}
                      </span>
                      <RxStatusBadge status={rx.status} />
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-[#6d8a82]">
                      {rx.diagnosis || "Sans diagnostic"} · {formatDateFr(rx.consultation_date)}
                    </span>
                  </span>
                  <span className="hidden shrink-0 font-mono text-[9px] text-[#8aa39c] sm:block">
                    {rx.number}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#b7c9c3]" />
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-3">
          <section className="rx-card rounded-[26px] p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#072b26]">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#e2f7ee] text-[#047857]">
                <Clock3 className="h-3.5 w-3.5" />
              </span>
              À traiter
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                to="/medecin/app/ordonnances"
                search={{ statut: "draft" }}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-3 transition hover:bg-amber-100"
              >
                <p className="text-2xl font-black leading-none text-amber-700">
                  {counts?.drafts ?? 0}
                </p>
                <p className="mt-1 text-[10px] font-bold text-amber-800">Brouillons à signer</p>
              </Link>
              <Link
                to="/medecin/app/ordonnances"
                search={{ statut: "signed" }}
                className="rounded-2xl border border-sky-200 bg-sky-50 p-3 transition hover:bg-sky-100"
              >
                <p className="text-2xl font-black leading-none text-sky-700">
                  {counts?.signed ?? 0}
                </p>
                <p className="mt-1 text-[10px] font-bold text-sky-800">Signées à envoyer</p>
              </Link>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-2xl bg-[#f4faf7] px-3 py-2.5">
              <span className="text-[11px] font-semibold text-[#4f6f67]">Créées aujourd'hui</span>
              <span className="text-sm font-black text-[#047857]">{counts?.today ?? 0}</span>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-[26px] border border-[#2ee0aa]/20 bg-gradient-to-br from-[#0b3b31] to-[#06251f] p-4 text-white sm:p-5">
            <div className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-[#2ee0aa]/15 blur-2xl" />
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#5ff0c4]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Signature sécurisée
            </p>
            <p className="mt-2 text-[13px] font-semibold leading-snug">
              Chaque ordonnance signée reçoit un QR code unique.
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-[#9fc4b9]">
              La pharmacie peut vérifier l'authenticité, la version et l'état du document en un
              scan. Toute correction crée un avenant audité.
            </p>
            <Link
              to="/medecin/app/parametres"
              className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-[#5ff0c4]"
            >
              Configurer mon cachet
              <ArrowRight className="h-3 w-3" />
            </Link>
          </section>

          <section className="rx-card-soft rounded-[26px] p-4">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#e2f7ee] text-[#047857]">
                <Users className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[11px] font-bold text-[#072b26]">Recherche patient</p>
                <p className="text-[9px] text-[#6d8a82]">Téléphone, e-mail ou nom</p>
              </div>
              <Link
                to="/medecin/app/patients"
                className="ml-auto grid h-8 w-8 place-items-center rounded-full bg-white text-[#047857] shadow-sm"
                aria-label="Rechercher un patient"
              >
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>

          <section className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <Sparkles className="h-4 w-4 shrink-0 text-[#5ff0c4]" />
            <p className="text-[10px] leading-snug text-[#9fc4b9]">
              Astuce : chargez un modèle pour préremplir vos prescriptions fréquentes.
            </p>
            <Link to="/medecin/app/modeles" className="ml-auto shrink-0 text-[10px] font-bold text-[#5ff0c4]">
              Voir
            </Link>
          </section>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 pb-2 text-[10px] text-[#7da69b]">
        <Send className="h-3 w-3" />
        Les ordonnances envoyées apparaissent immédiatement dans « Mes ordonnances » du patient.
      </div>
    </div>
  );
}
