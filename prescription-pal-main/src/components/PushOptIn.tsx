import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellRing, BellOff, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  currentPushState,
  disablePush,
  enablePush,
  pushBlockedReason,
  type PushState,
} from "@/lib/push-client";

/** Banner asking the user to allow system push notifications. */
export function PushOptIn() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<PushState>("unsupported");
  const [blocked, setBlocked] = useState<"iframe" | "browser" | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setState(currentPushState());
    setBlocked(pushBlockedReason());
    try {
      setDismissed(localStorage.getItem("saha.push.dismissed") === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const next = await enablePush(i18n.language);
      setState(next);
      if (next === "granted") toast.success(t("push.enabled"));
      else if (next === "denied") toast.error(t("push.denied"));
      else toast.error(t("push.notConfigured"));
    } catch (e) {
      // Le toast seul ne permettait pas de distinguer un enregistrement refuse
      // d'une permission bloquee : on garde la raison technique dans la console.
      console.error("[push] activation impossible", e);
      toast.error(t("push.unavailable"));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    await disablePush();
    setState(currentPushState());
    setBusy(false);
    toast.success(t("push.disabled"));
  };

  const dismiss = () => {
    try {
      localStorage.setItem("saha.push.dismissed", "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      {children}
    </div>
  );

  if (state === "granted") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <BellRing className="h-5 w-5 shrink-0 text-accent" />
          <span className="truncate text-sm text-foreground/80">{t("push.activeTitle")}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={disable} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}
        </Button>
      </div>
    );
  }

  if (dismissed) return null;

  // Inside an iframe (embedded preview) browsers block the Notification API.
  if (blocked === "iframe") {
    return (
      <Shell>
        <div className="flex min-w-0 items-start gap-3">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{t("push.iframeTitle")}</div>
            <div className="text-xs text-foreground/60">{t("push.iframeBody")}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            className="aurora-bg text-primary-foreground"
            onClick={() => window.open(window.location.href, "_blank", "noopener")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            {t("push.openTab")}
          </Button>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            {t("push.later")}
          </Button>
        </div>
      </Shell>
    );
  }

  if (state === "denied") {
    return (
      <Shell>
        <div className="flex min-w-0 items-start gap-3">
          <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{t("push.deniedTitle")}</div>
            <div className="text-xs text-foreground/60">{t("push.deniedBody")}</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={dismiss}>
          {t("push.later")}
        </Button>
      </Shell>
    );
  }

  if (state === "unsupported") return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{t("push.title")}</div>
          <div className="text-xs text-foreground/60">{t("push.subtitle")}</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          className="aurora-bg text-primary-foreground"
          onClick={enable}
          disabled={busy}
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("push.enable")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            try {
              localStorage.setItem("saha.push.dismissed", "1");
            } catch {
              /* ignore */
            }
            setDismissed(true);
          }}
        >
          {t("push.later")}
        </Button>
      </div>
    </div>
  );
}
