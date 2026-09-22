/**
 * Authentification maison (remplace Supabase Auth).
 *
 *  - Mots de passe : scrypt (natif Node). Les hash bcrypt importés depuis
 *    Supabase (`$2a$...`) restent valides et sont convertis à la connexion.
 *  - Sessions : jeton opaque aléatoire envoyé en `Authorization: Bearer`,
 *    seul son SHA-256 est stocké (table `sessions`), expiration glissante.
 *  - Création de compte : reproduit le trigger `handle_new_user` (profil,
 *    rôle patient, rattachement automatique d'une pharmacie / d'un praticien
 *    pré-enregistré avec le même email).
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";
import type { app_role } from "@prisma/client";
import { basePrisma } from "./prisma-base.server";
import { env } from "./env.server";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

// ============================================================================
// Mots de passe
// ============================================================================

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Vérifie un mot de passe. `needsRehash` = hash importé (bcrypt) à migrer. */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (!stored) return { ok: false, needsRehash: false };
  if (stored.startsWith("$2")) {
    const ok = await bcrypt.compare(password, stored);
    return { ok, needsRehash: ok };
  }
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return { ok: false, needsRehash: false };
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  const ok = actual.length === expected.length && timingSafeEqual(actual, expected);
  return { ok, needsRehash: false };
}

// ============================================================================
// Jetons
// ============================================================================

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// ============================================================================
// Utilisateurs
// ============================================================================

export type AuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  user_metadata: { full_name?: string | null };
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-().]/g, "");
}

export async function toAuthUser(userId: string): Promise<AuthUser | null> {
  const u = await basePrisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      created_at: true,
      profile: { select: { full_name: true } },
    },
  });
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    created_at: u.created_at.toISOString(),
    user_metadata: { full_name: u.profile?.full_name ?? null },
  };
}

/**
 * Crée un compte + profil + rôle patient, puis rattache une pharmacie ou un
 * praticien dont `claim_email` correspond (port de `handle_new_user`).
 */
export async function createAccount(input: {
  email?: string | null;
  phone?: string | null;
  password?: string | null;
  fullName?: string | null;
  googleSub?: string | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
}): Promise<string> {
  const email = input.email ? normalizeEmail(input.email) : null;
  const phone = input.phone ? normalizePhone(input.phone) : null;
  const now = new Date();
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  const userId = await basePrisma.$transaction(async (tx) => {
    const user = await tx.users.create({
      data: {
        email,
        phone,
        password_hash: passwordHash,
        google_sub: input.googleSub ?? null,
        email_verified_at: email && input.emailVerified ? now : null,
        phone_verified_at: phone && input.phoneVerified ? now : null,
        raw_user_meta_data: { full_name: input.fullName ?? "" },
      },
      select: { id: true },
    });

    await tx.profiles.create({
      data: { id: user.id, full_name: input.fullName ?? "", phone: phone ?? "" },
    });
    await tx.user_roles.create({ data: { user_id: user.id, role: "patient" } });

    if (email) {
      const pharmacy = await tx.pharmacies.findFirst({
        where: { owner_user_id: null, claim_email: { equals: email, mode: "insensitive" } },
        orderBy: { created_at: "asc" },
        select: { id: true },
      });
      if (pharmacy) {
        await tx.pharmacies.update({
          where: { id: pharmacy.id },
          data: { owner_user_id: user.id, claim_email: null },
        });
        await tx.pharmacy_staff.upsert({
          where: { user_id: user.id },
          create: { pharmacy_id: pharmacy.id, user_id: user.id },
          update: {},
        });
        await addRoleTx(tx, user.id, "pharmacy_staff");
      } else {
        const prac = await tx.practitioners.findFirst({
          where: { user_id: null, claim_email: { equals: email, mode: "insensitive" } },
          orderBy: { created_at: "asc" },
          select: { id: true, type: true },
        });
        if (prac) {
          await tx.practitioners.update({
            where: { id: prac.id },
            data: { user_id: user.id, claim_email: null },
          });
          await addRoleTx(tx, user.id, prac.type === "doctor" ? "doctor" : "nurse");
        }
      }
    }
    return user.id;
  });

  return userId;
}

type Tx = Parameters<Parameters<typeof basePrisma.$transaction>[0]>[0];

async function addRoleTx(tx: Tx, userId: string, role: app_role) {
  await tx.user_roles.upsert({
    where: { user_id_role: { user_id: userId, role } },
    create: { user_id: userId, role },
    update: {},
  });
}

export async function addRole(userId: string, role: app_role) {
  await basePrisma.user_roles.upsert({
    where: { user_id_role: { user_id: userId, role } },
    create: { user_id: userId, role },
    update: {},
  });
}

export async function getRoles(userId: string): Promise<app_role[]> {
  const rows = await basePrisma.user_roles.findMany({
    where: { user_id: userId },
    select: { role: true },
  });
  return rows.map((r) => r.role);
}

// ============================================================================
// Sessions
// ============================================================================

export type SessionPayload = {
  access_token: string;
  expires_at: number;
  user: AuthUser;
};

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<SessionPayload> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env.sessionTtlDays * 86400_000);
  await basePrisma.sessions.create({
    data: {
      user_id: userId,
      token_hash: sha256(token),
      user_agent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip?.slice(0, 64) ?? null,
      expires_at: expiresAt,
    },
  });
  await basePrisma.users.update({ where: { id: userId }, data: { last_sign_in_at: new Date() } });
  const user = await toAuthUser(userId);
  if (!user) throw new Error("Utilisateur introuvable");
  return { access_token: token, expires_at: Math.floor(expiresAt.getTime() / 1000), user };
}

/** Valide un jeton Bearer et renvoie l'identifiant de l'utilisateur. */
export async function verifySessionToken(token: string | null | undefined): Promise<string | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const session = await basePrisma.sessions.findUnique({
    where: { token_hash: sha256(token) },
    select: { id: true, user_id: true, expires_at: true, last_used_at: true },
  });
  if (!session) return null;
  const now = Date.now();
  if (session.expires_at.getTime() <= now) {
    await basePrisma.sessions.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  // Expiration glissante, rafraîchie au plus une fois par heure.
  if (now - session.last_used_at.getTime() > 3600_000) {
    await basePrisma.sessions
      .update({
        where: { id: session.id },
        data: {
          last_used_at: new Date(now),
          expires_at: new Date(now + env.sessionTtlDays * 86400_000),
        },
      })
      .catch(() => undefined);
  }
  return session.user_id;
}

export async function revokeSessionToken(token: string) {
  await basePrisma.sessions.deleteMany({ where: { token_hash: sha256(token) } });
}

export async function revokeAllSessions(userId: string) {
  await basePrisma.sessions.deleteMany({ where: { user_id: userId } });
}

export function bearerFromRequest(request: Request | undefined | null): string | null {
  const header = request?.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export function requestMeta(request: Request | undefined | null) {
  return {
    userAgent: request?.headers.get("user-agent") ?? null,
    ip:
      request?.headers.get("x-real-ip") ??
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null,
  };
}
