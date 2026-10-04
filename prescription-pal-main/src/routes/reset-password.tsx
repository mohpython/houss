import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { auth } from "@/integrations/auth/client";
import { AuroraBackground } from "@/components/AuroraBackground";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import sahaLogo from "@/assets/saha-logo.jpeg.asset.json";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  validateSearch: z.object({ token: z.string().optional() }),
  head: () => ({
    meta: [{ title: "Nouveau mot de passe — SAHA Santé" }, { name: "robots", content: "noindex" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    const { error } = await auth.resetPassword(token, password);
    setLoading(false);
    if (error) {
      toast.error(error.message || t("auth.resetInvalid"));
      return;
    }
    toast.success(t("auth.resetDone"));
    navigate({ to: "/app", replace: true });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6">
      <AuroraBackground intense />
      <GlassCard className="w-full max-w-sm p-8">
        <Link to="/" className="mb-6 flex items-center gap-3">
          <img
            src={sahaLogo.url}
            alt="SAHA Santé"
            className="h-10 w-10 rounded-2xl object-cover ring-1 ring-ring"
          />
          <span className="font-display text-xl">SAHA Santé</span>
        </Link>
        <h1 className="font-display text-2xl">{t("auth.resetTitle")}</h1>
        {!token ? (
          <p className="mt-4 text-sm text-foreground/70">{t("auth.resetInvalid")}</p>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-xs uppercase tracking-widest text-foreground/60"
              >
                {t("auth.newPassword")}
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="h-11 rounded-xl border-border bg-muted"
              />
            </div>
            <Button
              type="submit"
              className="h-11 w-full rounded-full aurora-bg text-on-aurora shadow-lg shadow-primary/30"
              disabled={loading}
            >
              {loading ? "..." : t("auth.resetSave")}
            </Button>
          </form>
        )}
        <div className="mt-5 text-center text-xs">
          <Link to="/auth" className="text-primary hover:underline">
            {t("auth.toSignin")}
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
