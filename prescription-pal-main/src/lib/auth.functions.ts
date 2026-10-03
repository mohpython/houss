import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";

const emailSchema = z.string().trim().toLowerCase().email().max(255);
const passwordSchema = z.string().min(6, "Mot de passe trop court (6 caractères minimum)").max(200);
const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s\-().]/g, ""))
  .refine((v) => /^\+[1-9]\d{7,14}$/.test(v), "Numéro de téléphone invalide");

function clientIp(request: Request | undefined) {
  return (
    request?.headers.get("x-real-ip") ??
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

/** Méthodes de connexion disponibles (pour afficher/masquer les boutons). */
export const getAuthConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { env } = await import("@/server/env.server");
  const { otpChannelAvailable } = await import("@/server/messaging.server");
  return {
    google: Boolean(env.googleClientId && env.googleClientSecret),
    phone: otpChannelAvailable(),
    passwordReset: true,
  };
});

export const signUpWithEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        email: emailSchema,
        password: passwordSchema,
        fullName: z.string().trim().max(120).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { basePrisma } = await import("@/server/prisma-base.server");
    const { createAccount, createSession, requestMeta } = await import("@/server/auth.server");
    const { rateLimit } = await import("@/server/rate-limit.server");
    const { checkEmailDeliverable } = await import("@/server/email-check.server");
    const request = getRequest();
    rateLimit(`signup:${clientIp(request)}`, 10, 3600_000);

    // Domaine inexistant ou boîte jetable : pas de compte fantôme.
    const emailCheck = await checkEmailDeliverable(data.email);
    if (!emailCheck.ok) throw new Error(emailCheck.reason);

    const existing = await basePrisma.users.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    if (existing) throw new Error("Un compte existe déjà avec cet email. Connectez-vous.");

    // `emailVerified: false` : rien ne prouve encore que l'adresse est réelle.
    // Seul Google (qui a vérifié la boîte) marque le compte comme vérifié.
    const userId = await createAccount({
      email: data.email,
      password: data.password,
      fullName: data.fullName,
      emailVerified: false,
    });
    return createSession(userId, requestMeta(request));
  });

export const signInWithPassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ email: emailSchema, password: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { basePrisma } = await import("@/server/prisma-base.server");
    const { verifyPassword, hashPassword, createSession, requestMeta } =
      await import("@/server/auth.server");
    const { rateLimit } = await import("@/server/rate-limit.server");
    const request = getRequest();
    rateLimit(`signin:${clientIp(request)}`, 20, 15 * 60_000);
    rateLimit(`signin:${data.email}`, 10, 15 * 60_000);

    const user = await basePrisma.users.findUnique({
      where: { email: data.email },
      select: { id: true, password_hash: true },
    });
    const { ok, needsRehash } = await verifyPassword(data.password, user?.password_hash);
    if (!user || !ok) throw new Error("Email ou mot de passe incorrect");
    if (needsRehash) {
      await basePrisma.users.update({
        where: { id: user.id },
        data: { password_hash: await hashPassword(data.password) },
      });
    }
    return createSession(user.id, requestMeta(request));
  });

export const requestPhoneOtp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ phone: phoneSchema, fullName: z.string().trim().max(120).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { basePrisma } = await import("@/server/prisma-base.server");
    const { sha256 } = await import("@/server/auth.server");
    const { sendOtp, otpChannelAvailable } = await import("@/server/messaging.server");
    const { rateLimit } = await import("@/server/rate-limit.server");
    const { randomInt } = await import("node:crypto");
    if (!otpChannelAvailable()) throw new Error("La connexion par téléphone n'est pas activée.");

    const request = getRequest();
    rateLimit(`otp:${clientIp(request)}`, 10, 3600_000);
    rateLimit(`otp:${data.phone}`, 5, 3600_000);

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await basePrisma.auth_tokens.updateMany({
      where: { kind: "phone_otp", target: data.phone, consumed_at: null },
      data: { consumed_at: new Date() },
    });
    await basePrisma.auth_tokens.create({
      data: {
        kind: "phone_otp",
        target: data.phone,
        token_hash: sha256(code),
        meta: { full_name: data.fullName ?? "" },
        expires_at: new Date(Date.now() + 10 * 60_000),
      },
    });
    await sendOtp(data.phone, code);
    return { ok: true };
  });

