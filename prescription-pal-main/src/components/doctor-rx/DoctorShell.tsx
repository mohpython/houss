import { Link, useRouter } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FilePlus2,
  Files,
  Users,
  BookMarked,
  Settings,
  LogOut,
  Search,
  Bell,
  ShieldCheck,
  Clock3,
  XCircle,
  Stethoscope,
} from "lucide-react";
import type { ReactNode } from "react";
import { auth } from "@/integrations/auth/client";
import type { DoctorSession } from "@/lib/doctor-rx.functions";
import sahaLogo from "@/assets/saha-logo.jpeg.asset.json";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/medecin/app", label: "Accueil", icon: LayoutDashboard, exact: true, mobile: "home.png" },
  {
    to: "/medecin/app/ordonnances",
    label: "Ordonnances",
    icon: Files,
    exact: false,
    mobile: "rx.png",
  },
  { to: "/medecin/app/patients", label: "Patients", icon: Users, exact: false, mobile: "person.png" },
  {
    to: "/medecin/app/modeles",
    label: "Modèles",
    icon: BookMarked,
    exact: false,
    mobile: "records.png",
  },
  {
    to: "/medecin/app/parametres",
    label: "Paramètres",
    icon: Settings,
    exact: false,
    mobile: "shield.png",
  },
] as const;

export function DoctorBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/medecin/app" className="flex items-center gap-3">
      <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-white shadow-[0_10px_24px_-8px_rgba(0,0,0,0.55)] ring-1 ring-white/30">
        <img src={sahaLogo.url} alt="SAHA Santé" className="h-full w-full object-cover" />
      </span>
      <span className="leading-tight">
        <span className={cn("block font-display text-white", compact ? "text-lg" : "text-xl")}>
          SAHA Santé
        </span>
        <span className="block text-[11px] font-bold uppercase tracking-[0.22em] text-[#2ee0aa]">
          e-Ordonnance
        </span>
      </span>
    </Link>
  );
}

function AccessGate({ session }: { session: DoctorSession }) {
  const router = useRouter();
  const config =
    session.access === "pending"
      ? {
          icon: Clock3,
          title: "Compte médecin en attente de validation",
          body: "Votre profil praticien a bien été trouvé. Un administrateur SAHA Santé doit encore approuver votre compte pour activer la signature électronique. Vous recevrez une notification dès que c'est fait.",
          tone: "text-amber-300 bg-amber-400/10 border-amber-300/25",
        }
      : session.access === "rejected"
        ? {
            icon: XCircle,
            title: "Compte médecin refusé",
            body: "Votre demande d'accès à l'espace médecin n'a pas été acceptée. Contactez le support SAHA Santé pour connaître le motif et déposer un dossier conforme.",
            tone: "text-rose-300 bg-rose-400/10 border-rose-300/25",
          }
        : session.access === "not_doctor"
          ? {
              icon: Stethoscope,
              title: "Espace réservé aux médecins",
              body: "Ce compte est rattaché à un praticien non médecin. Seuls les médecins approuvés peuvent délivrer une e-Ordonnance.",
              tone: "text-sky-300 bg-sky-400/10 border-sky-300/25",
            }
          : {
              icon: ShieldCheck,
              title: "Aucun profil médecin rattaché",
              body: "Votre compte SAHA Santé n'est pas encore relié à un profil médecin. Demandez à l'administrateur de créer votre fiche praticien avec la même adresse e-mail, puis reconnectez-vous.",
              tone: "text-amber-300 bg-amber-400/10 border-amber-300/25",
            };
  const Icon = config.icon;
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center px-4 py-12">
      <div className="rx-glass w-full rounded-[28px] p-7 sm:p-10">
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold",
            config.tone,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          Accès médecin
        </span>
        <h1 className="mt-5 font-display text-3xl text-white sm:text-4xl">{config.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#a9ccc2]">{config.body}</p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-[#9fc4b9]">
          Connecté en tant que{" "}
          <span className="font-semibold text-white">
            {session.user.name || session.user.email || session.user.phone}
          </span>
        </div>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            to="/medecin"
            className="rx-btn-ghost px-5 py-2.5 text-sm"
          >
            Retour à l'accueil
          </Link>
          <button
            type="button"
            className="rx-btn-primary px-5 py-2.5 text-sm"
            onClick={async () => {
              await auth.signOut();
              router.navigate({ to: "/medecin/connexion" });
            }}
          >
            <LogOut className="h-4 w-4" />
            Changer de compte
          </button>
        </div>
      </div>
    </div>
  );
}

