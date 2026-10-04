/**
 * API REST publique (v1) — utilisée par l'application mobile Flutter.
 *
 * Toutes les routes sont servies par `src/routes/api/v1/$.ts`.
 * Authentification : en-tête `Authorization: Bearer <access_token>` obtenu via
 * /api/v1/auth/login ou /api/v1/auth/register (mêmes comptes que le site web).
 *
 * Les règles d'accès sont exactement celles du site : les helpers de
 * `authz.server.ts`, `reservation-rules.server.ts` et les hooks Prisma
 * (notifications, temps réel) sont réutilisés tels quels.
 */
import { z } from "zod";
import { prisma } from "./db.server";
import { isPrescriptionMime, normalizeMime, sniffMime } from "./file-type.server";
import { checkEmailDeliverable } from "./email-check.server";
import { basePrisma } from "./prisma-base.server";
import { toPlain } from "./serialize";
import {
  addRole,
  bearerFromRequest,
  createAccount,
  createSession,
  getRoles,
  hashPassword,
  normalizeEmail,
  requestMeta,
  revokeSessionToken,
  sha256,
  toAuthUser,
  verifyPassword,
  verifySessionToken,
} from "./auth.server";
import {
  ForbiddenError,
  NotFoundError,
  assertAdmin,
  assertPharmacyMemberOrAdmin,
  canReadPrescription,
  getPractitionerForUser,
  isAdmin,
  reservationAccess,
  userPharmacyIds,
} from "./authz.server";
import { canViewPharmacy, updateReservationAs, type ReservationPatch } from "@/lib/reservation-rules.server";
import { updateAppointmentAs } from "@/lib/appointments-core.server";
import { createAbsoluteSignedUrl, extFromMime, saveObject } from "./storage.server";
import { haversineKm } from "@/lib/routing-core.server";
import { rateLimit } from "./rate-limit.server";
import { env } from "./env.server";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// ============================================================================
// Utilitaires HTTP
// ============================================================================

type Ctx = { request: Request; url: URL; userId: string | null; params: string[] };

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function requireUser(ctx: Ctx): string {
  if (!ctx.userId) throw new ApiError(401, "Non connecté");
  return ctx.userId;
}

async function body<S extends z.ZodTypeAny>(ctx: Ctx, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await ctx.request.json();
  } catch {
    throw new ApiError(400, "Corps de requête invalide");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message ?? "Données invalides");
  }
  return parsed.data;
}

function num(value: string | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ============================================================================
// Authentification
// ============================================================================

const emailSchema = z.string().trim().toLowerCase().email("Email invalide").max(255);
const passwordSchema = z.string().min(6, "Mot de passe trop court (6 caractères minimum)").max(200);

async function sessionResponse(userId: string, request: Request) {
  const session = await createSession(userId, requestMeta(request));
  return json({
    access_token: session.access_token,
    expires_at: session.expires_at,
    user: session.user,
    roles: await getRoles(userId),
  });
}

async function register(ctx: Ctx) {
  const data = await body(
    ctx,
    z.object({
      email: emailSchema,
      password: passwordSchema,
      full_name: z.string().trim().max(120).optional().default(""),
      phone: z.string().trim().max(24).optional(),
    }),
  );
  rateLimit(`api-register:${clientIp(ctx)}`, 10, 3600_000);

  // Domaine inexistant ou boîte jetable : pas de compte fantôme.
  const emailCheck = await checkEmailDeliverable(data.email);
  if (!emailCheck.ok) throw new ApiError(400, emailCheck.reason);

  const existing = await basePrisma.users.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (existing) throw new ApiError(409, "Un compte existe déjà avec cet email. Connectez-vous.");

  // `emailVerified: false` : sans SMTP, rien ne prouve que l'adresse existe.
  // Seul Google (qui a vérifié la boîte) marque le compte comme vérifié.
  const userId = await createAccount({
    email: data.email,
    password: data.password,
    fullName: data.full_name,
    emailVerified: false,
  });
  if (data.phone) {
    await basePrisma.profiles.update({ where: { id: userId }, data: { phone: data.phone } });
  }
  return sessionResponse(userId, ctx.request);
}

function clientIp(ctx: Ctx) {
  return (
    ctx.request.headers.get("x-real-ip") ??
    ctx.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "mobile"
  );
}

async function login(ctx: Ctx) {
  const data = await body(
    ctx,
    z.object({ email: emailSchema, password: z.string().min(1).max(200) }),
  );
  rateLimit(`api-login:${clientIp(ctx)}`, 20, 15 * 60_000);
  rateLimit(`api-login:${data.email}`, 10, 15 * 60_000);

  const user = await basePrisma.users.findUnique({
    where: { email: data.email },
    select: { id: true, password_hash: true },
  });
  const { ok, needsRehash } = await verifyPassword(data.password, user?.password_hash);
  if (!user || !ok) throw new ApiError(401, "Email ou mot de passe incorrect");
  if (needsRehash) {
    await basePrisma.users.update({
      where: { id: user.id },
      data: { password_hash: await hashPassword(data.password) },
    });
  }
  return sessionResponse(user.id, ctx.request);
}

// --- Connexion par téléphone (code OTP SMS) ---

const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s\-().]/g, ""))
  .refine((v) => /^\+[1-9]\d{7,14}$/.test(v), "Numéro de téléphone invalide");

/** Envoie un code OTP à 6 chiffres par SMS (canal twilio / whatsapp / log). */
async function requestPhoneOtp(ctx: Ctx) {
  const data = await body(
    ctx,
    z.object({
      phone: phoneSchema,
      full_name: z.string().trim().max(120).optional(),
    }),
  );
  const { sendOtp, otpChannelAvailable } = await import("./messaging.server");
  if (!otpChannelAvailable()) {
    throw new ApiError(503, "La connexion par téléphone n'est pas activée.");
  }
  rateLimit(`api-otp:${clientIp(ctx)}`, 10, 3600_000);
  rateLimit(`api-otp:${data.phone}`, 5, 3600_000);

  const { randomInt } = await import("node:crypto");
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
      meta: { full_name: data.full_name ?? "" },
      expires_at: new Date(Date.now() + 10 * 60_000),
    },
  });
  await sendOtp(data.phone, code);
  return json({ ok: true });
}

/**
 * Vérifie le code OTP et ouvre une session. Crée automatiquement le compte au
 * premier code valide (comme WhatsApp) — sinon rattache le téléphone au compte.
 */
async function verifyPhoneOtp(ctx: Ctx) {
  const data = await body(
    ctx,
    z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) }),
  );

  const token = await basePrisma.auth_tokens.findFirst({
    where: { kind: "phone_otp", target: data.phone, consumed_at: null },
    orderBy: { created_at: "desc" },
  });
  if (!token || token.expires_at.getTime() < Date.now()) {
    throw new ApiError(401, "Code expiré. Demandez un nouveau code.");
  }
  if (token.attempts >= 5) throw new ApiError(429, "Trop de tentatives. Demandez un nouveau code.");
  if (token.token_hash !== sha256(data.code)) {
    await basePrisma.auth_tokens.update({
      where: { id: token.id },
      data: { attempts: { increment: 1 } },
    });
    throw new ApiError(401, "Code invalide");
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
  return sessionResponse(user.id, ctx.request);
}

// --- Connexion Google (jeton d'identité OIDC vérifié par le serveur) ---

/** JWKS public Google (rotations de clés gérées automatiquement). */
const googleJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

/** ID client OAuth Google communiqué à l'application mobile (pas de secret côté client). */
async function googleClientConfig(_ctx: Ctx) {
  return json({
    // Audience mobile : client Android si configuré (l'app l'utilise comme
    // serverClientId), sinon repli sur le client web.
    client_id: env.googleAndroidClientId || env.googleClientId || null,
    configured: Boolean(env.googleClientId),
  });
}

type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  givenName?: string;
  familyName?: string;
  name?: string;
};

/** Profil Google depuis un ID token vérifié (flux navigateur + flux app serverClientId). */
async function googleProfileFromIdToken(idToken: string): Promise<GoogleProfile> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, googleJwks, {
      issuer: ["https://accounts.google.com", "https://accounts.google.com"],
      // Web (flux navigateur) ET Android (flux app mobile) acceptés.
      audience: [env.googleClientId, env.googleAndroidClientId].filter(Boolean),
    }));
  } catch {
    throw new ApiError(401, "Jeton Google invalide ou expiré");
  }
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  const email = typeof payload.email === "string" ? payload.email : null;
  if (!sub || !email) throw new ApiError(401, "Compte Google sans adresse email");
  return {
    sub,
    email,
    // Strict : le jeton doit porter `email_verified: true`. Un jeton sans ce
    // drapeau n'est pas accepté (avant, `!== false` laissait passer l'absent).
    emailVerified: payload.email_verified === true,
    givenName: typeof payload.given_name === "string" ? payload.given_name : undefined,
    familyName: typeof payload.family_name === "string" ? payload.family_name : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
  };
}

/**
 * Profil Google depuis un access token (repli mobile : « Continuer avec Google »
 * quand Google rejette la demande d'ID token faute de registration Android).
 * Le serveur échange l'access token contre le profil via l'API userinfo.
 */
async function googleProfileFromAccessToken(accessToken: string): Promise<GoogleProfile> {
  let info: Record<string, unknown>;
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`google userinfo ${res.status}`);
    info = await res.json();
  } catch {
    throw new ApiError(401, "Jeton Google invalide ou expiré");
  }
  const sub = typeof info.sub === "string" ? info.sub : null;
  const email = typeof info.email === "string" ? info.email : null;
  if (!sub || !email) throw new ApiError(401, "Compte Google sans adresse email");
  return {
    sub,
    email,
    // Strict (idem chemin ID token) : `email_verified` doit valoir true.
    emailVerified: info.email_verified === true,
    givenName: typeof info.given_name === "string" ? info.given_name : undefined,
    familyName: typeof info.family_name === "string" ? info.family_name : undefined,
    name: typeof info.name === "string" ? info.name : undefined,
  };
}

