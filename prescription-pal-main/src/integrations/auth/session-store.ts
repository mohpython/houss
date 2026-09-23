/**
 * Stockage de la session dans le navigateur (localStorage) + diffusion des
 * changements aux abonnés (équivalent de `supabase.auth.onAuthStateChange`).
 */
export type AuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  user_metadata: { full_name?: string | null };
};

export type Session = {
  access_token: string;
  expires_at: number;
  user: AuthUser;
};

export type AuthEvent = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT" | "USER_UPDATED";
type Listener = (event: AuthEvent, session: Session | null) => void;

const KEY = "saha.auth.session";
const listeners = new Set<Listener>();
let memory: Session | null = null;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readSession(): Session | null {
  const s = storage();
  if (!s) return memory;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.access_token) return null;
    if (parsed.expires_at && parsed.expires_at * 1000 < Date.now()) {
      s.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return memory;
  }
}

export function getAccessToken(): string | null {
  return readSession()?.access_token ?? null;
}

export function writeSession(session: Session | null, event?: AuthEvent) {
  memory = session;
  const s = storage();
  try {
    if (session) s?.setItem(KEY, JSON.stringify(session));
    else s?.removeItem(KEY);
  } catch {
    /* stockage indisponible : on garde la session en mémoire */
  }
  if (event) emit(event, session);
}

export function emit(event: AuthEvent, session: Session | null) {
  for (const l of [...listeners]) {
    try {
      l(event, session);
    } catch (err) {
      console.error(err);
    }
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Synchronisation entre onglets.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    const session = readSession();
    emit(session ? "SIGNED_IN" : "SIGNED_OUT", session);
  });
}
