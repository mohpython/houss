/**
 * Client-side push registration. Works on:
 *  - Android/iOS through Capacitor (@capacitor/push-notifications)
 *  - Browsers through Firebase Cloud Messaging + a messaging service worker
 *
 * Never registers inside the Lovable preview iframe.
 */

import { Capacitor } from "@capacitor/core";
import {
  registerDeviceToken,
  unregisterDeviceToken,
  getPushWebConfig,
} from "@/lib/push.functions";

export type PushState = "unsupported" | "default" | "granted" | "denied";

type WebConfig = Awaited<ReturnType<typeof getPushWebConfig>>;

const TOKEN_KEY = "saha.push.token";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

function inIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function webPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    !inIframe()
  );
}

/** Why push cannot be enabled here, when it cannot. */
export function pushBlockedReason(): "iframe" | "browser" | null {
  if (typeof window === "undefined") return "browser";
  if (isNative()) return null;
  if (inIframe()) return "iframe";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "browser";
  return null;
}

export function currentPushState(): PushState {
  if (typeof window === "undefined") return "unsupported";
  if (isNative()) return (localStorage.getItem(TOKEN_KEY) ? "granted" : "default");
  if (!webPushSupported()) return "unsupported";
  const perm = Notification.permission;
  if (perm === "granted") return localStorage.getItem(TOKEN_KEY) ? "granted" : "default";
  if (perm === "denied") return "denied";
  return "default";
}


async function saveToken(token: string, platform: "android" | "ios" | "web", language: string) {
  localStorage.setItem(TOKEN_KEY, token);
  await registerDeviceToken({
    data: {
      token,
      platform,
      language: language === "en" || language === "ar" ? language : "fr",
    },
  });
}

/* ---------------------------------- native --------------------------------- */

async function enableNative(language: string): Promise<PushState> {
  const { PushNotifications } = await import("@capacitor/push-notifications");

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") return "denied";

  const platform: "android" | "ios" =
    Capacitor.getPlatform() === "ios" ? "ios" : "android";

  const token = await new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 12000);
    PushNotifications.addListener("registration", (t) => {
      clearTimeout(timer);
      resolve(t.value);
    });
    PushNotifications.addListener("registrationError", () => {
      clearTimeout(timer);
      resolve(null);
    });
    PushNotifications.register();
  });

  if (!token) return "default";
  await saveToken(token, platform, language);
  return "granted";
}

/** Handles taps on native notifications by navigating in the web view. */
export async function attachNativeTapHandler(navigate: (path: string) => void) {
  if (!isNative()) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const link = action.notification.data?.link;
    if (typeof link === "string" && link.startsWith("/")) navigate(link);
  });
}

/* ----------------------------------- web ----------------------------------- */

let cachedConfig: WebConfig | null = null;

async function loadWebConfig(): Promise<WebConfig> {
  if (!cachedConfig) cachedConfig = await getPushWebConfig();
  return cachedConfig;
}

async function enableWeb(language: string): Promise<PushState> {
  if (!webPushSupported()) return "unsupported";

  const config = await loadWebConfig();
  if (!config.configured) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const params = new URLSearchParams({
    apiKey: config.apiKey,
    projectId: config.projectId,
    senderId: config.senderId,
    appId: config.appId,
  });
  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register(
      `/firebase-messaging-sw.js?${params.toString()}`,
      { scope: "/firebase-cloud-messaging-push-scope" },
    );
  } catch (e) {
    console.error("[push] enregistrement du service worker impossible", e);
    throw e;
  }

  const { initializeApp, getApps, getApp } = await import("firebase/app");
  const { getMessaging, getToken, onMessage } = await import("firebase/messaging");

  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.senderId,
        appId: config.appId,
      });

  const messaging = getMessaging(app);
  let token: string | null;
  try {
    token = await getToken(messaging, {
      vapidKey: config.vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch (e) {
    console.error("[push] obtention du jeton FCM impossible", e);
    throw e;
  }
  if (!token) {
    console.warn("[push] FCM a renvoye un jeton vide");
    return "default";
  }

  onMessage(messaging, () => {
    /* foreground messages are already shown by the in-app toast */
  });

  try {
    await saveToken(token, "web", language);
  } catch (e) {
    console.error("[push] enregistrement du jeton cote serveur impossible", e);
    throw e;
  }
  return "granted";
}

/* ---------------------------------- public --------------------------------- */

export async function enablePush(language: string): Promise<PushState> {
  return isNative() ? enableNative(language) : enableWeb(language);
}

export async function disablePush(): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  if (token) {
    try {
      await unregisterDeviceToken({ data: { token } });
    } catch {
      /* ignore */
    }
  }
}

/** Silently refresh the stored token on app start when already granted. */
export async function refreshPushRegistration(language: string) {
  if (typeof window === "undefined") return;
  if (!localStorage.getItem(TOKEN_KEY)) return;
  if (!isNative() && (!webPushSupported() || Notification.permission !== "granted")) return;
  try {
    await enablePush(language);
  } catch {
    /* ignore */
  }
}
