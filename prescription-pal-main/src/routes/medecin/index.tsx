import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  FileSignature,
  FileText,
  LockKeyhole,
  QrCode,
  ScanLine,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { DoctorBrand } from "@/components/doctor-rx/DoctorShell";
import { RxDocument } from "@/components/doctor-rx/RxDocument";
import { useState } from "react";

export const Route = createFileRoute("/medecin/")({
  component: DoctorLanding,
});

const DEMO_ITEMS = [
  {
    medicine_name: "Amoxicilline 1 g",
    dosage: "1 g",
    form: "Comprimé",
    quantity: "21 comprimés",
    posology: "1 comprimé toutes les 8 heures",
    frequency: "Matin, midi et soir",
    duration: "7 jours",
    route: "Orale",
    instructions: "À prendre pendant les repas",
  },
  {
    medicine_name: "Paracétamol 500 mg",
    dosage: "500 mg",
    form: "Comprimé",
    quantity: "12 comprimés",
    posology: "1 comprimé en cas de douleur",
    frequency: "Max 3 fois par jour",
    duration: "4 jours",
    route: "Orale",
    instructions: "Espacer les prises de 6 heures",
  },
];

function DoctorLanding() {
  const [token, setToken] = useState("");
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute -left-40 top-40 h-[420px] w-[420px] rounded-full bg-[#00c995]/12 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-0 h-[520px] w-[520px] rounded-full bg-[#0fb98b]/18 blur-3xl" />

      {/* Navigation */}
      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <DoctorBrand />
        <nav className="hidden items-center gap-7 text-sm font-medium text-[#b7d6cd] md:flex">
          <a href="#fonctionnalites" className="transition hover:text-white">
            Fonctionnalités
          </a>
          <a href="#securite" className="transition hover:text-white">
            Sécurité
          </a>
          <a href="#verification" className="transition hover:text-white">
            Vérification
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/medecin/connexion"
            className="rx-btn-ghost px-4 py-2 text-sm"
          >
            Se connecter
          </Link>
          <Link
            to="/medecin/app"
            className="rx-btn-primary hidden px-4 py-2 text-sm sm:inline-flex"
          >
            Mon espace
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Héros */}
      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pb-24 lg:pt-14">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2ee0aa]/25 bg-[#2ee0aa]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#5ff0c4]">
            <Stethoscope className="h-3.5 w-3.5" />
            Espace médecin
          </span>
          <h1 className="mt-5 font-display text-4xl leading-[1.05] text-white sm:text-5xl lg:text-[56px]">
            L'ordonnance
            <br />
            <span className="bg-gradient-to-r from-[#5ff0c4] via-[#2ee0aa] to-[#8ef5d6] bg-clip-text text-transparent">
              électronique
            </span>
            <br />
            signée et vérifiable.
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[#a9ccc2]">
            Rédigez une ordonnance complète, apposez votre signature numérique et transmettez-la
            directement dans l'espace SAHA du patient. La pharmacie vérifie l'authenticité en
            scannant un QR code.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link to="/medecin/app" className="rx-btn-primary px-6 py-3 text-sm">
              <FileSignature className="h-4 w-4" />
              Rédiger une ordonnance
            </Link>
            <a href="#verification" className="rx-btn-ghost px-5 py-3 text-sm">
              <ScanLine className="h-4 w-4" />
              Vérifier un QR code
            </a>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px] font-semibold text-[#8fb8ac]">
            <span className="inline-flex items-center gap-1.5">
              <BadgeCheck className="h-4 w-4 text-[#2ee0aa]" />
              Médecins approuvés uniquement
            </span>
            <span className="inline-flex items-center gap-1.5">
              <LockKeyhole className="h-4 w-4 text-[#2ee0aa]" />
              Signature HMAC-SHA256
            </span>
            <span className="inline-flex items-center gap-1.5">
              <QrCode className="h-4 w-4 text-[#2ee0aa]" />
              QR de vérification
            </span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[440px]">
          <div className="pointer-events-none absolute -inset-8 rounded-[48px] bg-gradient-to-br from-[#0fb98b]/25 to-transparent blur-2xl" />
          <div className="relative rotate-[1.5deg] rounded-[32px] border border-white/15 bg-white/[0.06] p-2.5 shadow-[0_50px_100px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl">
            <RxDocument
              number="ORD-20261127-4821"
              version={1}
              status="signed"
              doctorName="Dr. Amadou Traoré"
              doctorSpecialty="Médecine générale"
              doctorLicense="ML-2024-0917"
              establishmentName="Centre de Santé de l'Amitié"
              establishmentAddress="Hamdallaye ACI 2000, Bamako"
              establishmentPhone="+223 76 12 34 56"
              patientName="Coulibaly Mariam"
              patientBirthDate="1998-03-14"
              patientSex="F"
              patientPhone="+223 76 34 56 78"
              patientCode="SAHA-4F8C2A91"
              consultationDate="2026-11-27"
              diagnosis="Infection ORL"
              reason="Fièvre et toux depuis 3 jours"
              advice="Boire beaucoup d'eau et se reposer. Revenir en cas de fièvre persistante."
              identityVerified
              signedAt="2026-11-27T10:24:00.000Z"
              signatureHash="9f2c7a41d8e3b650a1c4f7e2d9b8a3c6f1e5d4b7a2c9f8e3d6b1a4c7f2e5d8b9"
              items={DEMO_ITEMS}
              compact
            />
          </div>
          <div className="rx-float absolute -left-5 top-24 hidden rounded-2xl border border-[#2ee0aa]/25 bg-[#06251f]/95 px-3 py-2 shadow-xl backdrop-blur-xl sm:flex sm:items-center sm:gap-2">
            <ShieldCheck className="h-5 w-5 text-[#2ee0aa]" />
            <div>
              <p className="text-[10px] font-bold text-white">Signature valide</p>
              <p className="text-[9px] text-[#9fc4b9]">Empreinte vérifiée</p>
            </div>
          </div>
          <div className="absolute -bottom-4 -right-3 hidden rounded-2xl border border-white/15 bg-[#06251f]/95 px-3 py-2 shadow-xl backdrop-blur-xl sm:block">
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#5ff0c4]">
              Transmission
            </p>
            <p className="text-[10px] font-semibold text-white">Espace patient SAHA</p>
          </div>
        </div>
      </section>

      {/* Bandeau de confiance */}
      <section className="relative z-10 border-y border-white/8 bg-white/[0.025]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-6 text-center sm:grid-cols-4 sm:px-6">
          {[
            ["1", "Médecin vérifié"],
            ["2", "Identité patient contrôlée"],
            ["3", "Document scellé"],
            ["4", "QR vérifiable"],
          ].map(([n, label]) => (
            <div key={n} className="flex flex-col items-center gap-1">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#2ee0aa]/12 text-[11px] font-bold text-[#5ff0c4]">
                {n}
              </span>
              <span className="text-[11px] font-semibold text-[#b7d6cd]">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Fonctionnalités */}
      <section id="fonctionnalites" className="relative z-10 mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#2ee0aa]">
            Tout le parcours
          </span>
          <h2 className="mt-2 font-display text-3xl text-white sm:text-4xl">
            De la consultation à la pharmacie, sans rupture.
          </h2>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: FileText,
              title: "Rédaction complète",
              body: "Diagnostic, motif, posologie, durée, voie, conseils : chaque ordonnance est structurée et lisible.",
            },
            {
              icon: LockKeyhole,
              title: "Signature engageante",
              body: "Ré-authentification par mot de passe, empreinte HMAC-SHA256 et horodatage. Le document signé est figé.",
            },
            {
              icon: Send,
              title: "Transmission patient",
              body: "L'ordonnance arrive dans « Mes ordonnances » avec une notification. Le patient choisit sa pharmacie.",
            },
            {
              icon: QrCode,
              title: "Vérification pharmacie",
              body: "Un QR code unique permet de contrôler l'authenticité, la version et l'état de l'ordonnance.",
            },
          ].map((f) => (
            <div key={f.title} className="rx-glass rounded-3xl p-5">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#2ee0aa]/12 text-[#5ff0c4]">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-sm font-bold text-white">{f.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#9fc4b9]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sécurité */}
      <section id="securite" className="relative z-10 mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="rx-glass grid gap-6 rounded-[32px] p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#2ee0aa]/25 bg-[#2ee0aa]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#5ff0c4]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Sécurité by design
            </span>
            <h2 className="mt-4 font-display text-3xl text-white">
              Une ordonnance ne peut pas être falsifiée en silence.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#a9ccc2]">
              Chaque signature couvre l'identité du médecin, celle du patient, le diagnostic, les
              médicaments et l'horodatage. Toute modification postérieure à la signature invalide le
              contrôle QR. Les corrections passent par un avenant versionné et audité.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {[
                "Seuls les médecins approuvés peuvent prescrire",
                "Ré-authentification avant chaque signature",
                "Piste d'audit : création, signature, envoi",
                "PDF officiel archivé avec empreinte SHA-256",
              ].map((t) => (
                <div key={t} className="flex items-start gap-2 text-[11px] text-[#c9e5dd]">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#2ee0aa]" />
                  {t}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-[#031713]/60 p-5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8fb8ac]">
                Journal d'audit
              </span>
              <span className="rx-chip border border-[#2ee0aa]/25 bg-[#2ee0aa]/10 text-[#5ff0c4]">
                Temps réel
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {[
                ["10:24", "Signature électronique apposée", "Dr. A. Traoré"],
                ["10:24", "PDF généré et scellé", "SHA-256"],
                ["10:25", "Envoyée à l'espace patient", "Notification"],
                ["10:41", "QR scanné par la pharmacie", "Vérification valide"],
              ].map(([time, label, meta]) => (
                <div key={label} className="flex gap-3">
                  <span className="w-10 shrink-0 pt-0.5 text-[10px] font-mono text-[#7da69b]">
                    {time}
                  </span>
                  <span className="relative flex flex-col border-l border-white/10 pb-3 pl-3 last:pb-0">
                    <span className="absolute -left-[3px] top-1 h-1.5 w-1.5 rounded-full bg-[#2ee0aa]" />
                    <span className="text-[11px] font-semibold text-white">{label}</span>
                    <span className="text-[9px] text-[#8fb8ac]">{meta}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Vérification QR */}
      <section id="verification" className="relative z-10 mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-6 rounded-[32px] border border-[#2ee0aa]/20 bg-gradient-to-br from-[#0b3b31] to-[#06251f] p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#5ff0c4]">
              <ScanLine className="h-4 w-4" />
              Pharmacien · Contrôle
            </span>
            <h2 className="mt-2 font-display text-3xl text-white">
              Vérifier une ordonnance
            </h2>
            <p className="mt-2 max-w-xl text-sm text-[#a9ccc2]">
              Saisissez le code de vérification présent sous le QR code, ou scannez directement le
              QR avec votre téléphone.
            </p>
            <form
              className="mt-4 flex max-w-lg flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                const clean = token.trim();
                if (clean) window.location.href = `/medecin/verifier/${encodeURIComponent(clean)}`;
              }}
            >
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Code de vérification (ex. 8fK2…)"
                className="rx-field-dark flex-1"
              />
              <button type="submit" className="rx-btn-primary px-5 py-2.5 text-sm">
                Vérifier
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
          <div className="hidden h-36 w-36 place-items-center rounded-3xl border border-white/15 bg-white/[0.06] lg:grid">
            <QrCode className="h-20 w-20 text-[#5ff0c4]" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 rounded-[32px] border border-white/10 bg-white/[0.04] px-6 py-8 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-4">
            <span className="hidden h-14 w-14 place-items-center rounded-2xl bg-[#2ee0aa]/12 text-[#5ff0c4] sm:grid">
              <Building2 className="h-7 w-7" />
            </span>
            <div>
              <p className="font-display text-2xl text-white">Prêt à signer votre première ordonnance ?</p>
              <p className="mt-1 text-xs text-[#9fc4b9]">
                Connectez-vous avec votre compte médecin SAHA Santé.
              </p>
            </div>
          </div>
          <Link to="/medecin/connexion" className="rx-btn-primary shrink-0 px-6 py-3 text-sm">
            <Sparkles className="h-4 w-4" />
            Accéder à mon espace
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-[11px] text-[#8fb8ac] sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} SAHA Santé — e-Ordonnance médecin</span>
          <div className="flex items-center gap-4">
            <Link to="/" className="transition hover:text-white">
              SAHA Santé
            </Link>
            <Link to="/privacy" className="transition hover:text-white">
              Confidentialité
            </Link>
            <Link to="/medecin/connexion" className="transition hover:text-white">
              Connexion
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
