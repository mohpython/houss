/**
 * Client d'authentification du navigateur (remplace `supabase.auth`).
 * Les méthodes renvoient `{ data, error }` comme l'ancien SDK, pour garder le
 * code des pages quasiment inchangé.
 *
 *   import { auth } from "@/integrations/auth/client";
 */
import {
  getMe,
  requestPasswordReset,
  requestPhoneOtp,
  resetPassword,
  signInWithPassword,
  signOutSession,
  signUpWithEmail,
  verifyPhoneOtp,
} from "@/lib/auth.functions";
import {
  readSession,
  subscribe,
  writeSession,
  type AuthEvent,
  type AuthUser,
  type Session,
} from "./session-store";

export type { AuthUser, Session, AuthEvent };
export { getAccessToken } from "./session-store";

type Result<T> = { data: T; error: Error | null };

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function isUnauthorized(err: unknown) {
  return asError(err).message.startsWith("Unauthorized");
}

// Cache court du profil pour éviter un aller-retour serveur à chaque navigation.
let userCache: { token: string; user: AuthUser; at: number } | null = null;
const USER_CACHE_MS = 60_000;

function applySession(session: Session, event: AuthEvent = "SIGNED_IN") {
  userCache = { token: session.access_token, user: session.user, at: Date.now() };
  writeSession(session, event);
}

export const auth = {
  async getSession(): Promise<Result<{ session: Session | null }>> {
    return { data: { session: readSession() }, error: null };
  },

  /** Vérifie la session auprès du serveur et renvoie l'utilisateur courant. */
  async getUser(): Promise<Result<{ user: AuthUser | null }>> {
    const session = readSession();
    if (!session) return { data: { user: null }, error: null };
    if (
      userCache &&
      userCache.token === session.access_token &&
      Date.now() - userCache.at < USER_CACHE_MS
    ) {
      return { data: { user: userCache.user }, error: null };
    }
    try {
      const user = await getMe();
      userCache = { token: session.access_token, user, at: Date.now() };
      if (JSON.stringify(user) !== JSON.stringify(session.user)) {
        writeSession({ ...session, user });
      }
      return { data: { user }, error: null };
    } catch (err) {
      if (isUnauthorized(err)) {
        userCache = null;
        writeSession(null, "SIGNED_OUT");
        return { data: { user: null }, error: asError(err) };
      }
      // Erreur réseau : on garde la session locale.
      return { data: { user: session.user }, error: null };
    }
  },

  onAuthStateChange(callback: (event: AuthEvent, session: Session | null) => void) {
    const unsubscribe = subscribe(callback);
    return { data: { subscription: { unsubscribe } } };
  },

  async signUp(params: {
    email: string;
    password: string;
    fullName?: string;
  }): Promise<Result<{ session: Session | null }>> {
    try {
      const session = await signUpWithEmail({ data: params });
      applySession(session);
      return { data: { session }, error: null };
    } catch (err) {
      return { data: { session: null }, error: asError(err) };
    }
  },

  async signInWithPassword(params: {
    email: string;
    password: string;
  }): Promise<Result<{ session: Session | null }>> {
    try {
      const session = await signInWithPassword({ data: params });
      applySession(session);
      return { data: { session }, error: null };
    } catch (err) {
      return { data: { session: null }, error: asError(err) };
    }
  },

  /** Envoie un code à 6 chiffres par SMS / WhatsApp. */
  async signInWithOtp(params: { phone: string; fullName?: string }): Promise<Result<null>> {
    try {
      await requestPhoneOtp({ data: params });
      return { data: null, error: null };
    } catch (err) {
      return { data: null, error: asError(err) };
    }
  },

  async verifyOtp(params: {
    phone: string;
    token: string;
  }): Promise<Result<{ session: Session | null }>> {
    try {
      const session = await verifyPhoneOtp({ data: { phone: params.phone, code: params.token } });
      applySession(session);
      return { data: { session }, error: null };
    } catch (err) {
      return { data: { session: null }, error: asError(err) };
    }
  },

  /** Redirige vers Google ; le retour se fait sur /auth-callback. */
  signInWithGoogle(redirectPath = "/app") {
    const url = `/api/auth/google?redirect=${encodeURIComponent(redirectPath)}`;
    window.location.assign(url);
  },

  /** Enregistre une session reçue par redirection (connexion Google). */
  async setSessionFromToken(
    accessToken: string,
    expiresAt: number,
  ): Promise<Result<{ session: Session | null }>> {
    writeSession({
      access_token: accessToken,
      expires_at: expiresAt,
      user: { id: "", email: null, phone: null, created_at: "", user_metadata: {} },
    });
    try {
      const user = await getMe();
      const session: Session = { access_token: accessToken, expires_at: expiresAt, user };
      applySession(session);
      return { data: { session }, error: null };
    } catch (err) {
      writeSession(null);
      return { data: { session: null }, error: asError(err) };
    }
  },

  async requestPasswordReset(email: string): Promise<Result<null>> {
    try {
      await requestPasswordReset({ data: { email } });
      return { data: null, error: null };
    } catch (err) {
      return { data: null, error: asError(err) };
    }
  },

  async resetPassword(
    token: string,
    password: string,
  ): Promise<Result<{ session: Session | null }>> {
    try {
      const session = await resetPassword({ data: { token, password } });
      applySession(session);
      return { data: { session }, error: null };
    } catch (err) {
      return { data: { session: null }, error: asError(err) };
    }
  },

  async signOut(): Promise<Result<null>> {
    try {
      if (readSession()) await signOutSession();
    } catch {
      /* session déjà invalide côté serveur */
    }
    userCache = null;
    writeSession(null, "SIGNED_OUT");
    return { data: null, error: null };
  },
};