async function loginGoogle(ctx: Ctx) {
  const data = await body(
    ctx,
    z
      .object({
        id_token: z.string().min(20).max(8192).optional(),
        access_token: z.string().min(20).max(8192).optional(),
      })
      .refine((d) => Boolean(d.id_token || d.access_token), {
        message: "Jeton Google manquant",
      }),
  );
  rateLimit(`api-google:${clientIp(ctx)}`, 20, 15 * 60_000);
  if (!env.googleClientId) {
    throw new ApiError(503, "Connexion Google non configurée sur le serveur");
  }

  const profile = data.id_token
    ? await googleProfileFromIdToken(data.id_token)
    : await googleProfileFromAccessToken(data.access_token!);

  const email = profile.email.trim().toLowerCase();
  if (!profile.sub || !email) throw new ApiError(401, "Compte Google sans adresse email");
  // `emailVerified` est désormais calculé en `=== true` : ce contrôle attrape
  // donc aussi un jeton Google privé du drapeau `email_verified`.
  if (!profile.emailVerified) {
    throw new ApiError(401, "Adresse email Google non vérifiée");
  }

  const existing = await basePrisma.users.findFirst({
    where: { OR: [{ google_sub: profile.sub }, { email }] },
    select: { id: true, google_sub: true, email_verified_at: true },
  });
  if (existing) {
    if (existing.google_sub !== profile.sub) {
      // Rattachement : même adresse email déjà vérifiée par Google.
      await basePrisma.users.update({
        where: { id: existing.id },
        data: { google_sub: profile.sub, email_verified_at: existing.email_verified_at ?? new Date() },
      });
    }
    return sessionResponse(existing.id, ctx.request);
  }

  const fullName =
    [profile.givenName, profile.familyName].filter(Boolean).join(" ") ||
    profile.name ||
    email;
  try {
    const userId = await createAccount({
      email,
      fullName,
      googleSub: profile.sub,
      emailVerified: true,
    });
    return sessionResponse(userId, ctx.request);
  } catch {
    // Course possible (création simultanée) : on rattache au compte créé.
    const raced = await basePrisma.users.findUnique({ where: { email }, select: { id: true } });
    if (!raced) throw new ApiError(500, "Création du compte Google impossible");
    return sessionResponse(raced.id, ctx.request);
  }
}

async function me(ctx: Ctx) {
  const userId = requireUser(ctx);
  const [user, roles, profile] = await Promise.all([
    toAuthUser(userId),
    getRoles(userId),
    prisma.profiles.findUnique({ where: { id: userId } }),
  ]);
  if (!user) throw new ApiError(401, "Session expirée");
  return json({ user, roles, profile: toPlain(profile) });
}

async function updateProfile(ctx: Ctx) {
  const userId = requireUser(ctx);
  const data = await body(
    ctx,
    z.object({
      full_name: z.string().trim().max(120).optional(),
      phone: z.string().trim().max(24).optional(),
      language: z.enum(["fr", "en", "ar"]).optional(),
    }),
  );
  const profile = await prisma.profiles.update({ where: { id: userId }, data });
  // Le téléphone et le nom vivent aussi sur le compte (utilisés à la connexion
  // et dans les notifications) : on garde les deux synchronisés.
  const userPatch: { phone?: string; raw_user_meta_data?: object } = {};
  if (data.phone !== undefined && data.phone !== "") {
    const taken = await basePrisma.users.findFirst({
      where: { phone: data.phone, id: { not: userId } },
      select: { id: true },
    });
    if (!taken) userPatch.phone = data.phone;
  }
  if (data.full_name !== undefined) {
    userPatch.raw_user_meta_data = { full_name: data.full_name };
  }
  if (Object.keys(userPatch).length > 0) {
    await basePrisma.users.update({ where: { id: userId }, data: userPatch });
  }
  return json({ profile: toPlain(profile) });
}

// ============================================================================
// Ordonnances
// ============================================================================

const RX_SELECT = {
  id: true,
  status: true,
  patient_name: true,
  doctor_name: true,
  hospital: true,
  prescription_date: true,
  prescription_date_raw: true,
  is_expired: true,
  ai_confidence: true,
  review_severity: true,
  review_status: true,
  created_at: true,
  file_mime: true,
  prescription_items: {
    select: {
      id: true,
      medicine_name_raw: true,
      strength: true,
      quantity: true,
      dosage: true,
      duration: true,
      instructions: true,
    },
  },
} as const;

async function listPrescriptions(ctx: Ctx) {
  const userId = requireUser(ctx);
  const rows = await prisma.prescriptions.findMany({
    where: { patient_id: userId },
    select: RX_SELECT,
    orderBy: { created_at: "desc" },
    take: 100,
  });
  return json({ prescriptions: toPlain(rows) });
}

async function getPrescription(ctx: Ctx) {
  const userId = requireUser(ctx);
  const id = ctx.params[0];
  if (!(await canReadPrescription(userId, id))) throw new ApiError(404, "Ordonnance introuvable");
  const rx = await prisma.prescriptions.findUnique({
    where: { id },
    select: { ...RX_SELECT, file_path: true, patient_id: true },
  });
  if (!rx) throw new ApiError(404, "Ordonnance introuvable");
  const { file_path, patient_id, ...rest } = rx;
  return json({
    prescription: toPlain(rest),
    file_url: createAbsoluteSignedUrl("prescriptions", file_path, 3600),
    is_owner: patient_id === userId,
  });
}

/** Téléversement d'une photo + création de l'ordonnance + extraction IA. */
async function uploadPrescription(ctx: Ctx) {
  const userId = requireUser(ctx);
  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    throw new ApiError(400, "Requête invalide (multipart attendu)");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Fichier manquant");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > 15 * 1024 * 1024) throw new ApiError(413, "Fichier trop volumineux (15 Mo max)");

  // Le type MIME declare par le client n'est pas fiable : l'app mobile envoie
  // `application/octet-stream` quand elle ne devine pas l'extension du
  // fichier temporaire. On valide donc d'apres les octets reels, et c'est le
  // type renifle qui est stocke (l'extension suit, elle aussi).
  const declared = normalizeMime(file.type);
  const sniffed = sniffMime(bytes);
  if (!sniffed || !isPrescriptionMime(sniffed)) {
    throw new ApiError(
      415,
      `Format non accepte (photo ou PDF uniquement) - recu « ${declared || "type inconnu"} »`,
    );
  }
  if (declared && declared !== sniffed) {
    console.warn(
      `[upload-prescription] type declare « ${declared} » remplace par « ${sniffed} » (fichier « ${file.name} »)`,
    );
  }

  const { randomUUID } = await import("node:crypto");
  const path = `${userId}/${randomUUID()}.${extFromMime(sniffed)}`;
  await saveObject("prescriptions", path, bytes);

  const rx = await prisma.prescriptions.create({
    data: {
      patient_id: userId,
      file_path: path,
      file_mime: sniffed,
      status: "uploaded",
      source: "mobile",
    },
    select: { id: true },
  });

  const { extractPrescriptionCore } = await import("@/lib/rx-core.server");
  try {
    const extraction = await extractPrescriptionCore(userId, rx.id);
    const full = await prisma.prescriptions.findUnique({ where: { id: rx.id }, select: RX_SELECT });
    return json({ prescription: toPlain(full), extraction });
  } catch (err) {
    const full = await prisma.prescriptions.findUnique({ where: { id: rx.id }, select: RX_SELECT });
    return json(
      {
        prescription: toPlain(full),
        extraction: null,
        error: err instanceof Error ? err.message : "Extraction impossible",
      },
      200,
    );
  }
}

// ============================================================================
// Commandes
// ============================================================================

const RESERVATION_SELECT = {
  id: true,
  status: true,
  delivery_status: true,
  payment_status: true,
  payment_method: true,
  payment_reference: true,
  fulfillment_method: true,
  is_partial: true,
  missing_items: true,
  items_total: true,
  delivery_fee: true,
  total_amount: true,
  pickup_code: true,
  receipt_code: true,
  patient_address: true,
  patient_lat: true,
  patient_lng: true,
  created_at: true,
  accepted_at: true,
  ready_at: true,
  delivered_at: true,
  prescription_id: true,
  pharmacies: {
    select: { id: true, name: true, address: true, phone: true, lat: true, lng: true },
  },
  neighborhoods: { select: { name: true } },
  reservation_items: {
    select: {
      id: true,
      available: true,
      unit_price: true,
      prescription_items: {
        select: { medicine_name_raw: true, strength: true, quantity: true, dosage: true },
      },
    },
  },
} as const;

async function listReservations(ctx: Ctx) {
  const userId = requireUser(ctx);
  const rows = await prisma.reservations.findMany({
    where: { patient_id: userId },
    select: RESERVATION_SELECT,
    orderBy: { created_at: "desc" },
    take: 100,
  });
  return json({ reservations: toPlain(rows) });
}

async function getReservation(ctx: Ctx) {
  const userId = requireUser(ctx);
  const row = await prisma.reservations.findUnique({
    where: { id: ctx.params[0] },
    select: { ...RESERVATION_SELECT, patient_id: true, pharmacy_id: true, courier_id: true },
  });
  if (!row) throw new ApiError(404, "Commande introuvable");
  const access = await reservationAccess(userId, {
    patient_id: row.patient_id,
    pharmacy_id: row.pharmacy_id,
    courier_id: row.courier_id,
    payment_status: row.payment_status,
  });
  if (!access.canRead) throw new ApiError(404, "Commande introuvable");

  // Position du livreur, seulement pendant une livraison active (ancienne RLS).
  let courier: unknown = null;
  if (row.courier_id) {
    const { canViewCourier } = await import("@/lib/reservation-rules.server");
    if (await canViewCourier(userId, row.courier_id)) {
      courier = await prisma.couriers.findUnique({
        where: { id: row.courier_id },
        select: {
          id: true,
          full_name: true,
          phone: true,
          vehicle_type: true,
          current_lat: true,
          current_lng: true,
        },
      });
    }
  }
  const { patient_id, pharmacy_id, courier_id, ...rest } = row;
  // Les codes de retrait / réception n'appartiennent qu'au patient : la
  // pharmacie et le livreur ne doivent pas pouvoir les lire.
  if (!access.isPatient && !access.isAdmin) {
    rest.pickup_code = null;
    rest.receipt_code = null;
  }
  return json({ reservation: toPlain(rest), courier: toPlain(courier) });
}

