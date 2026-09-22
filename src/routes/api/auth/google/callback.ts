import { createFileRoute } from "@tanstack/react-router";

/**
 * Retour de Google : crée (ou retrouve) le compte, ouvre une session puis
 * redirige vers /auth-callback avec le jeton dans le fragment d'URL (jamais
 * envoyé au serveur ni conservé dans les logs).
 */
export const Route = createFileRoute("/api/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { env } = await import("@/server/env.server");
        const oauth = await import("@/server/oauth.server");
        const clearCookie = oauth.cookieHeader(oauth.OAUTH_COOKIE, "", 0);
        const fail = (reason: string) =>
          new Response(null, {
            status: 302,
            headers: {
              Location: `${env.appUrl}/auth?error=${encodeURIComponent(reason)}`,
              "Set-Cookie": clearCookie,
            },
          });

        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = oauth.parseState(
          url.searchParams.get("state"),
          oauth.readCookie(request, oauth.OAUTH_COOKIE),
        );
        if (!code || !state) return fail("google_state");

        try {
          const profile = await oauth.exchangeGoogleCode(code);
          const { basePrisma } = await import("@/server/prisma-base.server");
          const { createAccount, createSession, requestMeta, normalizeEmail } =
            await import("@/server/auth.server");

          let user = await basePrisma.users.findUnique({
            where: { google_sub: profile.sub },
            select: { id: true },
          });
          if (!user && profile.email && profile.emailVerified) {
            // Rattache le compte Google à un compte email existant.
            const existing = await basePrisma.users.findUnique({
              where: { email: normalizeEmail(profile.email) },
              select: { id: true },
            });
            if (existing) {
              await basePrisma.users.update({
                where: { id: existing.id },
                data: { google_sub: profile.sub, email_verified_at: new Date() },
              });
              user = existing;
            }
          }
          if (!user) {
            const id = await createAccount({
              email: profile.emailVerified ? profile.email : null,
              googleSub: profile.sub,
              fullName: profile.name ?? "",
              emailVerified: profile.emailVerified,
            });
            user = { id };
          }

          const session = await createSession(user.id, requestMeta(request));
          const fragment = new URLSearchParams({
            access_token: session.access_token,
            expires_at: String(session.expires_at),
            redirect: state.redirect,
          });
          return new Response(null, {
            status: 302,
            headers: {
              Location: `${env.appUrl}/auth-callback#${fragment}`,
              "Set-Cookie": clearCookie,
            },
          });
        } catch (err) {
          console.error("[google-oauth]", err);
          return fail("google_error");
        }
      },
    },
  },
});
