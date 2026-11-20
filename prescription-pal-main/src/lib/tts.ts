/**
 * Voix bambara en ligne (Svara TTS), avec repli sur la voix du navigateur.
 *
 * Les phrases bambara sont fixes et validées : la route serveur met l'audio en
 * cache disque, donc une phrase n'est synthétisée qu'une fois. Si la clé Svara
 * n'est pas configurée, `speakBambara` renvoie `false` et l'appelant utilise
 * `speak()` (voix française du navigateur).
 */
import { getAccessToken } from "@/integrations/auth/session-store";

export type BambaraTtsState = "idle" | "loading" | "playing";

const MAX_CACHED = 24;
/** Nouvelle vérification après un échec (clé ajoutée sans recharger la page). */
const AVAILABILITY_RETRY_MS = 60_000;

let state: BambaraTtsState = "idle";
const stateListeners = new Set<(state: BambaraTtsState) => void>();

let available: boolean | null = null;
let availableAt = 0;
let availabilityRequest: Promise<boolean> | null = null;

let audio: HTMLAudioElement | null = null;
/** Incrémenté à chaque arrêt : annule une lecture encore en préparation. */
let playToken = 0;

const audioUrls = new Map<string, string>();
const pendingRequests = new Map<string, Promise<string | null>>();

function setState(next: BambaraTtsState) {
  if (state === next) return;
  state = next;
  for (const listener of [...stateListeners]) {
    try {
      listener(state);
    } catch {
      /* un abonné défaillant ne doit pas bloquer la lecture */
    }
  }
}

export function getBambaraTtsState(): BambaraTtsState {
  return state;
}

export function subscribeBambaraTts(listener: (state: BambaraTtsState) => void): () => void {
  stateListeners.add(listener);
  listener(state);
  return () => {
    stateListeners.delete(listener);
  };
}

async function checkAvailability(): Promise<boolean> {
  if (available === true) return true;
  if (available === false && Date.now() - availableAt < AVAILABILITY_RETRY_MS) return false;
  if (!availabilityRequest) {
    availabilityRequest = fetch("/api/tts/bambara")
      .then(async (res) => {
        if (!res.ok) return false;
        const json = (await res.json().catch(() => ({}))) as { configured?: unknown };
        return json.configured === true;
      })
      .catch(() => false)
      .then((value) => {
        available = value;
        availableAt = Date.now();
        availabilityRequest = null;
        return value;
      });
  }
  return availabilityRequest;
}

function trimCache(keep: string) {
  while (audioUrls.size > MAX_CACHED) {
    const oldest = audioUrls.keys().next().value as string | undefined;
    if (!oldest || oldest === keep) break;
    const url = audioUrls.get(oldest);
    audioUrls.delete(oldest);
    if (url) URL.revokeObjectURL(url);
  }
}

async function fetchAudioUrl(text: string): Promise<string | null> {
  const cached = audioUrls.get(text);
  if (cached) return cached;
  const pending = pendingRequests.get(text);
  if (pending) return pending;

  const request = (async () => {
    const token = getAccessToken();
    if (!token) return null;
    try {
      const res = await fetch("/api/tts/bambara", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.size) return null;
      const url = URL.createObjectURL(blob);
      audioUrls.set(text, url);
      trimCache(text);
      return url;
    } catch {
      return null;
    } finally {
      pendingRequests.delete(text);
    }
  })();

  pendingRequests.set(text, request);
  return request;
}

/** Prépare l'audio d'une phrase (appelé au montage du bouton). */
export async function prefetchBambara(text?: string): Promise<void> {
  const clean = text?.trim();
  if (!clean) return;
  if (!(await checkAvailability())) return;
  await fetchAudioUrl(clean);
}

/** Arrête la lecture bambara en cours et annule une lecture en préparation. */
export function stopBambara(): void {
  playToken++;
  if (audio) {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    audio = null;
  }
  setState("idle");
}

/**
 * Lit une phrase bambara.
 *
 * - `started` : la lecture a démarré ;
 * - `stopped` : lecture annulée par l'utilisateur (ne pas basculer en français) ;
 * - `unavailable` : voix en ligne indisponible, l'appelant peut utiliser `speak()`.
 */
export async function speakBambara(text: string): Promise<"started" | "stopped" | "unavailable"> {
  const clean = text.trim();
  if (!clean) return "unavailable";

  stopBambara();
  const token = playToken;
  setState("loading");

  const configured = await checkAvailability();
  if (token !== playToken) return "stopped";
  if (!configured) {
    setState("idle");
    return "unavailable";
  }

  const url = await fetchAudioUrl(clean);
  if (!url) {
    if (token === playToken) setState("idle");
    return "unavailable";
  }
  if (token !== playToken) return "stopped";

  const element = new Audio(url);
  element.preload = "auto";
  audio = element;

  const finish = () => {
    if (audio !== element) return;
    audio = null;
    setState("idle");
  };
  element.addEventListener("ended", finish, { once: true });
  element.addEventListener("error", finish, { once: true });

  try {
    await element.play();
  } catch {
    finish();
    return "unavailable";
  }

  if (token !== playToken) {
    try {
      element.pause();
    } catch {
      /* ignore */
    }
    return "stopped";
  }

  setState("playing");
  return "started";
}