/** Envoie l'ordonnance à la pharmacie la plus proche qui a les médicaments. */
async function routePrescription(ctx: Ctx) {
  const userId = requireUser(ctx);
  const data = await body(
    ctx,
    z.object({
      prescription_id: z.string().uuid(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      address: z.string().trim().max(300).optional(),
      neighborhood_id: z.string().uuid().optional(),
      notes: z.string().trim().max(500).optional(),
    }),
  );
  const { autoRouteCore, resolveDeliveryTarget } = await import("@/lib/routing-core.server");
  const target = await resolveDeliveryTarget({
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    address: data.address ?? null,
    neighborhoodId: data.neighborhood_id ?? null,
  });
  const result = await autoRouteCore({
    prescriptionId: data.prescription_id,
    patientId: userId,
    patientLat: target.lat,
    patientLng: target.lng,
    patientAddress: target.address,
    neighborhoodId: target.neighborhoodId,
    deliveryMode: target.deliveryMode,
    notes: data.notes ?? null,
    source: "mobile",
  });
  return json(toPlain(result));
}

/** Choix livraison / retrait (avant paiement). */
async function setFulfillment(ctx: Ctx) {
  const userId = requireUser(ctx);
  const data = await body(ctx, z.object({ method: z.enum(["delivery", "pickup"]) }));
  const { updateReservationAs } = await import("@/lib/reservation-rules.server");
  const { DELIVERY_FEE } = await import("@/lib/routing-core.server");
  const current = await prisma.reservations.findUnique({
    where: { id: ctx.params[0] },
    select: { items_total: true },
  });
  if (!current) throw new ApiError(404, "Commande introuvable");
  const fee = data.method === "pickup" ? 0 : DELIVERY_FEE;
  const row = await updateReservationAs(userId, ctx.params[0], {
    fulfillment_method: data.method,
    delivery_fee: fee,
    total_amount: current.items_total + fee,
  });
  return json({ reservation: toPlain(row) });
}

/** Déclaration du paiement mobile money (la pharmacie confirme ensuite). */
async function declarePayment(ctx: Ctx) {
  const userId = requireUser(ctx);
  const data = await body(
    ctx,
    z.object({
      method: z.enum(["orange_money", "moov_money"]),
      reference: z.string().trim().min(4).max(64),
      phone: z.string().trim().min(8).max(24),
    }),
  );
  const { updateReservationAs } = await import("@/lib/reservation-rules.server");
  const row = await updateReservationAs(userId, ctx.params[0], {
    payment_status: "pending_verification",
    payment_method: data.method,
    payment_reference: data.reference,
    patient_phone: data.phone,
  });
  return json({ reservation: toPlain(row) });
}

async function cancelReservation(ctx: Ctx) {
  const userId = requireUser(ctx);
  const { updateReservationAs } = await import("@/lib/reservation-rules.server");
  const row = await updateReservationAs(userId, ctx.params[0], { status: "cancelled" });
  return json({ reservation: toPlain(row) });
}

// ============================================================================
// Annuaire : pharmacies, praticiens, quartiers
// ============================================================================

async function listPharmacies(ctx: Ctx) {
  requireUser(ctx);
  const lat = num(ctx.url.searchParams.get("lat"));
  const lng = num(ctx.url.searchParams.get("lng"));
  const rows = await prisma.pharmacies.findMany({
    where: { status: "approved" },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      phone: true,
      lat: true,
      lng: true,
      rating: true,
    },
  });
  const withDistance = rows.map((p) => ({
    ...p,
    distance_km:
      lat != null && lng != null && p.lat != null && p.lng != null
        ? Math.round(haversineKm(lat, lng, p.lat, p.lng) * 10) / 10
        : null,
  }));
  withDistance.sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));
  return json({ pharmacies: toPlain(withDistance.slice(0, 50)) });
}

async function listPractitioners(ctx: Ctx) {
  requireUser(ctx);
  const { findPractitionersCore } = await import("@/lib/health-core.server");
  const typeParam = ctx.url.searchParams.get("type");
  const rows = await findPractitionersCore({
    specialtyCode: ctx.url.searchParams.get("specialty"),
    type: typeParam === "doctor" || typeParam === "nurse" ? typeParam : null,
    lat: num(ctx.url.searchParams.get("lat")),
    lng: num(ctx.url.searchParams.get("lng")),
    homeVisitOnly: ctx.url.searchParams.get("home_visits") === "1",
    limit: 30,
  });
  const specialties = await prisma.practitioner_specialties.findMany({
    select: { code: true, label_fr: true, label_en: true, label_ar: true, practitioner_type: true },
  });
  return json({ practitioners: toPlain(rows), specialties: toPlain(specialties) });
}

async function listNeighborhoods(ctx: Ctx) {
  requireUser(ctx);
  const rows = await prisma.neighborhoods.findMany({
    where: { is_active: true },
    select: { id: true, name: true, city: true, lat: true, lng: true },
    orderBy: { name: "asc" },
  });
  return json({ neighborhoods: toPlain(rows) });
}

// ============================================================================
// Notifications
// ============================================================================

async function listNotifications(ctx: Ctx) {
  const userId = requireUser(ctx);
  const rows = await prisma.notifications.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    take: 50,
  });
  return json({ notifications: toPlain(rows) });
}

async function markNotificationsRead(ctx: Ctx) {
  const userId = requireUser(ctx);
  const data = await body(ctx, z.object({ id: z.string().uuid().optional() }));
  await prisma.notifications.updateMany({
    where: { user_id: userId, read_at: null, ...(data.id ? { id: data.id } : {}) },
    data: { read_at: new Date() },
  });
  return json({ ok: true });
}

async function registerDevice(ctx: Ctx) {
  const userId = requireUser(ctx);
  const data = await body(
    ctx,
    z.object({
      token: z.string().min(20).max(4096),
      platform: z.enum(["android", "ios", "web"]),
      language: z.enum(["fr", "en", "ar"]).default("fr"),
    }),
  );
  const existing = await prisma.device_tokens.findUnique({
    where: { token: data.token },
    select: { user_id: true },
  });
  // Le jeton push appartient a l'appareil, pas a la personne. Sur un telephone
  // partage (ou apres une reconnexion avec un autre compte) FCM renvoie le meme
  // jeton : on le rattache au compte qui se connecte, sinon ce nouveau compte ne
  // recevrait plus aucune notification.
  if (existing && existing.user_id !== userId) {
    console.warn(
      `[devices] jeton rattache a un nouveau compte (precedent ${existing.user_id} -> ${userId})`,
    );
  }
  await prisma.device_tokens.upsert({
    where: { token: data.token },
    create: {
      user_id: userId,
      token: data.token,
      platform: data.platform,
      language: data.language,
    },
    update: { user_id: userId, platform: data.platform, language: data.language },
  });
  return json({ ok: true });
}

// ============================================================================
// Santé : triage IA et rendez-vous
// ============================================================================

async function triage(ctx: Ctx) {
  requireUser(ctx);
  const data = await body(
    ctx,
    z.object({
      symptoms: z.string().min(5, "Décrivez un peu plus vos symptômes").max(2000),
      language: z.enum(["fr", "en", "ar"]).default("fr"),
      lat: z.number().nullable().optional(),
      lng: z.number().nullable().optional(),
      home_visits: z.boolean().optional(),
    }),
  );
  const { triageSymptoms, findPractitionersCore } = await import("@/lib/health-core.server");
  const specs = await prisma.practitioner_specialties.findMany({
    select: {
      code: true,
      label_fr: true,
      label_en: true,
      label_ar: true,
      practitioner_type: true,
      keywords: true,
    },
  });
  const result = await triageSymptoms(specs, data.symptoms, data.language);
  let practitioners = await findPractitionersCore({
    specialtyCode: result.specialty_code,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    homeVisitOnly: data.home_visits ?? false,
  });
  if (practitioners.length === 0) {
    practitioners = await findPractitionersCore({
      type: result.practitioner_type,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      homeVisitOnly: data.home_visits ?? false,
    });
  }
  return json({
    triage: result,
    practitioners: toPlain(practitioners),
    specialties: toPlain(
      specs.map((s) => ({
        code: s.code,
        label_fr: s.label_fr,
        label_en: s.label_en,
        label_ar: s.label_ar,
        practitioner_type: s.practitioner_type,
      })),
    ),
  });
}

async function listAppointments(ctx: Ctx) {
  const userId = requireUser(ctx);
  const rows = await prisma.appointments.findMany({
    where: { patient_id: userId },
    select: {
      id: true,
      reason: true,
      symptoms: true,
      status: true,
      at_home: true,
      requested_at: true,
      scheduled_at: true,
      proposed_at: true,
      patient_address: true,
      report: true,
      prescribed_items: true,
      practitioners: {
        select: { id: true, full_name: true, type: true, phone: true, specialty_code: true },
      },
    },
    orderBy: { requested_at: "desc" },
    take: 50,
  });
  return json({ appointments: toPlain(rows) });
}