export const verifyPhoneOtp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { basePrisma } = await import("@/server/prisma-base.server");
    const { sha256, createAccount, createSession, requestMeta } =
      await import("@/server/auth.server");
    const request = getRequest();

    const token = await basePrisma.auth_tokens.findFirst({
      where: { kind: "phone_otp", target: data.phone, consumed_at: null },
      orderBy: { created_at: "desc" },
    });
    if (!token || token.expires_at.getTime() < Date.now()) {
      throw new Error("Code expiré. Demandez un nouveau code.");
    }
    if (token.attempts >= 5) throw new Error("Trop de tentatives. Demandez un nouveau code.");
    if (token.token_hash !== sha256(data.code)) {
      await basePrisma.auth_tokens.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      throw new Error("Code invalide");
    }
    await basePrisma.auth_tokens.update({
      where: { id: token.id },
      data: { consumed_at: new Date() },
    });

    let user = await basePrisma.users.findUnique({
      where: { phone: data.phone },
      select: { id: true },
    });
    if (!user) {
      const meta = (token.meta ?? {}) as { full_name?: string };
      const id = await createAccount({
        phone: data.phone,
        fullName: meta.full_name ?? "",
        phoneVerified: true,
      });
      user = { id };
    } else {
      await basePrisma.users.update({
        where: { id: user.id },
        data: { phone_verified_at: new Date() },
      });
    }
    return createSession(user.id, requestMeta(request));
  });

/** Profil de l'utilisateur connecté (équivalent de `supabase.auth.getUser`). */
export const getMe = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { toAuthUser } = await import("@/server/auth.server");
    const user = await toAuthUser(context.userId);
    if (!user) throw new Error("Unauthorized: Invalid token");
    return user;
  });

export const signOutSession = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { revokeSessionToken } = await import("@/server/auth.server");
    await revokeSessionToken(context.accessToken);
    return { ok: true };
  });

export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ email: emailSchema }).parse(input))
  .handler(async ({ data }) => {
    const { basePrisma } = await import("@/server/prisma-base.server");
    const { randomToken, sha256 } = await import("@/server/auth.server");
    const { sendMail } = await import("@/server/messaging.server");
    const { env } = await import("@/server/env.server");
    const { rateLimit } = await import("@/server/rate-limit.server");
    rateLimit(`reset:${clientIp(getRequest())}`, 5, 3600_000);
    rateLimit(`reset:${data.email}`, 3, 3600_000);

    const user = await basePrisma.users.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    // Réponse identique que le compte existe ou non (pas d'énumération).
    if (!user) return { ok: true };

    const token = randomToken(32);
    await basePrisma.auth_tokens.create({
      data: {
        user_id: user.id,
        kind: "password_reset",
        target: data.email,
        token_hash: sha256(token),
        expires_at: new Date(Date.now() + 60 * 60_000),
      },
    });
    const link = `${env.appUrl}/reset-password?token=${token}`;
    await sendMail(
      data.email,
      "Réinitialisation de votre mot de passe SAHA Santé",
      `Bonjour,\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\nSAHA Santé`,
      `<p>Bonjour,</p><p>Pour choisir un nouveau mot de passe, cliquez sur ce lien (valable 1 heure) :</p><p><a href="${link}">Réinitialiser mon mot de passe</a></p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p><p>SAHA Santé</p>`,
    );
    return { ok: true };
  });

export const resetPassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(20).max(200), password: passwordSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { basePrisma } = await import("@/server/prisma-base.server");
    const { sha256, hashPassword, revokeAllSessions, createSession, requestMeta } =
      await import("@/server/auth.server");
    const row = await basePrisma.auth_tokens.findFirst({
      where: { kind: "password_reset", token_hash: sha256(data.token), consumed_at: null },
    });
    if (!row || !row.user_id || row.expires_at.getTime() < Date.now()) {
      throw new Error("Lien invalide ou expiré. Refaites une demande.");
    }
    await basePrisma.auth_tokens.update({
      where: { id: row.id },
      data: { consumed_at: new Date() },
    });
    await basePrisma.users.update({
      where: { id: row.user_id },
      data: { password_hash: await hashPassword(data.password), email_verified_at: new Date() },
    });
    await revokeAllSessions(row.user_id);
    return createSession(row.user_id, requestMeta(getRequest()));
  });

export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ currentPassword: z.string().max(200).optional(), password: passwordSchema })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { basePrisma } = await import("@/server/prisma-base.server");
    const { verifyPassword, hashPassword } = await import("@/server/auth.server");
    const user = await basePrisma.users.findUnique({
      where: { id: context.userId },
      select: { password_hash: true },
    });
    if (user?.password_hash) {
      const { ok } = await verifyPassword(data.currentPassword ?? "", user.password_hash);
      if (!ok) throw new Error("Mot de passe actuel incorrect");
    }
    await basePrisma.users.update({
      where: { id: context.userId },
      data: { password_hash: await hashPassword(data.password) },
    });
    return { ok: true };
  });
