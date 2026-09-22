import { createFileRoute } from "@tanstack/react-router";

/** Démarre la connexion Google : redirection vers l'écran de consentement. */
export const Route = createFileRoute("/api/auth/google/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { env } = await import("@/server/env.server");
        const { buildGoogleAuthUrl, cookieHeader, OAUTH_COOKIE } = await import(
          "@/server/oauth.server"
        );
        if (!env.googleClientId || !env.googleClientSecret) {
          return Response.redirect(`${env.appUrl}/auth?error=google_disabled`, 302);
        }
        const redirect = new URL(request.url).searchParams.get("redirect") ?? "/app";
        const { url, nonce } = buildGoogleAuthUrl(redirect);
        return new Response(null, {
          status: 302,
          headers: { Location: url, "Set-Cookie": cookieHeader(OAUTH_COOKIE, nonce, 600) },
        });
      },
    },
  },
});
