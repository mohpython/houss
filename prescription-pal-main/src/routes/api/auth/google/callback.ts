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
        const { writeAudit } = await import("@/server/audit.server");
        const clearCookie = oauth.cookieHeader(oauth.OAUTH_COOKIE, "", 0);
        const redirectTo = (location: string) =>
          new Response(null, {
            status: 302,
            headers: { Location: location, "Set-Cookie": clearCookie },
          });
        const fail = async (reason: string, isDoctor: boolean, email: string | null = null) => {
          await writeAudit({
            actorUserId: null,
            action: isDoctor ? "auth.doctor.login_refused" : "auth.login_refused",
            entity: "user",
            meta: { email, method: "google", reason },
            request,
          });
          return redirectTo(`${env.appUrl}/auth?error=${encodeURIComponent(reason)}`);
        };

        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = oauth.parseState(
          url.searchParams.get("state"),
          oauth.readCookie(request, oauth.OAUTH_COOKIE),
        );
        if (!code || !state) return await fail("google_state", false);

        const isDoctorRedirect = state.redirect.startsWith("/medecin");
        let attemptedEmail: string | null = null;

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
            attemptedEmail = profile.email ? oauth.normalizeEmail(profile.email) : null;

            // Le portail medecin exige le compte Google attache au profil
            // praticien : on refuse avant toute creation de compte ou de session.
            if (state.expectedEmail && attemptedEmail !== state.expectedEmail) {
              await writeAudit({
                actorUserId: null,
                action: "auth.doctor.login_refused",
                entity: "user",
                meta: {
                  email: attemptedEmail,
                  claimed_email: state.expectedEmail,
                  method: "google",
                  reason: "google_email_mismatch",
                },
                request,
              });
              return redirectTo(`${env.appUrl}/medecin/connexion?reason=google_email_mismatch`);
            }

            const { basePrisma } = await import("@/server/prisma-base.server");
            const { createAccount, createSession, requestMeta } =
              await import("@/server/auth.server");

            let user = await basePrisma.users.findUnique({
              where: { google_sub: profile.sub },
              select: { id: true },
            });
            if (!user && profile.email && profile.emailVerified) {
              // Rattache le compte Google a un compte email existant.
              const existing = await basePrisma.users.findUnique({
                where: { email: oauth.normalizeEmail(profile.email) },
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
            await writeAudit({
              actorUserId: user.id,
              action: isDoctorRedirect ? "auth.doctor.login_success" : "auth.login_success",
              entity: "user",
              entityId: user.id,
              meta: { email: attemptedEmail, method: "google" },
              request,
            });
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
            return redirectTo(`${env.appUrl}/auth-callback?mobile=1#${fragment}`);
          }

          const fragment = new URLSearchParams({
            access_token: accessToken,
            expires_at: String(expiresAt),
            redirect: state.redirect,
          });
          return redirectTo(`${env.appUrl}/auth-callback#${fragment}`);
        } catch (err) {
          console.error("[google-oauth]", err);
          return await fail("google_error", isDoctorRedirect, attemptedEmail);
        }
      },
    },
  },
});