async function createAppointment(ctx: Ctx) {
  const userId = requireUser(ctx);
  const data = await body(
    ctx,
    z.object({
      practitioner_id: z.string().uuid(),
      reason: z.string().trim().max(300).optional(),
      symptoms: z.string().max(2000).optional(),
      at_home: z.boolean().default(false),
      address: z.string().max(300).nullable().optional(),
      phone: z.string().max(40).nullable().optional(),
      lat: z.number().nullable().optional(),
      lng: z.number().nullable().optional(),
      preferred_at: z.string().datetime().nullable().optional(),
      triage: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
  );
  const { Prisma } = await import("./db.server");
  const prac = await prisma.practitioners.findUnique({
    where: { id: data.practitioner_id },
    select: { status: true, home_visits: true, is_available: true },
  });
  if (!prac || prac.status !== "approved" || !prac.is_available) {
    throw new ApiError(400, "Ce praticien n'est pas disponible actuellement.");
  }
  if (data.at_home && !prac.home_visits) {
    throw new ApiError(400, "Ce praticien ne fait pas de visite à domicile.");
  }
  const created = await prisma.appointments.create({
    data: {
      patient_id: userId,
      practitioner_id: data.practitioner_id,
      reason: data.reason?.trim() || "Consultation",
      symptoms: data.symptoms ?? null,
      at_home: data.at_home,
      patient_address: data.address ?? null,
      patient_phone: data.phone ?? null,
      patient_lat: data.lat ?? null,
      patient_lng: data.lng ?? null,
      ...(data.preferred_at ? { proposed_at: new Date(data.preferred_at) } : {}),
      triage: (data.triage ?? Prisma.DbNull) as never,
      status: "requested",
    },
    select: { id: true },
  });
  return json({ appointment_id: created.id });
}

async function cancelAppointment(ctx: Ctx) {
  const userId = requireUser(ctx);
  const { updateAppointmentAs } = await import("@/lib/appointments-core.server");
  await updateAppointmentAs(userId, ctx.params[0], { status: "cancelled" });
  return json({ ok: true });
}

// ============================================================================
// Médicaments sans ordonnance
// ============================================================================

async function otcSuggestions(ctx: Ctx) {
  requireUser(ctx);
  const q = (ctx.url.searchParams.get("q") ?? "").trim();
  const rows = await prisma.medicines.findMany({
    where: q
      ? {
          OR: [
            { normalized_name: { contains: q, mode: "insensitive" } },
            { generic_name: { contains: q, mode: "insensitive" } },
          ],
        }
      : {},
    select: { normalized_name: true },
    orderBy: { normalized_name: "asc" },
    take: 15,
  });
  return json({ suggestions: [...new Set(rows.map((r) => r.normalized_name))] });
}

async function otcOrder(ctx: Ctx) {
  const userId = requireUser(ctx);
  const data = await body(
    ctx,
    z.object({
      medicines: z
        .array(z.string().trim().min(2).max(120))
        .min(1, "Ajoutez au moins un médicament")
        .max(10),
      lat: z.number().optional(),
      lng: z.number().optional(),
      address: z.string().trim().max(200).optional(),
      neighborhood_id: z.string().uuid().optional(),
    }),
  );
  const { createOtcOrderCore } = await import("@/lib/otc-core.server");
  const result = await createOtcOrderCore(userId, {
    medicines: data.medicines,
    lat: data.lat,
    lng: data.lng,
    address: data.address,
    neighborhoodId: data.neighborhood_id,
    source: "mobile-otc",
  });
  return json(toPlain(result));
}

// ============================================================================
// Espace pharmacie (application mobile)
// ============================================================================

/** Pharmacie à gérer : première pharmacie de l'utilisateur, ou `?pharmacy_id=` (admin). */
async function resolvePharmacyId(ctx: Ctx, userId: string): Promise<string> {
  const ids = await userPharmacyIds(userId);
  const q = ctx.url.searchParams.get("pharmacy_id");
  if (ids.length > 0) return q && ids.includes(q) ? q : ids[0];
  if (q && (await isAdmin(userId))) return q;
  throw new ForbiddenError("Aucune pharmacie rattachée à ce compte");
}

/** Tableau de bord : pharmacie, stocks, compteurs de commandes. */
async function pharmacyMe(ctx: Ctx) {
  const userId = requireUser(ctx);
  const pharmacyId = await resolvePharmacyId(ctx, userId);
  const admin = await isAdmin(userId);
  const [pharmacy, stock, low, statuses] = await Promise.all([
    prisma.pharmacies.findFirst({
      where: { id: pharmacyId },
      select: {
        id: true,
        name: true,
        status: true,
        address: true,
        city: true,
        phone: true,
        license_number: true,
      },
    }),
    prisma.inventory.count({ where: { pharmacy_id: pharmacyId } }),
    prisma.inventory.count({ where: { pharmacy_id: pharmacyId, stock_qty: { lte: 5 } } }),
    prisma.reservations.findMany({
      where: {
        pharmacy_id: pharmacyId,
        ...(admin ? {} : { payment_status: { not: "unpaid" as const } }),
      },
      select: { status: true },
    }),
  ]);
  if (!pharmacy) throw new NotFoundError("Pharmacie introuvable");
  const orders: Record<string, number> = {};
  for (const s of statuses) orders[s.status] = (orders[s.status] ?? 0) + 1;
  return json(toPlain({ pharmacy, stats: { stock, low_stock: low, orders } }));
}

/** Commandes reçues (mêmes règles de visibilité que le site). */
async function pharmacyOrders(ctx: Ctx) {
  const userId = requireUser(ctx);
  const pharmacyId = await resolvePharmacyId(ctx, userId);
  const admin = await isAdmin(userId);
  const rows = await prisma.reservations.findMany({
    where: {
      pharmacy_id: pharmacyId,
      // La pharmacie ne voit une commande qu'après déclaration du paiement (ancienne RLS).
      ...(admin ? {} : { payment_status: { not: "unpaid" as const } }),
    },
    select: {
      id: true,
      status: true,
      delivery_status: true,
      created_at: true,
      notes: true,
      prescription_id: true,
      payment_status: true,
      payment_method: true,
      payment_reference: true,
      total_amount: true,
      fulfillment_method: true,
      patient_name: true,
      patient_phone: true,
      pickup_code_verified_at: true,
      prescriptions: {
        select: {
          file_path: true,
          file_mime: true,
          patient_name: true,
          doctor_name: true,
          hospital: true,
          prescription_date: true,
          ai_confidence: true,
        },
      },
      reservation_items: {
        select: {
          id: true,
          available: true,
          price: true,
          unit_price: true,
          prescription_items: {
            select: {
              medicine_name_raw: true,
              strength: true,
              quantity: true,
              dosage: true,
              duration: true,
              instructions: true,
            },
          },
        },
      },
    },
    orderBy: { created_at: "desc" },
    take: 200,
  });

  // L'ordonnance est lisible par la pharmacie destinataire de la commande.
  const rxUrls: Record<string, string> = {};
  for (const r of rows) {
    const path = r.prescriptions?.file_path;
    if (!path) continue;
    try {
      rxUrls[r.id] = createAbsoluteSignedUrl("prescriptions", path, 3600);
    } catch {
      // chemin invalide : pas d'aperçu
    }
  }
  return json(toPlain({ rows, rxUrls }));
}

/** Décision sur une commande (accepter / refuser / prête / terminée) + vérification du paiement. */
async function pharmacyOrderDecision(ctx: Ctx) {
  const userId = requireUser(ctx);
  const reservationId = ctx.params[0];
  const data = await body(
    ctx,
    z.object({
      decision: z.enum(["accepted", "rejected", "ready", "completed", "cancelled"]).optional(),
      payment: z.enum(["verify", "reject"]).optional(),
    }),
  );
  if (!data.decision && !data.payment) throw new ApiError(400, "Aucune action fournie");

  const row = await prisma.reservations.findUnique({
    where: { id: reservationId },
    select: { pharmacy_id: true },
  });
  if (!row) throw new NotFoundError("Commande introuvable");
  const ids = await userPharmacyIds(userId);
  if (!ids.includes(row.pharmacy_id) && !(await isAdmin(userId))) {
    throw new NotFoundError("Commande introuvable");
  }

  const now = new Date();
  const patch: ReservationPatch = { status: data.decision };
  if (data.decision === "accepted") patch.accepted_at = now;
  if (data.decision === "ready") patch.ready_at = now;
  if (data.decision === "completed") patch.delivered_at = now;
  if (data.payment === "verify") {
    patch.payment_status = "paid";
    patch.paid_at = now;
  }
  if (data.payment === "reject") patch.payment_status = "failed";

  await updateReservationAs(userId, reservationId, patch);
  await prisma.audit_logs.create({
    data: {
      actor_user_id: userId,
      action: data.payment ? `payment_${data.payment}` : `reservation_${data.decision}`,
      entity: "reservation",
      entity_id: reservationId,
    },
  });
  return json({ ok: true });
}

/** Stock de la pharmacie : lignes + référence pharmacie. */
async function pharmacyInventory(ctx: Ctx) {
  const userId = requireUser(ctx);
  const pharmacyId = await resolvePharmacyId(ctx, userId);
  const [pharmacy, rows] = await Promise.all([
    prisma.pharmacies.findFirst({
      where: { id: pharmacyId },
      select: { id: true, name: true, status: true },
    }),
    prisma.inventory.findMany({
      where: { pharmacy_id: pharmacyId },
      select: {
        id: true,
        stock_qty: true,
        price: true,
        updated_at: true,
        medicines: {
          select: { id: true, normalized_name: true, strength: true, generic_name: true, form: true },
        },
      },
      orderBy: { updated_at: "desc" },
    }),
  ]);
  if (!pharmacy) throw new NotFoundError("Pharmacie introuvable");
  return json(toPlain({ pharmacy, rows }));
}

/** Ajout / remplacement d'une ligne de stock. */
async function pharmacyInventoryUpsert(ctx: Ctx) {
  const userId = requireUser(ctx);
  const data = await body(
    ctx,
    z.object({
      pharmacy_id: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(300),
      generic: z.string().trim().max(300).optional().default(""),
      strength: z.string().trim().max(100).optional().default(""),
      stock: z.number().int().min(-10_000_000).max(10_000_000),
      price: z.number().finite().nullable(),
    }),
  );

  // Pharmacie par défaut (celle de l'utilisateur) sauf `pharmacy_id` explicite.
  const pharmacyId = data.pharmacy_id ?? (await userPharmacyIds(userId))[0];
  if (!pharmacyId) throw new ForbiddenError("Aucune pharmacie rattachée à ce compte");
  await assertPharmacyMemberOrAdmin(userId, pharmacyId);

  // Minuscules sans accent : correspond aux `normalized_name` du catalogue.
  const normalized = data.name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const strengthVal = data.strength.trim();
  const existing = await prisma.medicines.findFirst({
    where: { normalized_name: normalized, ...(strengthVal ? { strength: strengthVal } : {}) },
    select: { id: true },
  });
  let medId = existing?.id;
  if (!medId) {
    // Le catalogue des médicaments n'est modifiable que par les admins.
    if (!(await isAdmin(userId))) {
      throw new ForbiddenError(
        "Ce médicament n'existe pas encore dans le catalogue : seul un administrateur peut l'ajouter.",
      );
    }
    const med = await prisma.medicines.create({
      data: {
        normalized_name: normalized,
        generic_name: data.generic || null,
        strength: data.strength || null,
      },
      select: { id: true },
    });
    medId = med.id;
  }

  await prisma.inventory.upsert({
    where: { pharmacy_id_medicine_id: { pharmacy_id: pharmacyId, medicine_id: medId } },
    create: {
      pharmacy_id: pharmacyId,
      medicine_id: medId,
      stock_qty: data.stock,
      price: data.price,
    },
    update: { stock_qty: data.stock, price: data.price },
  });
  return json({ ok: true });
}

/** Mise à jour quantité / prix d'une ligne de stock. */
async function pharmacyInventoryUpdate(ctx: Ctx) {
  const userId = requireUser(ctx);
  const id = ctx.params[0];
  const data = await body(
    ctx,
    z.object({
      stock_qty: z.number().int().min(-10_000_000).max(10_000_000).optional(),
      price: z.number().finite().nullable().optional(),
    }),
  );
  const row = await prisma.inventory.findUnique({
    where: { id },
    select: { id: true, pharmacy_id: true },
  });
  if (!row) throw new NotFoundError("Ligne de stock introuvable");
  await assertPharmacyMemberOrAdmin(userId, row.pharmacy_id);
  await prisma.inventory.update({
    where: { id: row.id },
    data: {
      ...(data.stock_qty !== undefined ? { stock_qty: data.stock_qty } : {}),
      ...(data.price !== undefined ? { price: data.price } : {}),
    },
  });
  return json({ ok: true });
}

/** Suppression d'une ligne de stock. */
async function pharmacyInventoryDelete(ctx: Ctx) {
  const userId = requireUser(ctx);
  const id = ctx.params[0];
  const row = await prisma.inventory.findUnique({
    where: { id },
    select: { id: true, pharmacy_id: true },
  });
  if (!row) throw new NotFoundError("Ligne de stock introuvable");
  await assertPharmacyMemberOrAdmin(userId, row.pharmacy_id);
  await prisma.inventory.deleteMany({ where: { id: row.id } });
  return json({ ok: true });
}

/** Assignation du livreur en ligne le plus proche (mirroir de `assignCourier`). */
async function pharmacyAssignCourier(ctx: Ctx) {
  const userId = requireUser(ctx);
  const reservationId = ctx.params[0];
  const res = await prisma.reservations.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      patient_id: true,
      pharmacy_id: true,
      courier_id: true,
      payment_status: true,
      fulfillment_method: true,
      pharmacies: { select: { lat: true, lng: true } },
    },
  });
  if (!res || !(await reservationAccess(userId, res)).canRead) {
    throw new NotFoundError("Commande introuvable");
  }
  if (res.courier_id) throw new ApiError(409, "Livreur déjà assigné");
  if (res.fulfillment_method === "pickup") {
    throw new ApiError(400, "Le client récupère lui-même sa commande");
  }
  const pharm = res.pharmacies;
  if (!pharm?.lat || !pharm?.lng) throw new ApiError(400, "Pharmacie sans coordonnées");

  const couriers = await prisma.couriers.findMany({
    where: {
      status: "approved",
      is_online: true,
      current_lat: { not: null },
      current_lng: { not: null },
    },
    select: { id: true, full_name: true, current_lat: true, current_lng: true },
  });
  if (couriers.length === 0) {
    throw new ApiError(400, "Aucun livreur en ligne pour le moment");
  }
  const sorted = couriers
    .map((c) => ({
      c,
      d: haversineKm(pharm.lat!, pharm.lng!, c.current_lat!, c.current_lng!),
    }))
    .sort((a, b) => a.d - b.d);
  const best = sorted[0]!.c;

  await updateReservationAs(userId, reservationId, {
    courier_id: best.id,
    delivery_status: "assigned",
    assigned_at: new Date(),
    status: "ready",
  });
  await prisma.audit_logs.create({
    data: {
      actor_user_id: userId,
      action: "courier_assigned",
      entity: "reservation",
      entity_id: reservationId,
      meta: { courier_id: best.id },
    },
  });
  return json({ courier_id: best.id, courier_name: best.full_name });
}

