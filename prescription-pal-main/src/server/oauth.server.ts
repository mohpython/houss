/**
 * Connexion Google (OAuth 2.0 / OpenID Connect) — remplace le broker Lovable.
 * Console Google Cloud → Identifiants → ID client OAuth « Application Web » :
 *   URI de redirection autorisée = ${APP_URL}/api/auth/google/callback
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env.server";

export const OAUTH_COOKIE = "saha_oauth_nonce";

function hmac(value: string) {
  return createHmac("sha256", env.appSecret).update(value).digest("base64url");
}

export function safeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/app";
  return value;
}

export function googleRedirectUri() {
  return `${env.appUrl}/api/auth/google/callback`;
}

export function buildGoogleAuthUrl(redirectPath: string) {
  const nonce = randomBytes(16).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 600;
  const payload = Buffer.from(
    JSON.stringify({ r: safeRedirectPath(redirectPath), n: nonce, e: exp }),
  ).toString("base64url");
  const state = `${payload}.${hmac(payload)}`;
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, nonce };
}

export function parseState(state: string | null, cookieNonce: string | null) {
  if (!state) return null;
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(hmac(payload));
  const provided = Buffer.from(sig);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      r: string;
      n: string;
      e: number;
    };
    if (data.e < Math.floor(Date.now() / 1000)) return null;
    if (!cookieNonce || cookieNonce !== data.n) return null;
    return { redirect: safeRedirectPath(data.r) };
  } catch {
    return null;
  }
}

export type GoogleProfile = {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
};

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token error (${tokenRes.status})`);
  const tokens = (await tokenRes.json()) as { access_token: string };

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) throw new Error(`Google userinfo error (${infoRes.status})`);
  const info = (await infoRes.json()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  return {
    sub: info.sub,
    email: info.email ?? null,
    emailVerified: Boolean(info.email_verified),
    name: info.name ?? null,
  };
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function cookieHeader(name: string, value: string, maxAgeSec: number) {
  const secure = env.appUrl.startsWith("https://") ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}
