import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouter, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/integrations/auth/client";
import { getAuthConfig } from "@/lib/auth.functions";
import { getDoctorSession } from "@/lib/doctor-rx.functions";
import { DoctorBrand } from "@/components/doctor-rx/DoctorShell";
import sahaLogo from "@/assets/saha-logo.jpeg.asset.json";

const searchSchema = z.object({
  reason: z.enum(["not_approved"]).optional(),
});

export const Route = createFileRoute("/medecin/connexion")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Connexion médecin — SAHA Santé e-Ordonnance" }],
  }),
  component: DoctorLogin,
});

function DoctorLogin() {
  const router = useRouter();
  const { reason } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleAvailable, setGoogleAvailable] = useState(false);

  // Aucun raccourci « déjà connecté » : on n'affiche jamais le compte en cours
  // et on n'offre aucun lien direct vers l'espace médecin sur cette page.
  useEffect(() => {
    void getAuthConfig()
      .then((config) => setGoogleAvailable(config.google))
      .catch(() => setGoogleAvailable(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Renseignez votre e-mail et votre mot de passe.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: authError } = await auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError) {
      setError(
        authError.message === "Invalid login credentials"
          ? "E-mail ou mot de passe incorrect."
          : authError.message,
      );
      setLoading(false);
      return;
    }
    // On vérifie l'autorisation avant d'annoncer une connexion réussie :
    // un compte patient/non approuvé ne doit jamais voir de message positif
    // ni obtenir de navigation vers l'espace médecin.
    try {
      const session = await getDoctorSession();
      if (session.access !== "ok") {
        setError(
          "Ce compte n'est pas autorisé à ouvrir l'espace médecin. Seuls les médecins approuvés par l'administrateur peuvent y accéder.",
        );
        setLoading(false);
        return;
      }
    } catch {
      setError("Vérification du profil médecin impossible. Réessayez.");
      setLoading(false);
      return;
    }
    toast.success("Connexion réussie.");
    router.navigate({ to: "/medecin/app" });
  };

  const handleGoogle = () => {
    setError(null);
    setLoading(true);
    // Retour après consentement : /medecin/app applique le filtre « médecin
    // approuvé » (getDoctorSession), exactement comme la connexion par mot de passe.
    auth.signInWithGoogle("/medecin/app");
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_0.95fr]">
      {/* Panneau gauche */}
      <div className="relative hidden overflow-hidden border-r border-white/8 p-10 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -left-20 top-1/3 h-72 w-72 rounded-full bg-[#00c995]/18 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-[#0fb98b]/12 blur-3xl" />
        <DoctorBrand />
        <div className="relative my-auto max-w-lg">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2ee0aa]/25 bg-[#2ee0aa]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5ff0c4]">
            <Stethoscope className="h-3.5 w-3.5" />
            Espace médecin
          </span>
          <h1 className="mt-5 font-display text-4xl leading-[1.1] text-white">
            Vos ordonnances,
            <br />
            signées en un geste.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[#a9ccc2]">
            Retrouvez vos patients, rédigez une prescription structurée et transmettez-la dans
            l'espace SAHA du patient. Chaque document est scellé et vérifiable par QR code.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              ["Signature HMAC-SHA256", "Document figé après signature"],
              ["QR de vérification", "Contrôle pharmacie en un scan"],
              ["Transmission directe", "Notification au patient"],
              ["Piste d'audit", "Chaque action horodatée"],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-white">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#2ee0aa]" />
                  {title}
                </p>
                <p className="mt-1 text-[10px] text-[#9fc4b9]">{body}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-[10px] text-[#7da69b]">
          SAHA Santé · Bamako, Mali — votre santé, notre priorité.
        </p>
      </div>

      {/* Formulaire */}
      <div className="relative flex min-h-dvh flex-col justify-center px-4 py-10 sm:px-8">
        <div className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-[#00c995]/12 blur-3xl lg:hidden" />
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <DoctorBrand compact />
            <Link
              to="/medecin"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/12 bg-white/[0.06] text-[#c9e5dd]"
              aria-label="Retour"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>

          <div className="rx-glass rounded-[30px] p-6 sm:p-8">
            <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-white shadow-lg">
              <img src={sahaLogo.url} alt="" className="h-full w-full object-cover" />
            </span>
            <h2 className="mt-4 font-display text-3xl text-white">Connexion médecin</h2>
            <p className="mt-1 text-xs leading-relaxed text-[#9fc4b9]">
              Utilisez l'adresse e-mail rattachée à votre profil praticien approuvé.
            </p>

            {reason === "not_approved" && (
              <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-3 text-[11px] leading-relaxed text-amber-100">
                Cet espace est réservé aux médecins approuvés par l'administrateur SAHA Santé.
                Connectez-vous avec un compte autorisé.
              </div>
            )}

            {googleAvailable && (
              <>
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={loading}
                  className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-2xl border border-white/14 bg-white/[0.07] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.12] disabled:opacity-60"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continuer avec Google
                </button>
                <div className="my-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-[10px] uppercase tracking-widest text-[#7da69b]">ou</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
              </>
            )}

            <form onSubmit={submit} className="mt-6 space-y-4">
              <label className="block">
                <span className="rx-label-dark">Adresse e-mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="medecin@exemple.com"
                  className="rx-field-dark"
                  autoComplete="email"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="rx-label-dark">Mot de passe</span>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Votre mot de passe"
                    className="rx-field-dark pr-11"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7da69b] transition hover:text-white"
                    aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              {error && (
                <div className="rounded-xl border border-rose-300/25 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="rx-btn-primary w-full px-5 py-3 text-sm"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {loading ? "Connexion…" : "Se connecter"}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between text-[11px]">
              <Link to="/reset-password" className="text-[#9fc4b9] transition hover:text-white">
                Mot de passe oublié ?
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signin" }}
                className="inline-flex items-center gap-1 font-semibold text-[#5ff0c4]"
              >
                Connexion par téléphone
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#8fb8ac]">
                <LockKeyhole className="h-3.5 w-3.5 text-[#2ee0aa]" />
                Accès réservé
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-[#9fc4b9]">
                Seuls les médecins dont le profil a été approuvé par un administrateur SAHA Santé
                peuvent signer une ordonnance. Vous n'avez pas encore de compte ?{" "}
                <Link to="/auth" search={{ mode: "signup" }} className="font-semibold text-[#5ff0c4]">
                  Créer un compte
                </Link>
                .
              </p>
            </div>
          </div>

          <p className="mt-5 text-center text-[10px] text-[#7da69b]">
            <Link to="/medecin" className="transition hover:text-white">
              ← Retour à la présentation
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