// ============================================================================
// Espace livreur (application mobile)
// ============================================================================

/** Profil livreur, livraisons actives et nombre de livraisons terminées. */
async function courierMe(ctx: Ctx) {
  const userId = requireUser(ctx);
  const courier = await prisma.couriers.findUnique({
    where: { user_id: userId },
    select: { id: true, status: true, is_online: true, full_name: true, phone: true },
  });
  if (!courier) return json({ courier: null, deliveries: [], done: 0 });

  const [active, done] = await Promise.all([
    prisma.reservations.findMany({
      where: {
        courier_id: courier.id,
        delivery_status: { in: ["assigned", "picked_up", "en_route"] },
      },
      select: {
        id: true,
        delivery_status: true,
        patient_address: true,
        patient_lat: true,
        patient_lng: true,
        created_at: true,
        assigned_at: true,
        pharmacies: {
          select: { name: true, address: true, lat: true, lng: true, status: true, owner_user_id: true },
        },
      },
      // Postgres (ordre décroissant) place les valeurs nulles en premier.
      orderBy: { assigned_at: { sort: "desc", nulls: "first" } },
    }),
    prisma.reservations.count({
      where: { courier_id: courier.id, delivery_status: "delivered" },
    }),
  ]);

  const deliveries = [];
  for (const r of active) {
    const { pharmacies: ph, ...rest } = r;
    deliveries.push({
      ...rest,
      pharmacies: (await canViewPharmacy(userId, ph))
        ? { name: ph.name, address: ph.address, lat: ph.lat, lng: ph.lng }
        : null,
    });
  }
  return json(toPlain({ courier, deliveries, done }));
}

/** Changement d'état d'une livraison assignée (ramassée / en route / livrée / échouée). */
async function courierDeliveryStatus(ctx: Ctx) {
  const userId = requireUser(ctx);
  const reservationId = ctx.params[0];
  const data = await body(
    ctx,
    z.object({ status: z.enum(["picked_up", "en_route", "delivered", "failed"]) }),
  );

  const patch: ReservationPatch = { delivery_status: data.status };
  if (data.status === "picked_up") patch.picked_up_at = new Date();
  if (data.status === "delivered") {
    patch.delivered_at = new Date();
    patch.status = "completed";
  }
  // assertReservationUpdate vérifie que la course est bien assignée à ce livreur.
  await updateReservationAs(userId, reservationId, patch);
  await prisma.audit_logs.create({
    data: {
      actor_user_id: userId,
      action: `delivery_${data.status}`,
      entity: "reservation",
      entity_id: reservationId,
    },
  });
  return json({ ok: true });
}

/** Activation / désactivation du compte en ligne. */
async function courierOnline(ctx: Ctx) {
  const userId = requireUser(ctx);
  const data = await body(
    ctx,
    z.object({
      online: z.boolean(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    }),
  );
  const courier = await prisma.couriers.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  if (!courier) throw new NotFoundError("Profil livreur introuvable");
  await prisma.couriers.update({
    where: { id: courier.id },
    data: {
      is_online: data.online,
      ...(data.lat !== undefined && data.lng !== undefined
        ? { current_lat: data.lat, current_lng: data.lng, last_position_at: new Date() }
        : {}),
    },
  });
  return json({ ok: true });
}

/** Position GPS du livreur (suivi temps réel). */
async function courierPosition(ctx: Ctx) {
  const userId = requireUser(ctx);
  const data = await body(
    ctx,
    z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      reservation_id: z.string().uuid().nullable().optional(),
    }),
  );
  const courier = await prisma.couriers.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  if (!courier) throw new NotFoundError("Profil livreur introuvable");
  await prisma.couriers.update({
    where: { id: courier.id },
    data: { current_lat: data.lat, current_lng: data.lng, last_position_at: new Date() },
  });
  if (data.reservation_id) {
    await prisma.courier_positions
      .create({
        data: {
          courier_id: courier.id,
          reservation_id: data.reservation_id,
          lat: data.lat,
          lng: data.lng,
        },
      })
      .catch(() => undefined);
  }
  return json({ ok: true });
}

// ============================================================================
// Espace praticien (application mobile)
// ============================================================================

/** Tableau de bord : profil, rendez-vous (avec patient) et compteurs. */
async function practitionerDashboard(ctx: Ctx) {
  const userId = requireUser(ctx);
  const me = await getPractitionerForUser(userId);
  if (!me) {
    return json(
      toPlain({
        me: null,
        appointments: [],
        counts: { requested: 0, today: 0, upcoming: 0, completed: 0 },
      }),
    );
  }

  const data = await prisma.appointments.findMany({
    where: { practitioner_id: me.id },
    select: {
      id: true,
      patient_id: true,
      patient_phone: true,
      patient_address: true,
      reason: true,
      symptoms: true,
      at_home: true,
      status: true,
      requested_at: true,
      scheduled_at: true,
      proposed_at: true,
      practitioner_notes: true,
      rejection_reason: true,
      completed_at: true,
    },
    orderBy: { requested_at: "desc" },
    take: 300,
  });

  const patientIds = [...new Set(data.map((r) => r.patient_id))];
  const profiles = await prisma.profiles.findMany({
    where: { id: { in: patientIds } },
    select: { id: true, full_name: true, phone: true },
  });
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const appointments = data.map((r) => {
    const p = byId.get(r.patient_id);
    return {
      ...r,
      patient_name: p?.full_name?.trim() || "Patient",
      patient_phone: r.patient_phone || p?.phone || null,
    };
  });

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfDay = startOfDay + 86_400_000;
  const counts = { requested: 0, today: 0, upcoming: 0, completed: 0 };
  for (const a of appointments) {
    if (a.status === "requested") counts.requested++;
    else if (a.status === "completed") counts.completed++;
    else if (a.status === "accepted" && a.scheduled_at) {
      const ts = new Date(a.scheduled_at).getTime();
      if (ts >= startOfDay && ts < endOfDay) counts.today++;
      else if (ts >= endOfDay) counts.upcoming++;
    }
  }
  return json(toPlain({ me, appointments, counts }));
}

