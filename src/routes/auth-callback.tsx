import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  component: AuthCallback,
});

const REDIRECT_KEY = "saha_post_login_path";

function safePath(value: string | null): string {
  if (!value) return "/app";
  if (!value.startsWith("/") || value.startsWith("//")) return "/app";
  return value;
}

function AuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      let target = "/app";
      try {
        target = safePath(sessionStorage.getItem(REDIRECT_KEY));
        sessionStorage.removeItem(REDIRECT_KEY);
      } catch {
        target = "/app";
      }
      navigate({ to: target, replace: true });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish();
    });

    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      setFailed(true);
      toast.error(t("auth.googleError"));
      navigate({ to: "/auth", replace: true });
    }, 10000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate, t]);

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6">
      <AuroraBackground intense />
      <GlassCard className="w-full max-w-sm p-8 text-center">
        <img
          src={sahaLogo.url}
          alt="SAHA Santé"
          className="mx-auto h-14 w-14 rounded-2xl object-cover ring-1 ring-white/20"
        />
        <div className="mt-6 flex items-center justify-center gap-3">
          {!failed && <Loader2 className="h-5 w-5 animate-spin text-accent" />}
          <p className="text-sm text-foreground/80">
            {failed ? t("auth.googleError") : t("auth.connecting")}
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
