import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { auth } from "@/integrations/auth/client";
import { AuroraBackground } from "@/components/AuroraBackground";
import { GlassCard } from "@/components/GlassCard";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import sahaLogo from "@/assets/saha-logo.jpeg.asset.json";

export const Route = createFileRoute("/auth-callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connexion en cours — SAHA Santé" },
      {
        name: "description",
        content: "Finalisation de votre connexion sécurisée à SAHA Santé.",
      },
      { property: "og:title", content: "Connexion en cours — SAHA Santé" },
      {
        property: "og:description",
        content: "Finalisation de votre connexion sécurisée à SAHA Santé.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    mobile: search.mobile === "1" || search.mobile === 1 ? "1" : undefined,
  }),
  component: AuthCallback,
});

const REDIRECT_KEY = "saha_post_login_path";
const DEEP_LINK = "sahasantemali://auth";

function safePath(value: string | null): string {
  if (!value) return "/app";
  if (!value.startsWith("/") || value.startsWith("//")) return "/app";
  return value;
}

// TanStack Router réécrit `?mobile=1` en `?mobile=%221%22` (la valeur est
// sérialisée en JSON), et `validateSearch` ne reçoit pas toujours l'écriture
// d'origine. On relit donc l'indicateur directement dans la barre d'adresse et
// on ne conserve que les chiffres : `1`, `"1"` et `"\"1\""` sont tous acceptés.
function detectMobileFlow(fromRouter: unknown): boolean {
  const candidates: string[] = [];
  if (typeof fromRouter === "string" || typeof fromRouter === "number") {
    candidates.push(String(fromRouter));
  }
  try {
    candidates.push(new URLSearchParams(window.location.search).get("mobile") ?? "");
  } catch {
    /* URL illisible */
  }
  return candidates.some((value) => value.replace(/[^0-9]/g, "") === "1");
}

function AuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mobile: routerMobile } = useSearch({ from: "/auth-callback" });
  // Calculé une seule fois, au montage : c'est le seul moment où la barre
  // d'adresse porte encore `?mobile=…` (l'effet la nettoie ensuite).
  const [mobile] = useState(() => detectMobileFlow(routerMobile));
  const [failed, setFailed] = useState(false);
  // Flux application mobile : lien profond prêt à être ouvert.
  const [deepLink, setDeepLink] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fail = () => {
      if (cancelled) return;
      setFailed(true);
      toast.error(t("auth.googleError"));
      navigate({ to: "/auth", replace: true });
    };

    // Le serveur renvoie le jeton dans le fragment (#access_token=...&expires_at=...&redirect=...)
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = params.get("access_token");
    const expiresAt = Number(params.get("expires_at") ?? 0);

    if (mobile) {
      // Efface le jeton de la barre d'adresse et de l'historique.
      window.history.replaceState(null, "", window.location.pathname);
      if (!token) return fail();
      if (cancelled) return;
      const query = new URLSearchParams({ access_token: token, expires_at: String(expiresAt) });
      setDeepLink(`${DEEP_LINK}?${query.toString()}`);
      // Tentative automatique : certains navigateurs l'acceptent, Chrome la
      // bloque — d'où le bouton, qui fonctionne dans tous les cas.
      const timer = window.setTimeout(() => {
        window.location.href = `${DEEP_LINK}?${query.toString()}`;
      }, 700);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    // Efface le jeton de la barre d'adresse et de l'historique.
    window.history.replaceState(null, "", window.location.pathname);

    if (!token) {
      // Pas de jeton : session déjà ouverte ? sinon échec.
      auth
        .getSession()
        .then(({ data }) => (data.session ? navigate({ to: "/app", replace: true }) : fail()));
      return;
    }

    auth.setSessionFromToken(token, expiresAt).then(({ error }) => {
      if (cancelled) return;
      if (error) return fail();
      let target = safePath(params.get("redirect"));
      try {
        const stored = sessionStorage.getItem(REDIRECT_KEY);
        if (stored) target = safePath(stored);
        sessionStorage.removeItem(REDIRECT_KEY);
      } catch {
        /* sessionStorage indisponible */
      }
      navigate({ to: target, replace: true });
    });

    return () => {
      cancelled = true;
    };
  }, [navigate, t, mobile]);

  if (deepLink) {
    return (
      <div className="relative flex min-h-screen items-center justify-center px-6">
        <AuroraBackground intense />
        <GlassCard className="w-full max-w-sm p-8 text-center">
          <img
            src={sahaLogo.url}
            alt="SAHA Santé"
            className="mx-auto h-14 w-14 rounded-2xl object-cover ring-1 ring-ring"
          />
          <p className="mt-6 text-sm text-foreground">{t("auth.openApp")}</p>
          <a
            href={deepLink}
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
          >
            {t("auth.openApp")}
          </a>
          <p className="mt-4 text-xs text-foreground/60">{t("auth.openAppHint")}</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6">
      <AuroraBackground intense />
      <GlassCard className="w-full max-w-sm p-8 text-center">
        <img
          src={sahaLogo.url}
          alt="SAHA Santé"
          className="mx-auto h-14 w-14 rounded-2xl object-cover ring-1 ring-ring"
        />
        <div className="mt-6 flex items-center justify-center gap-3">
          {!failed && <Loader2 className="h-5 w-5 animate-spin text-accent" />}
          <p className="text-sm text-foreground">
            {failed ? t("auth.googleError") : t("auth.connecting")}
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