/** Réponse du praticien à un rendez-vous (accepter / reprogrammer / refuser) + clôture. */
async function practitionerRespond(ctx: Ctx) {
  const userId = requireUser(ctx);
  const id = ctx.params[0];
  const data = await body(
    ctx,
    z.object({
      action: z.enum(["accept", "reschedule", "reject"]).optional(),
      at: z.string().datetime({ offset: true }).nullable().optional(),
      reason: z.string().max(300).nullable().optional(),
      notes: z.string().max(4000).nullable().optional(),
      complete: z.boolean().optional(),
    }),
  );
  if (!data.action && !data.complete && data.notes == null) {
    throw new ApiError(400, "Aucune action fournie");
  }

  const me = await getPractitionerForUser(userId);
  if (!me) throw new ForbiddenError("Aucun profil praticien lié à ce compte");
  const row = await prisma.appointments.findFirst({
    where: { id, practitioner_id: me.id },
    select: { id: true, status: true },
  });
  if (!row) throw new NotFoundError("Rendez-vous introuvable");
  if (["completed", "cancelled", "rejected"].includes(row.status)) {
    throw new ApiError(400, "Ce rendez-vous est déjà clôturé");
  }

  const patch: Record<string, unknown> = {};
  if (data.action === "accept") {
    if (!data.at) throw new ApiError(400, "Choisissez une date et une heure");
    const at = new Date(data.at);
    Object.assign(patch, {
      status: "accepted",
      scheduled_at: at,
      proposed_at: at,
      rejection_reason: null,
    });
  } else if (data.action === "reschedule") {
    if (!data.at) throw new ApiError(400, "Choisissez une nouvelle date");
    Object.assign(patch, {
      status: "rescheduled",
      proposed_at: new Date(data.at),
      scheduled_at: null,
    });
  } else if (data.action === "reject") {
    Object.assign(patch, { status: "rejected", rejection_reason: data.reason?.trim() || null });
  }
  if (data.notes !== undefined && data.notes !== null) patch.practitioner_notes = data.notes;
  if (data.complete) {
    patch.status = "completed";
    patch.completed_at = new Date();
  }

  await updateAppointmentAs(userId, id, patch as never);
  return json({ ok: true });
}

// ============================================================================
// Administration (application mobile)
// ============================================================================

/** Vue d'ensemble : pharmacies, compteurs globaux, RDV en attente. */
async function adminOverview(ctx: Ctx) {
  const userId = requireUser(ctx);
  await assertAdmin(userId);
  const [pharmacies, couriers, approvedPharmacies, all, users, patients, practitioners, appts] =
    await Promise.all([
      prisma.pharmacies.findMany({
        select: {
          id: true,
          name: true,
          license_number: true,
          address: true,
          city: true,
          status: true,
          lat: true,
          lng: true,
          created_at: true,
          owner_user_id: true,
        },
        orderBy: { created_at: "desc" },
        take: 200,
      }),
      prisma.couriers.count({ where: { status: "approved" } }),
      prisma.pharmacies.count({ where: { status: "approved" } }),
      prisma.reservations.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.users.count(),
      prisma.user_roles.count({ where: { role: "patient" } }),
      prisma.practitioners.count({ where: { status: "approved" } }),
      prisma.appointments.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

  let active = 0;
  let delivered = 0;
  for (const g of all) {
    if (g.status === "completed") delivered += g._count._all;
    else if (g.status !== "cancelled" && g.status !== "rejected") active += g._count._all;
  }
  const appointmentsPending =
    appts.find((g) => g.status === "requested")?._count._all ?? 0;

  // N'expose pas l'UUID du propriétaire : on ne renvoie qu'un booléen
  // « un compte de connexion existe pour cette pharmacie ».
  const pharmacyRows = pharmacies.map(({ owner_user_id, ...rest }) => ({
    ...rest,
    has_account: owner_user_id != null,
  }));

  return json(
    toPlain({
      pharmacies: pharmacyRows,
      counts: {
        pharmacies: approvedPharmacies,
        couriers,
        active,
        delivered,
        users,
        patients,
        practitioners,
        appointments_pending: appointmentsPending,
      },
    }),
  );
}

/** Comptes utilisateurs (profil, rôles, dernière connexion). */
async function adminUsers(ctx: Ctx) {
  const userId = requireUser(ctx);
  await assertAdmin(userId);
  const rows = await basePrisma.users.findMany({
    take: 300,
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      email: true,
      phone: true,
      created_at: true,
      last_sign_in_at: true,
      profile: { select: { full_name: true, phone: true } },
      user_roles: { select: { role: true } },
    },
  });
  return json(
    toPlain({
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.profile?.phone ?? u.phone ?? null,
        full_name: u.profile?.full_name ?? null,
        roles: u.user_roles.map((r) => r.role),
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      })),
    }),
  );
}

/** Liste des livreurs (validation). */
async function adminCouriers(ctx: Ctx) {
  const userId = requireUser(ctx);
  await assertAdmin(userId);
  const rows = await prisma.couriers.findMany({
    select: {
      id: true,
      full_name: true,
      phone: true,
      vehicle_type: true,
      license_number: true,
      status: true,
      is_online: true,
      created_at: true,
    },
    orderBy: { created_at: "desc" },
    take: 200,
  });
  return json(toPlain({ couriers: rows }));
}

/** Pharmacies et leur gérant (liste admin, pour attribuer/retirer). */
async function adminPharmacyOwners(ctx: Ctx) {
  const userId = requireUser(ctx);
  await assertAdmin(userId);
  const rows = await prisma.pharmacies.findMany({
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      status: true,
      owner_user_id: true,
      claim_email: true,
      owner: { select: { email: true } },
    },
    orderBy: { name: "asc" },
    take: 200,
  });
  // N'expose pas l'UUID du gérant : juste son email (ou « en attente »).
  const pharmacies = rows.map(({ owner, owner_user_id, ...rest }) => ({
    ...rest,
    owner_email: owner_user_id ? (owner?.email ?? "(inconnu)") : null,
  }));
  return json({ pharmacies });
}

/** Attribue la gestion d'une pharmacie à un compte existant (ou la réserve
 *  pour un email sans compte). Règles d'exclusivité identiques au site. */
async function adminAssignPharmacyOwner(ctx: Ctx) {
  const userId = requireUser(ctx);
  await assertAdmin(userId);
  const data = await body(
    ctx,
    z.object({
      email: z.string().trim().toLowerCase().email("Email invalide").max(255),
    }),
  );
  const pharmacyId = ctx.params[0];

  const pharmacy = await prisma.pharmacies.findUnique({
    where: { id: pharmacyId },
    select: { id: true, name: true, owner_user_id: true },
  });
  if (!pharmacy) throw new ApiError(404, "Pharmacie introuvable");
  if (pharmacy.owner_user_id) {
    throw new ApiError(409, "Cette pharmacie a déjà un gérant. Retirez-le d'abord.");
  }

  const user = await prisma.users.findFirst({
    where: { email: { equals: data.email, mode: "insensitive" } },
    select: { id: true, email: true },
  });

  if (!user) {
    // Aucun compte : on réserve la pharmacie pour cet email.
    const reserved = await prisma.pharmacies.findFirst({
      where: {
        claim_email: { equals: data.email, mode: "insensitive" },
        id: { not: pharmacyId },
      },
      select: { id: true, name: true },
    });
    if (reserved) {
      throw new ApiError(409, `Cet email est déjà réservé pour « ${reserved.name} »`);
    }
    await prisma.pharmacies.update({
      where: { id: pharmacyId },
      data: { claim_email: data.email },
    });
    await prisma.audit_logs.create({
      data: {
        actor_user_id: userId,
        action: "pharmacy.owner_invited",
        entity: "pharmacy",
        entity_id: pharmacyId,
        meta: { email: data.email },
      },
    });
    return json({ status: "invited", email: data.email });
  }

  // Compte existant — exclusivité des rôles.
  const [ownsOther, staffOther, courier] = await Promise.all([
    prisma.pharmacies.findFirst({
      where: { owner_user_id: user.id },
      select: { id: true, name: true },
    }),
    prisma.pharmacy_staff.findFirst({ where: { user_id: user.id }, select: { id: true } }),
    prisma.couriers.findFirst({ where: { user_id: user.id }, select: { id: true } }),
  ]);
  const targetIsAdmin = await isAdmin(user.id);
  if (!targetIsAdmin) {
    if (ownsOther) throw new ApiError(409, `Ce compte gère déjà « ${ownsOther.name} »`);
    if (staffOther) throw new ApiError(409, "Ce compte est déjà rattaché à une autre pharmacie");
    if (courier) {
      throw new ApiError(
        409,
        "Ce compte est déjà livreur : un compte ne peut pas cumuler les deux rôles",
      );
    }
  }

  await prisma.pharmacies.update({
    where: { id: pharmacyId },
    data: { owner_user_id: user.id, claim_email: null },
  });
  // Comme sur le site, les insertions redondantes sont ignorées.
  await prisma.pharmacy_staff
    .create({ data: { pharmacy_id: pharmacyId, user_id: user.id } })
    .catch(() => undefined);
  await prisma.user_roles
    .upsert({
      where: { user_id_role: { user_id: user.id, role: "pharmacy_staff" } },
      create: { user_id: user.id, role: "pharmacy_staff" },
      update: {},
    })
    .catch(() => undefined);

  await prisma.audit_logs.create({
    data: {
      actor_user_id: userId,
      action: "pharmacy.owner_assigned",
      entity: "pharmacy",
      entity_id: pharmacyId,
      meta: { email: data.email, user_id: user.id },
    },
  });
  return json({ status: "assigned", email: data.email });
}

