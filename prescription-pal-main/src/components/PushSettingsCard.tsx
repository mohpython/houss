import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { BellRing, BellOff, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listMyDevices } from "@/lib/push.functions";
import {
  currentPlatform,
  currentPushState,
  disablePush,
  enablePush,
  pushBlockedReason,
  type PushState,
} from "@/lib/push-client";

/**
 * Permanent push settings card. Unlike the dismissible banner, this control is
 * always reachable: once "Plus tard" has been pressed the banner never shows
 * again, which used to leave no way to enable notifications from the UI.
 *
 * When the browser claims to be registered, the card checks the server before
 * saying so: a token saved locally while its registration failed used to display
 * "active" forever while no notification could ever arrive.
 */
export function PushSettingsCard() {
  const { t, i18n } = useTranslation();
  const listDevices = useServerFn(listMyDevices);
  const [state, setState] = useState<PushState>("unsupported");
  const [blocked, setBlocked] = useState<"iframe" | "browser" | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  /** null = verification en cours ou impossible, true/false = verifie. */
  const [registered, setRegistered] = useState<boolean | null>(null);

  useEffect(() => {
    setState(currentPushState());
    setBlocked(pushBlockedReason());
    // Re-check on focus: the browser permission can be changed in its settings
    // while the tab stays open.
    const onFocus = () => setState(currentPushState());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    if (state !== "granted") {
      setRegistered(null);
      return;
    }
    let alive = true;
    setRegistered(null);
    (async () => {
      try {
        const devices = (await listDevices()) as Array<{ platform: string }>;
        const mine = currentPlatform();
        if (alive) setRegistered(devices.some((d) => d.platform === mine));
      } catch (e) {
        // Sans verification, on ne peut pas pretendre que tout va bien.
        console.warn("[push] lecture de la liste des appareils impossible", e);
        if (alive) setRegistered(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [state, nonce, listDevices]);

  const enable = async () => {
    setBusy(true);
    try {
      const next = await enablePush(i18n.language);
      setState(next);
      setNonce((n) => n + 1);
      if (next === "granted") toast.success(t("push.enabled"));
      else if (next === "denied") toast.error(t("push.denied"));
      else toast.error(t("push.notConfigured"));
    } catch (e) {
      // Keep the technical reason in the console: the toast alone was not enough
      // to tell a failed registration from a refused permission.
      console.error("[push] activation web impossible", e);
      toast.error(t("push.unavailable"));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await disablePush();
      setState(currentPushState());
      setNonce((n) => n + 1);
      toast.success(t("push.disabled"));
    } finally {
      setBusy(false);
    }
  };

  if (state === "unsupported") return null;

  // The browser says "granted" but the server has no token for this platform.
  const orphan = state === "granted" && registered === false;

  const title = orphan
    ? t("push.notRegistered")
    : state === "granted"
      ? t("push.activeTitle")
      : state === "denied"
        ? t("push.deniedTitle")
        : t("push.title");

  const body = orphan
    ? t("push.notRegisteredBody")
    : state === "granted"
      ? t("push.subtitle")
      : state === "denied"
        ? t("push.deniedBody")
        : blocked === "iframe"
          ? t("push.iframeBody")
          : t("push.subtitle");

  const showEnable = orphan || (state !== "granted" && state !== "denied");

  return (
    <section
      className="w-full rounded-2xl border border-border bg-muted px-4 py-3"
      aria-label={t("push.title")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {state === "granted" && !orphan ? (
            <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          ) : (
            <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{title}</div>
            <div className="mt-0.5 text-xs text-foreground/60">{body}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {blocked === "iframe" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => window.open(window.location.href, "_blank", "noopener")}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t("push.openTab")}
            </Button>
          )}
          {showEnable ? (
            <Button
              size="sm"
              className="aurora-bg text-primary-foreground"
              onClick={enable}
              disabled={busy}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("push.enable")}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={disable} disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BellOff className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}