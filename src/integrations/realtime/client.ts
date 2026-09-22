/**
 * Abonnement temps réel côté navigateur (remplace `supabase.channel(...)`).
 *
 *   useEffect(() => subscribeRealtime(
 *     [{ table: "reservations", event: "*", filter: { patient_id: user.id } }],
 *     () => load(),
 *   ), [user.id]);
 *
 * Le serveur n'envoie que les événements qui concernent l'utilisateur
 * connecté ; `filter` affine côté client (égalité stricte sur les colonnes).
 * Le callback reçoit `{ table, eventType, new }` comme l'ancien payload.
 */
import { getAccessToken, subscribe as onAuthChange } from "@/integrations/auth/session-store";

export type RealtimeEventType = "INSERT" | "UPDATE" | "DELETE";

export type RealtimeSpec = {
  table: string;
  event?: RealtimeEventType | "*";
  filter?: Record<string, string | number | boolean | null>;
};

export type RealtimePayload<T = Record<string, unknown>> = {
  table: string;
  eventType: RealtimeEventType;
  new: T;
};

type Subscriber = {
  specs: RealtimeSpec[];
  callback: (payload: RealtimePayload) => void;
  onResync?: () => void;
};

const subscribers = new Set<Subscriber>();
let source: EventSource | null = null;
let currentToken: string | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 2000;
let hadConnection = false;

function matches(spec: RealtimeSpec, table: string, type: RealtimeEventType, row: Record<string, unknown>) {
  if (spec.table !== table) return false;
  if (spec.event && spec.event !== "*" && spec.event !== type) return false;
  if (spec.filter) {
    for (const [k, v] of Object.entries(spec.filter)) {
      if (row[k] !== v) return false;
    }
  }
  return true;
}

function dispatch(raw: string) {
  let msg: { table: string; type: RealtimeEventType; row: Record<string, unknown> };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  for (const sub of [...subscribers]) {
    if (sub.specs.some((s) => matches(s, msg.table, msg.type, msg.row))) {
      try {
        sub.callback({ table: msg.table, eventType: msg.type, new: msg.row });
      } catch (err) {
        console.error(err);
      }
    }
  }
}

function close() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  source?.close();
  source = null;
  currentToken = null;
}

function connect() {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return;
  const token = getAccessToken();
  if (!token || subscribers.size === 0) {
    close();
    return;
  }
  if (source && currentToken === token && source.readyState !== EventSource.CLOSED) return;
  close();
  currentToken = token;
  const es = new EventSource(`/api/realtime?token=${encodeURIComponent(token)}`);
  source = es;

  es.addEventListener("ready", () => {
    retryDelay = 2000;
    // Après une coupure, on demande aux écrans de se resynchroniser.
    if (hadConnection) {
      for (const sub of [...subscribers]) sub.onResync?.();
    }
    hadConnection = true;
  });
  es.onmessage = (e) => dispatch(e.data);
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED && source === es) {
      source = null;
      retryTimer = setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }
  };
}

if (typeof window !== "undefined") {
  onAuthChange(() => connect());
}

export function subscribeRealtime(
  specs: RealtimeSpec[],
  callback: (payload: RealtimePayload) => void,
  options: { onResync?: () => void } = {},
): () => void {
  const sub: Subscriber = { specs, callback, onResync: options.onResync };
  subscribers.add(sub);
  connect();
  return () => {
    subscribers.delete(sub);
    if (subscribers.size === 0) close();
  };
}