/** Retire le gérant d'une pharmacie (et le rôle associé s'il ne gère plus rien). */
async function adminRemovePharmacyOwner(ctx: Ctx) {
  const userId = requireUser(ctx);
  await assertAdmin(userId);
  const pharmacyId = ctx.params[0];

  const pharmacy = await prisma.pharmacies.findUnique({
    where: { id: pharmacyId },
    select: { id: true, owner_user_id: true },
  });
  if (!pharmacy) throw new ApiError(404, "Pharmacie introuvable");
  const ownerId = pharmacy.owner_user_id;

  await prisma.pharmacies.update({
    where: { id: pharmacyId },
    data: { owner_user_id: null, claim_email: null },
  });

  if (ownerId) {
    await prisma.pharmacy_staff.deleteMany({
      where: { pharmacy_id: pharmacyId, user_id: ownerId },
    });
    const stillStaff = await prisma.pharmacy_staff.findFirst({
      where: { user_id: ownerId },
      select: { id: true },
    });
    if (!stillStaff) {
      await prisma.user_roles.deleteMany({
        where: { user_id: ownerId, role: "pharmacy_staff" },
      });
    }
  }

  await prisma.audit_logs.create({
    data: {
      actor_user_id: userId,
      action: "pharmacy.owner_removed",
      entity: "pharmacy",
      entity_id: pharmacyId,
      meta: { previous_owner: ownerId },
    },
  });
  return json({ ok: true });
}

// ----------------------------------------------------------------------------
// Carte des pharmacies alentour (Google Places) — espace admin
// ----------------------------------------------------------------------------

type GooglePlaceHit = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  location?: { latitude?: number; longitude?: number };
};

