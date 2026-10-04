import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { auth } from "@/integrations/auth/client";
import { getAuthConfig } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AuroraBackground } from "@/components/AuroraBackground";
import { GlassCard } from "@/components/GlassCard";
import sahaLogo from "@/assets/saha-logo.jpeg.asset.json";
import { Camera, Sparkles, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Connexion — SAHA Santé" },
      {
        name: "description",
        content: "Accédez à votre compte SAHA Santé pour scanner et livrer vos ordonnances.",
      },
      { property: "og:title", content: "Connexion — SAHA Santé" },
      {
        property: "og:description",
        content: "Accédez à votre compte SAHA Santé pour scanner et livrer vos ordonnances.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sahasantemali.com/auth" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://sahasantemali.com/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mode: initialMode, error: callbackError } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode ?? "signin");
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("+223");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({ google: false, phone: false, passwordReset: true });
  // `config.google` vaut `false` tant que `getAuthConfig()` n'a pas répondu :
  // sans ce drapeau, l'écran d'inscription afficherait brièvement « indisponible ».
  const [configLoaded, setConfigLoaded] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const PHONE_AUTH_ENABLED = config.phone;

  useEffect(() => {
    auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
    getAuthConfig()
      .then((c) => {
        setConfig(c);
        setConfigLoaded(true);
      })
      .catch(() => setConfigLoaded(true));
  }, [navigate]);

  useEffect(() => {
    if (callbackError) toast.error(t("auth.googleError"));
  }, [callbackError, t]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await auth.signUp({ email, password, fullName });
        if (error) throw error;
        toast.success(t("auth.created"));
        navigate({ to: "/app" });
      } else {
        const { error } = await auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/app" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.authError"));
    } finally {
      setLoading(false);
    }
  };

  const normalizedPhone = phone.replace(/[\s-]/g, "");
  const isValidPhone = /^\+[1-9]\d{7,14}$/.test(normalizedPhone);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPhone) {
      toast.error(t("auth.invalidPhone"));
      return;
    }
    setLoading(true);
    try {
      const { error } = await auth.signInWithOtp({
        phone: normalizedPhone,
        fullName: mode === "signup" ? fullName : undefined,
      });
      if (error) throw error;
      setOtpSent(true);
      setResendCooldown(60);
      toast.success(t("auth.codeSent"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.phoneError"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error(t("auth.invalidCode"));
      return;
    }
    setLoading(true);
    try {
      const { error } = await auth.verifyOtp({ phone: normalizedPhone, token: otp });
      if (error) throw error;
      navigate({ to: "/app" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.invalidCode"));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    setLoading(true);
    auth.signInWithGoogle("/app");
  };

  return (
    <div className="relative min-h-screen">
      <AuroraBackground intense />

      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-8 px-6 py-8 md:grid-cols-2 md:items-center md:py-16">
        {/* Left: brand story */}
        <div className="hidden md:flex md:flex-col md:justify-between md:pr-8">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={sahaLogo.url}
              alt="SAHA Santé"
              className="h-11 w-11 rounded-2xl object-cover ring-1 ring-ring"
            />
            <span className="font-display text-2xl">SAHA Santé</span>
          </Link>

          <div className="mt-16">
            <h1 className="font-display text-6xl leading-[1.02]">
              {t("auth.brandTagline1")}
              <br />
              <span className="italic aurora-text">{t("auth.brandTagline2")}</span>
            </h1>
            <p className="mt-6 max-w-md text-foreground/70">{t("auth.brandDesc")}</p>

            <div className="mt-10 space-y-4">
              <Perk icon={<Sparkles className="h-4 w-4" />} label={t("auth.perk1")} />
              <Perk icon={<Camera className="h-4 w-4" />} label={t("auth.perk2")} />
              <Perk icon={<ShieldCheck className="h-4 w-4" />} label={t("auth.perk3")} />
            </div>
          </div>

          <div className="mt-16 text-xs text-muted-foreground">
            © {new Date().getFullYear()} SAHA Santé · Mali
          </div>
        </div>

        {/* Right: auth card */}
        <div className="mx-auto w-full max-w-md">
          <div className="mb-4 flex items-center justify-between md:hidden">
            <Link to="/" className="flex items-center gap-2">
              <img
                src={sahaLogo.url}
                alt="SAHA Santé"
                className="h-9 w-9 rounded-xl object-cover ring-1 ring-ring"
              />
              <span className="font-display text-lg">SAHA Santé</span>
            </Link>
            <LanguageSwitcher compact />
          </div>
          <div className="mb-4 hidden justify-end md:flex">
            <LanguageSwitcher compact />
          </div>

          <GlassCard className="p-7 md:p-9">
            <h2 className="font-display text-3xl">
              {mode === "signup" ? t("auth.signupTitle") : t("auth.signinTitle")}
            </h2>
            <p className="mt-1 text-sm text-foreground/60">
              {mode === "signup" ? t("auth.signupSub") : t("auth.signinSub")}
            </p>

            {config.google && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-6 h-11 w-full rounded-full border border-border bg-muted text-foreground hover:bg-secondary"
                  onClick={handleGoogle}
                  disabled={loading}
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
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
                  {t("auth.google")}
                </Button>

                {/* Séparateur « ou » uniquement pour la connexion : à l'inscription,
                    Google est le seul moyen de créer un compte (identité prouvée). */}
                {mode === "signin" && (
                  <div className="my-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-secondary" />
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {t("auth.or")}
                    </span>
                    <div className="h-px flex-1 bg-secondary" />
                  </div>
                )}
              </>
            )}
            {mode === "signup" && configLoaded && config.google && (
              <p className="mt-3 text-center text-xs leading-relaxed text-foreground/60">
                {t("auth.signupGoogleOnly")}
              </p>
            )}
            {mode === "signup" && configLoaded && !config.google && (
              <p className="mt-6 rounded-xl border border-border bg-muted p-3 text-center text-xs text-foreground/70">
                {t("auth.signupUnavailable")}
              </p>
            )}
            {mode === "signin" && !config.google && <div className="mt-6" />}

            {/* Method toggle — phone is hidden until the SMS provider is configured */}
            {mode === "signin" && PHONE_AUTH_ENABLED && (
              <div className="mb-4 grid grid-cols-2 gap-1 rounded-full border border-border bg-muted p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMethod("email");
                    setOtpSent(false);
                  }}
                  className={`h-9 rounded-full text-xs font-medium transition ${method === "email" ? "bg-secondary text-foreground" : "text-foreground/60 hover:text-foreground"}`}
                >
                  {t("auth.methodEmail")}
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("phone")}
                  className={`h-9 rounded-full text-xs font-medium transition ${method === "phone" ? "bg-secondary text-foreground" : "text-foreground/60 hover:text-foreground"}`}
                >
                  {t("auth.methodPhone")}
                </button>
              </div>
            )}

            {/* Formulaires e-mail / téléphone : disponibles à la CONNEXION uniquement
                (les comptes existants, notamment les gérants de pharmacie). */}
            {mode === "signin" && (
              <>
            {method === "email" && (
              <form onSubmit={handleEmail} className="space-y-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="email"
                    className="text-xs uppercase tracking-widest text-foreground/60"
                  >
                    {t("auth.email")}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="h-11 rounded-xl border-border bg-muted"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="password"
                    className="text-xs uppercase tracking-widest text-foreground/60"
                  >
                    {t("auth.password")}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="current-password"
                    className="h-11 rounded-xl border-border bg-muted"
                  />
                </div>
                {config.passwordReset && (
                  <div className="text-right">
                    <button
                      type="button"
                      className="text-xs text-foreground/60 hover:text-foreground hover:underline"
                      onClick={() => setForgotOpen(true)}
                    >
                      {t("auth.forgotPassword")}
                    </button>
                  </div>
                )}
                <Button
                  type="submit"
                  className="mt-2 h-11 w-full rounded-full aurora-bg text-primary-foreground shadow-lg shadow-primary/30"
                  disabled={loading}
                >
                  {loading ? "..." : t("auth.signIn")}
                </Button>
              </form>
            )}

            {method === "phone" && !otpSent && (
              <form onSubmit={handleSendOtp} className="space-y-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="phone"
                    className="text-xs uppercase tracking-widest text-foreground/60"
                  >
                    {t("auth.phone")}
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t("auth.phonePlaceholder")}
                    required
                    autoComplete="tel"
                    className="h-11 rounded-xl border-border bg-muted"
                    dir="ltr"
                  />
                </div>
                <Button
                  type="submit"
                  className="mt-2 h-11 w-full rounded-full aurora-bg text-primary-foreground shadow-lg shadow-primary/30"
                  disabled={loading || !isValidPhone}
                >
                  {loading ? t("auth.sending") : t("auth.sendCode")}
                </Button>
              </form>
            )}

            {method === "phone" && otpSent && (
              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <p className="text-sm text-foreground/70">
                  {t("auth.codeSubtitle", { phone: normalizedPhone })}
                </p>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="otp"
                    className="text-xs uppercase tracking-widest text-foreground/60"
                  >
                    {t("auth.enterCode")}
                  </Label>
                  <Input
                    id="otp"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    required
                    autoComplete="one-time-code"
                    className="h-12 rounded-xl border-border bg-muted text-center text-2xl tracking-[0.5em]"
                    dir="ltr"
                  />
                </div>
                <Button
                  type="submit"
                  className="mt-2 h-11 w-full rounded-full aurora-bg text-primary-foreground shadow-lg shadow-primary/30"
                  disabled={loading || otp.length !== 6}
                >
                  {loading ? t("auth.verifying") : t("auth.verify")}
                </Button>
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    className="text-foreground/60 hover:text-foreground"
                    onClick={() => {
                      setOtpSent(false);
                      setOtp("");
                    }}
                  >
                    {t("auth.changeNumber")}
                  </button>
                  <button
                    type="button"
                    disabled={resendCooldown > 0 || loading}
                    className="font-medium text-primary hover:underline disabled:text-foreground/40 disabled:no-underline"
                    onClick={(e) => handleSendOtp(e as unknown as React.FormEvent)}
                  >
                    {resendCooldown > 0
                      ? t("auth.resendIn", { seconds: resendCooldown })
                      : t("auth.resend")}
                  </button>
                </div>
              </form>
            )}
              </>
            )}

            <p className="mt-5 text-center text-xs text-foreground/60">
              {mode === "signup" ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => {
                  setMode(mode === "signup" ? "signin" : "signup");
                  setOtpSent(false);
                }}
              >
                {mode === "signup" ? t("auth.toSignin") : t("auth.toSignup")}
              </button>
            </p>
          </GlassCard>
        </div>
      </div>
      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} initialEmail={email} />
    </div>
  );
}

function ForgotPasswordDialog({
  open,
  onOpenChange,
  initialEmail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEmail: string;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialEmail);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) setValue(initialEmail);
  }, [open, initialEmail]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    const { error } = await auth.requestPasswordReset(value);
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("auth.resetSent"));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("auth.resetTitle")}</DialogTitle>
          <DialogDescription>{t("auth.resetSub")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            autoComplete="email"
            placeholder={t("auth.email")}
            className="h-11 rounded-xl"
          />
          <Button type="submit" className="h-11 w-full rounded-full" disabled={sending}>
            {sending ? t("auth.sending") : t("auth.resetSend")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Perk({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-foreground">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-muted text-accent">
        {icon}
      </div>
      {label}
    </div>
  );
}
