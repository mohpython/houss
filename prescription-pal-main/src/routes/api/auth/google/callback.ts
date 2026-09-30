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

        // Chrome peut declencher deux fois la meme navigation : la seconde
        // arrive apres consommation du `code` (400). On reutilise alors la
        // session deja creee pour ce `state.nonce`.
        const cached = oauth.recallSession(state.nonce);

        try {
          let accessToken: string;
          let expiresAt: number;

          if (cached) {
            accessToken = cached.accessToken;
            expiresAt = cached.expiresAt;
          } else {
            const profile = await oauth.exchangeGoogleCode(code);
            const { basePrisma } = await import("@/server/prisma-base.server");
            const { createAccount, createSession, requestMeta, normalizeEmail } =
              await import("@/server/auth.server");

            let user = await basePrisma.users.findUnique({
              where: { google_sub: profile.sub },
              select: { id: true },
            });
            if (!user && profile.email && profile.emailVerified) {
              // Rattache le compte Google a un compte email existant.
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
            accessToken = session.access_token;
            expiresAt = session.expires_at;
            oauth.rememberSession(state.nonce, { accessToken, expiresAt });
          }

          if (state.mobile) {
            // Application mobile. Une redirection automatique vers un schema
            // inconnu est refusee par Chrome : on renvoie vers la page
            // /auth-callback?mobile=1 qui, elle, propose un bouton (geste
            // utilisateur) vers sahasantemali://auth?... Le jeton reste dans le
            // fragment `#`, donc jamais journalise par nginx.
            const fragment = new URLSearchParams({
              access_token: accessToken,
              expires_at: String(expiresAt),
            });
            return new Response(null, {
              status: 302,
              headers: {
                Location: `${env.appUrl}/auth-callback?mobile=1#${fragment}`,
                "Set-Cookie": clearCookie,
              },
            });
          }

          const fragment = new URLSearchParams({
            access_token: accessToken,
            expires_at: String(expiresAt),
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