/** Normalisation d'un nom de pharmacie (sans accents, minuscules). */
const normalizeName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Recherche circulaire de pharmacies : Google Places, repli Nominatim sans clé. */
async function placesNearby(
  lat: number,
  lng: number,
  radiusM: number,
  q?: string,
): Promise<GooglePlaceHit[]> {
  const key = (process.env.GOOGLE_MAPS_API_KEY ?? "").trim();
  const circle = {
    locationRestriction: {
      circle: { center: { latitude: lat, longitude: lng }, radius: radiusM },
    },
  };
  if (key) {
    try {
      const res = await fetch(
        q
          ? "https://places.googleapis.com/v1/places:searchText"
          : "https://places.googleapis.com/v1/places:searchNearby",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask":
              "places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.rating",
          },
          body: JSON.stringify(
            q
              ? {
                  textQuery: `pharmacie ${q}`,
                  includedType: "pharmacy",
                  maxResultCount: 20,
                  ...circle,
                }
              : { includedTypes: ["pharmacy"], maxResultCount: 20, ...circle },
          ),
        },
      );
      if (res.ok) {
        const payload = (await res.json()) as { places?: GooglePlaceHit[] };
        return payload.places ?? [];
      }
    } catch {
      // repli Nominatim ci-dessous
    }
  }
  // Repli sans clé : Nominatim (OpenStreetMap), borné par la zone cherchée.
  try {
    const dLat = radiusM / 111000;
    const dLng = radiusM / Math.max(1, 111000 * Math.cos((lat * Math.PI) / 180));
    const viewbox = `${lng - dLng},${lat + dLat},${lng + dLng},${lat - dLat}`;
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=20&viewbox=${viewbox}` +
      `&bounded=1&q=${encodeURIComponent(q ? `pharmacie ${q}` : "pharmacie")}`;
    const res = await fetch(url, { headers: { "User-Agent": "SahaSante/1.0 (admin)" } });
    if (!res.ok) return [];
    const hits = (await res.json()) as Array<{
      place_id: number;
      name?: string;
      display_name: string;
      lat: string;
      lon: string;
    }>;
    return hits.map((h) => ({
      id: `nominatim-${h.place_id}`,
      displayName: {
        text: h.name || h.display_name.split(",")[0]?.trim() || "Pharmacie",
      },
      formattedAddress: h.display_name,
      location: { latitude: Number(h.lat), longitude: Number(h.lon) },
    }));
  } catch {
    return [];
  }
}

/** Pharmacies partenaires autour d'une position (triées par distance). */
async function adminPharmaciesNearby(ctx: Ctx) {
  const userId = requireUser(ctx);
  await assertAdmin(userId);
  const lat = num(ctx.url.searchParams.get("lat"));
  const lng = num(ctx.url.searchParams.get("lng"));
  const radiusKm = num(ctx.url.searchParams.get("radius")) ?? 5;
  if (lat === null || lng === null) throw new ApiError(400, "Position (lat/lng) requise");

  const rows = await prisma.pharmacies.findMany({
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      phone: true,
      lat: true,
      lng: true,
      status: true,
      rating: true,
      created_at: true,
    },
    orderBy: { created_at: "desc" },
    take: 500,
  });

  const located = rows.filter((p) => p.lat !== null && p.lng !== null);
  const without = rows.filter((p) => p.lat === null || p.lng === null);
  const pharmacies = located
    .map((p) => ({
      ...p,
      distance_km: Math.round(haversineKm(lat, lng, p.lat!, p.lng!) * 100) / 100,
    }))
    .filter((p) => p.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km);

  return json(
    toPlain({
      pharmacies,
      without_location: without.map((p) => ({ id: p.id, name: p.name })),
      center: { lat, lng },
      radius_km: radiusKm,
    }),
  );
}

/** Toutes les pharmacies autour d'une position (Google Places + repérage des partenaires). */
async function adminPharmaciesPlaces(ctx: Ctx) {
  const userId = requireUser(ctx);
  await assertAdmin(userId);
  const data = await body(
    ctx,
    z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radius_m: z.number().min(200).max(20000).default(5000),
      q: z.string().trim().max(120).optional(),
    }),
  );

  const hits = await placesNearby(data.lat, data.lng, data.radius_m, data.q);
  const known = await prisma.pharmacies.findMany({
    select: { id: true, name: true, google_place_id: true, status: true, lat: true, lng: true },
  });
  const byPlace = new Map<string, (typeof known)[number]>();
  for (const p of known) {
    if (p.google_place_id) byPlace.set(p.google_place_id, p);
  }

  const places = hits
    .map((h) => {
      const hLat = h.location?.latitude ?? null;
      const hLng = h.location?.longitude ?? null;
      let match = h.id ? byPlace.get(h.id) : undefined;
      if (!match && hLat !== null && hLng !== null) {
        match = known.find(
          (p) => p.lat !== null && p.lng !== null && haversineKm(hLat, hLng, p.lat!, p.lng!) < 0.08,
        );
      }
      const hName = normalizeName(h.displayName?.text ?? "");
      if (!match && hName) match = known.find((p) => normalizeName(p.name) === hName);
      return {
        place_id: h.id ?? null,
        name: h.displayName?.text ?? "Pharmacie",
        address: h.formattedAddress ?? "",
        phone: h.nationalPhoneNumber ?? null,
        rating: h.rating ?? null,
        lat: hLat,
        lng: hLng,
        distance_km:
          hLat !== null && hLng !== null
            ? Math.round(haversineKm(data.lat, data.lng, hLat, hLng) * 100) / 100
            : null,
        local_pharmacy_id: match?.id ?? null,
        status: match?.status ?? null,
      };
    })
    .filter((p) => p.distance_km === null || p.distance_km <= data.radius_m / 1000 + 0.5)
    .sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));

  return json(
    toPlain({
      places,
      center: { lat: data.lat, lng: data.lng },
      radius_km: Math.round(data.radius_m / 100) / 10,
    }),
  );
}

/** Mot de passe temporaire remis à l'admin pour la pharmacie. */
function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `Saha-${out}`;
}

type PharmacyAccount = { email: string; password: string | null; created: boolean };

/**
 * Crée au besoin un compte de connexion pour une pharmacie sans propriétaire,
 * rattache le compte (owner + pharmacy_staff + rôle) et renvoie les
 * identifiants à transmettre. `null` si la pharmacie a déjà un compte.
 * `password: null` = compte existant rattaché (le titulaire garde son mot de passe).
 */
async function ensurePharmacyAccount(pharmacyId: string): Promise<PharmacyAccount | null> {
  const ph = await prisma.pharmacies.findUnique({
    where: { id: pharmacyId },
    select: { id: true, name: true, owner_user_id: true, claim_email: true },
  });
  if (!ph || ph.owner_user_id) return null;

  const slug =
    (ph.name || "pharmacie")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "pharmacie";
  const generatedEmail = normalizeEmail(`${slug}-${ph.id.slice(0, 8)}@pharmacies.saha`);
  const claimedEmail = normalizeEmail(ph.claim_email?.trim() || "");
  let email = claimedEmail || generatedEmail;

  const attach = async (uid: string) => {
    await prisma.pharmacies.update({
      where: { id: ph.id },
      data: { owner_user_id: uid, claim_email: null },
    });
    await prisma.pharmacy_staff.upsert({
      where: { user_id: uid },
      create: { pharmacy_id: ph.id, user_id: uid },
      update: {},
    });
    await addRole(uid, "pharmacy_staff");
  };

  const existing = await basePrisma.users.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    try {
      await attach(existing.id);
      return { email, password: null, created: false };
    } catch {
      // Ce compte possède déjà une pharmacie : on en crée un dédié ci-dessous.
      email = generatedEmail;
    }
  }

  const password = generateTempPassword();
  let userId: string;
  try {
    userId = await createAccount({ email, password, fullName: ph.name });
  } catch {
    // Collision d'adresse (extrêmement rare) → suffixe aléatoire.
    email = normalizeEmail(`${slug}-${Math.random().toString(36).slice(2, 6)}@pharmacies.saha`);
    userId = await createAccount({ email, password, fullName: ph.name });
  }
  await attach(userId);
  return { email, password, created: true };
}

/** Ajoute une pharmacie repérée sur la carte comme partenaire (emplacement requis). */
async function adminCreatePharmacy(ctx: Ctx) {
  const userId = requireUser(ctx);
  await assertAdmin(userId);
  const data = await body(
    ctx,
    z.object({
      name: z.string().trim().min(2).max(200),
      address: z.string().trim().min(1).max(300),
      city: z.string().trim().max(120).optional(),
      phone: z.string().trim().max(50).nullable().optional(),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      place_id: z.string().trim().max(120).optional(),
      rating: z.number().min(0).max(5).nullable().optional(),
    }),
  );

  const existing = await prisma.pharmacies.findFirst({
    where: {
      OR: [
        ...(data.place_id ? [{ google_place_id: data.place_id }] : []),
        { name: data.name, address: data.address },
      ],
    },
    select: { id: true },
  });
  if (existing) return json(toPlain({ id: existing.id, created: false }));

  let inserted: { id: string };
  try {
    inserted = await prisma.pharmacies.create({
      data: {
        owner_user_id: null,
        name: data.name,
        address: data.address,
        city: data.city || null,
        phone: data.phone || null,
        lat: data.lat,
        lng: data.lng,
        license_number: data.place_id
          ? `GMAPS-${data.place_id.slice(0, 20)}`
          : `MAP-${Date.now().toString(36).toUpperCase()}`,
        google_place_id: data.place_id || null,
        rating: data.rating ?? 0,
        status: "approved",
      },
      select: { id: true },
    });
  } catch (err) {
    // google_place_id est unique : une course rare → on renvoie l'existant.
    const dup =
      data.place_id != null
        ? await prisma.pharmacies.findUnique({
            where: { google_place_id: data.place_id },
            select: { id: true },
          })
        : null;
    if (dup) return json(toPlain({ id: dup.id, created: false }));
    throw new ApiError(400, err instanceof Error ? err.message : "Enregistrement impossible");
  }

  await prisma.audit_logs.create({
    data: {
      actor_user_id: userId,
      action: "pharmacy_partner_added",
      entity: "pharmacy",
      entity_id: inserted.id,
      meta: { source: data.place_id ? "google_places" : "map", lat: data.lat, lng: data.lng },
    },
  });

  // L'admin a ajouté la pharmacie : on lui crée de suite son compte de
  // connexion à transmettre à l'équipe de la pharmacie.
  const account = await ensurePharmacyAccount(inserted.id);
  return json(toPlain({ id: inserted.id, created: true, account }));
}

/** Approbation / rejet d'une pharmacie. */
async function adminPharmacyDecision(ctx: Ctx) {
  const userId = requireUser(ctx);
  await assertAdmin(userId);
  const id = ctx.params[0];
  const data = await body(ctx, z.object({ decision: z.enum(["approved", "rejected"]) }));

  const ph = await prisma.pharmacies.findUnique({
    where: { id },
    select: { id: true, owner_user_id: true },
  });
  if (!ph) throw new NotFoundError("Pharmacie introuvable");
  await prisma.pharmacies.update({ where: { id }, data: { status: data.decision } });
  let account: PharmacyAccount | null = null;
  if (data.decision === "approved") {
    if (ph.owner_user_id) {
      await addRole(ph.owner_user_id, "pharmacy_staff");
    } else {
      // Pas de compte encore : l'approbation en crée un pour que la
      // pharmacie puisse se connecter à son espace.
      account = await ensurePharmacyAccount(id);
    }
  }
  await prisma.audit_logs.create({
    data: {
      actor_user_id: userId,
      action: `pharmacy_${data.decision}`,
      entity: "pharmacy",
      entity_id: id,
    },
  });
  return json(toPlain({ ok: true, account }));
}

/** Approbation / rejet d'un livreur. */
async function adminCourierDecision(ctx: Ctx) {
  const userId = requireUser(ctx);
  await assertAdmin(userId);
  const id = ctx.params[0];
  const data = await body(ctx, z.object({ decision: z.enum(["approved", "rejected"]) }));

  const c = await prisma.couriers.findUnique({
    where: { id },
    select: { id: true, user_id: true },
  });
  if (!c) throw new NotFoundError("Livreur introuvable");
  await prisma.couriers.update({ where: { id }, data: { status: data.decision } });
  if (data.decision === "approved" && c.user_id) {
    await addRole(c.user_id, "courier");
  }
  await prisma.audit_logs.create({
    data: {
      actor_user_id: userId,
      action: `courier_${data.decision}`,
      entity: "courier",
      entity_id: id,
    },
  });
  return json({ ok: true });
}

// ============================================================================
// Table de routage
// ============================================================================

type Handler = (ctx: Ctx) => Promise<Response>;

/** `:id` capture un segment (transmis dans ctx.params). */
const ROUTES: Array<[string, string, Handler]> = [
  ["POST", "auth/register", register],
  ["POST", "auth/login", login],
  ["POST", "auth/google", loginGoogle],
  ["GET", "auth/google/client-config", googleClientConfig],
  ["POST", "auth/otp/send", requestPhoneOtp],
  ["POST", "auth/otp/verify", verifyPhoneOtp],
  [
    "POST",
    "auth/logout",
    async (ctx) => {
      const token = bearerFromRequest(ctx.request);
      if (token) await revokeSessionToken(token);
      return json({ ok: true });
    },
  ],
  ["GET", "me", me],
  ["PUT", "me", updateProfile],

  ["GET", "prescriptions", listPrescriptions],
  ["POST", "prescriptions", uploadPrescription],
  ["GET", "prescriptions/:id", getPrescription],

  ["GET", "reservations", listReservations],
  ["POST", "reservations/route", routePrescription],
  ["GET", "reservations/:id", getReservation],
  ["POST", "reservations/:id/fulfillment", setFulfillment],
  ["POST", "reservations/:id/pay", declarePayment],
  ["POST", "reservations/:id/cancel", cancelReservation],

  ["GET", "pharmacies", listPharmacies],
  ["GET", "practitioners", listPractitioners],
  ["GET", "neighborhoods", listNeighborhoods],

  ["POST", "health/triage", triage],
  ["GET", "appointments", listAppointments],
  ["POST", "appointments", createAppointment],
  ["POST", "appointments/:id/cancel", cancelAppointment],

  ["GET", "otc/suggestions", otcSuggestions],
  ["POST", "otc/order", otcOrder],

  ["GET", "notifications", listNotifications],
  ["POST", "notifications/read", markNotificationsRead],
  ["POST", "devices", registerDevice],

  // Espace pharmacie
  ["GET", "pharmacy/me", pharmacyMe],
  ["GET", "pharmacy/orders", pharmacyOrders],
  ["POST", "pharmacy/orders/:id", pharmacyOrderDecision],
  ["POST", "pharmacy/orders/:id/assign", pharmacyAssignCourier],
  ["GET", "pharmacy/inventory", pharmacyInventory],
  ["POST", "pharmacy/inventory", pharmacyInventoryUpsert],
  ["PUT", "pharmacy/inventory/:id", pharmacyInventoryUpdate],
  ["DELETE", "pharmacy/inventory/:id", pharmacyInventoryDelete],

  // Espace livreur
  ["GET", "courier/me", courierMe],
  ["POST", "courier/deliveries/:id/status", courierDeliveryStatus],
  ["POST", "courier/online", courierOnline],
  ["POST", "courier/position", courierPosition],

  // Espace praticien
  ["GET", "practitioner/dashboard", practitionerDashboard],
  ["POST", "practitioner/appointments/:id", practitionerRespond],

  // Administration
  ["GET", "admin/overview", adminOverview],
  ["GET", "admin/users", adminUsers],
  ["GET", "admin/couriers", adminCouriers],
  ["GET", "admin/pharmacies/owners", adminPharmacyOwners],
  ["POST", "admin/pharmacies/:id/owner", adminAssignPharmacyOwner],
  ["POST", "admin/pharmacies/:id/owner/remove", adminRemovePharmacyOwner],
  ["GET", "admin/pharmacies/nearby", adminPharmaciesNearby],
  ["POST", "admin/pharmacies/places", adminPharmaciesPlaces],
  ["POST", "admin/pharmacies", adminCreatePharmacy],
  ["POST", "admin/pharmacies/:id", adminPharmacyDecision],
  ["POST", "admin/couriers/:id", adminCourierDecision],
];

function match(method: string, segments: string[]) {
  for (const [m, pattern, handler] of ROUTES) {
    if (m !== method) continue;
    const parts = pattern.split("/");
    if (parts.length !== segments.length) continue;
    const params: string[] = [];
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === ":id") {
        params.push(segments[i]);
      } else if (parts[i] !== segments[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { handler, params };
  }
  return null;
}

/** Point d'entrée unique de l'API mobile. */
export async function handleApiV1(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname
    .replace(/^\/api\/v1\/?/, "")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean);
  const found = match(request.method, segments);
  if (!found) return json({ error: "Route inconnue" }, 404);

  try {
    const userId = await verifySessionToken(bearerFromRequest(request));
    return await found.handler({ request, url, userId, params: found.params });
  } catch (err) {
    if (err instanceof ApiError) return json({ error: err.message }, err.status);
    if (err instanceof NotFoundError) return json({ error: err.message }, 404);
    if (err instanceof ForbiddenError) return json({ error: err.message }, 403);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    // Les erreurs métier sont des messages destinés à l'utilisateur.
    const status = /introuvable/i.test(message)
      ? 404
      : /autoris|refus|ne peut/i.test(message)
        ? 403
        : 400;
    if (status === 400) console.error("[api/v1]", err);
    return json({ error: message }, status);
  }
}
