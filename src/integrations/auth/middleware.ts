import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getAccessToken } from "./session-store";

/**
 * Côté navigateur : joint le jeton de session à chaque appel de server function.
 * Enregistré globalement dans `src/start.ts`.
 */
export const attachAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = getAccessToken();
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});

/**
 * Côté serveur : exige une session valide et expose `context.userId`.
 * Remplace `requireSupabaseAuth`.
 */
export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { bearerFromRequest, verifySessionToken } = await import("@/server/auth.server");
  const token = bearerFromRequest(getRequest());
  if (!token) throw new Error("Unauthorized: No authorization header provided");
  const userId = await verifySessionToken(token);
  if (!userId) throw new Error("Unauthorized: Invalid token");
  return next({ context: { userId, accessToken: token } });
});

/** Variante sans obligation : `context.userId` vaut null si non connecté. */
export const optionalAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { bearerFromRequest, verifySessionToken } = await import("@/server/auth.server");
  const token = bearerFromRequest(getRequest());
  const userId = token ? await verifySessionToken(token) : null;
  return next({ context: { userId: userId as string | null, accessToken: token } });
});
