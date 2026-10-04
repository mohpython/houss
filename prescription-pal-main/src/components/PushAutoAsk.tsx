import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  currentPushState,
  enablePush,
  isNative,
  prefetchPushWebConfig,
  webPushSupported,
} from "@/lib/push-client";

const ASKED_KEY = "saha.push.asked";

/**
 * Demande la permission notifications sans que le client ait a cliquer sur un
 * bouton "Activer".
 *
 * Contrainte du navigateur : `Notification.requestPermission()` n'est acceptee
 * que si elle est declenchee par une interaction reelle. On ecoute donc la premiere
 * interaction sur le site (clic, tape, scroll tactile) et on declenche la demande
 * a ce moment-la. Si la permission est deja accordee, l'enregistrement est
 * refait immediatement, sans geste : c'est le rattrapage d'un jeton jamais
 * enregistre.
 *
 * Ensuite, c'est le serveur qui envoie a tous ceux qui ont autorise.
 */
export function PushAutoAsk() {
  const { i18n } = useTranslation();

  useEffect(() => {
    // Le serveur d'abord : la demande doit partir dans le meme tick que le geste.
    prefetchPushWebConfig();

    if (isNative() || !webPushSupported()) return;
    if (currentPushState() === "denied") return;

    const run = () => {
      enablePush(i18n.language).catch((e) => {
        console.warn("[push] enregistrement automatique impossible", e);
      });
    };

    // Permission deja accordee : rien a demander, on enregistre.
    if (Notification.permission === "granted") {
      run();
      return;
    }

    let asked = false;
    try {
      asked = localStorage.getItem(ASKED_KEY) === "1";
    } catch {
      asked = true; // stockage indisponible : on ne relance pas a chaque visite
    }
    if (asked) return;

    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    const onFirstGesture = () => {
      for (const e of events) window.removeEventListener(e, onFirstGesture, true);
      try {
        localStorage.setItem(ASKED_KEY, "1");
      } catch {
        /* sans importance : la permission elle-meme fera foi */
      }
      run();
    };
    for (const e of events) {
      window.addEventListener(e, onFirstGesture, { capture: true, passive: true });
    }
    return () => {
      for (const e of events) window.removeEventListener(e, onFirstGesture, true);
    };
  }, [i18n.language]);

  return null;
}