export function DoctorShell({
  session,
  children,
}: {
  session: DoctorSession;
  children: ReactNode;
}) {
  const router = useRouter();
  const signOut = async () => {
    await auth.signOut();
    router.navigate({ to: "/medecin/connexion" });
  };
  const doctor = session.practitioner;
  const displayName = doctor?.full_name?.replace(/^dr\.?\s+/i, "") || session.user.name || "Médecin";

  return (
    <div className="min-h-dvh">
      <div className="mx-auto flex w-full max-w-[1500px]">
        {/* Sidebar desktop */}
        <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col px-3 py-4 lg:flex">
          <div className="rx-glass flex h-full flex-col rounded-[26px] p-4">
            <div className="px-1 pb-5 pt-1">
              <DoctorBrand />
            </div>

            <Link
              to="/medecin/app/ordonnances/nouvelle"
              className="rx-btn-primary mb-5 w-full px-4 py-3 text-sm"
            >
              <FilePlus2 className="h-4 w-4" />
              Nouvelle ordonnance
            </Link>

            <nav className="space-y-1">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-[#b7d6cd] transition hover:bg-white/[0.07] hover:text-white [&.active]:bg-white/[0.12] [&.active]:text-white [&.active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                >
                  <item.icon className="h-[18px] w-[18px] text-[#7fb3a5] group-hover:text-[#2ee0aa] [.active_&]:text-[#2ee0aa]" />
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-auto space-y-3 pt-4">
              <div className="rounded-2xl border border-[#2ee0aa]/20 bg-[#2ee0aa]/[0.08] p-3">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#2ee0aa]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Signature active
                </div>
                <p className="mt-1 text-[11px] leading-snug text-[#9fc4b9]">
                  Chaque ordonnance est scellée par un HMAC-SHA256 vérifiable par QR code.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="truncate text-sm font-semibold text-white">Dr. {displayName}</p>
                <p className="truncate text-[11px] text-[#9fc4b9]">
                  {doctor?.specialty_label ?? "Médecin"}
                  {doctor?.license_number ? ` · ${doctor.license_number}` : ""}
                </p>
                <button
                  type="button"
                  onClick={signOut}
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#9fc4b9] transition hover:text-white"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Se déconnecter
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Header mobile / tablette */}
          <header className="sticky top-0 z-40 border-b border-white/10 bg-[#041e1a]/80 px-4 py-3 backdrop-blur-xl lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <DoctorBrand compact />
              <div className="flex items-center gap-1.5">
                <Link
                  to="/medecin/app/ordonnances"
                  aria-label="Rechercher une ordonnance"
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.12] bg-white/[0.06] text-[#c9e5dd]"
                >
                  <Search className="h-[18px] w-[18px]" />
                </Link>
                <Link
                  to="/medecin/app/ordonnances"
                  aria-label="Ordonnances"
                  className="relative grid h-10 w-10 place-items-center rounded-full border border-white/[0.12] bg-white/[0.06] text-[#c9e5dd]"
                >
                  <Bell className="h-[18px] w-[18px]" />
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#2ee0aa] ring-2 ring-[#041e1a]" />
                </Link>
              </div>
            </div>
          </header>

          {session.access === "ok" ? (
            <main className="min-h-[calc(100dvh-64px)] px-3 pb-28 pt-4 sm:px-5 lg:px-8 lg:pb-10 lg:pt-8">
              {children}
            </main>
          ) : (
            <AccessGate session={session} />
          )}
        </div>
      </div>

      {/* Navigation mobile */}
      {session.access === "ok" && (
        <nav
          className="fixed inset-x-2 bottom-2 z-50 lg:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto flex max-w-lg items-center justify-around rounded-[24px] border border-white/[0.12] bg-[#06251f]/95 px-1.5 py-2 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-1 text-[10px] font-semibold text-[#87aca1] transition [&.active]:bg-white/[0.08] [&.active]:text-white"
              >
                <img
                  src={`/icons3d/${item.mobile}`}
                  alt=""
                  aria-hidden
                  className="h-7 w-7 object-contain opacity-80 drop-shadow-lg [.active_&]:opacity-100"
                />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
