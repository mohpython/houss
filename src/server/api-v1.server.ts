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
import { basePrisma } from "./prisma-base.server";
import { toPlain } from "./serialize";
import {
  bearerFromRequest,
  createAccount,
  createSession,
  getRoles,
  hashPassword,
  normalizeEmail,
  requestMeta,
  revokeSessionToken,
  toAuthUser,
  verifyPassword,
  verifySessionToken,
} from "./auth.server";
import {
  ForbiddenError,
  NotFoundError,
  canReadPrescription,
  reservationAccess,
} from "./authz.server";
import { createAbsoluteSignedUrl, extFromMime, saveObject } from "./storage.server";
import { haversineKm } from "@/lib/routing-core.server";
import { rateLimit } from "./rate-limit.server";

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

  const existing = await basePrisma.users.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (existing) throw new ApiError(409, "Un compte existe déjà avec cet email. Connectez-vous.");

  const userId = await createAccount({
    email: data.email,
    password: data.password,
    fullName: data.full_name,
    emailVerified: true,
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
  const mime = file.type || "image/jpeg";
  if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(mime)) {
    throw new ApiError(415, "Format non accepté (photo ou PDF uniquement)");
  }
  if (file.size > 15 * 1024 * 1024) throw new ApiError(413, "Fichier trop volumineux (15 Mo max)");

  const { randomUUID } = await import("node:crypto");
  const path = `${userId}/${randomUUID()}.${extFromMime(mime, file.name)}`;
  await saveObject("prescriptions", path, new Uint8Array(await file.arrayBuffer()));

  const rx = await prisma.prescriptions.create({
    data: {
      patient_id: userId,
      file_path: path,
      file_mime: mime,
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
  if (existing && existing.user_id !== userId) {
    throw new ApiError(403, "Ce jeton d'appareil appartient à un autre compte.");
  }
  await prisma.device_tokens.upsert({
    where: { token: data.token },
    create: {
      user_id: userId,
      token: data.token,
      platform: data.platform,
      language: data.language,
    },
    update: { platform: data.platform, language: data.language },
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
  return json({ triage: result, practitioners: toPlain(practitioners) });
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
// Table de routage
// ============================================================================

type Handler = (ctx: Ctx) => Promise<Response>;

/** `:id` capture un segment (transmis dans ctx.params). */
const ROUTES: Array<[string, string, Handler]> = [
  ["POST", "auth/register", register],
  ["POST", "auth/login", login],
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
