/**
 * Logique métier auparavant implémentée en triggers / fonctions PostgreSQL
 * (Supabase). Elle est branchée automatiquement sur le client Prisma par
 * `db.server.ts`, pour que toute écriture — quel que soit le code appelant —
 * produise les mêmes effets qu'avant :
 *
 *  - handle_new_user                  → auth.server.ts (création de compte)
 *  - set_reservation_codes            → reservationCreateDefaults()
 *  - reservations_notify              → reservationNotify()
 *  - appointments_notify              → appointmentNotify()
 *  - set_prescription_expiry          → prescriptionExpiry()
 *  - guard_*_exclusivity              → guard*()
 *  - dispatch_push_notification       → afterNotificationInserted()
 *  - send_appointment_reminders (cron)→ sendAppointmentReminders()
 *  - supabase_realtime                → publish*() (voir realtime.server.ts)
 *
 * IMPORTANT : ce module n'utilise que `basePrisma` (sans hooks) pour éviter
 * toute récursion.
 */
import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { pushCopy } from "@/lib/push-messages";
import { basePrisma } from "./prisma-base.server";
import { publish } from "./realtime.server";
import { dispatchPush } from "./push-dispatch.server";
import { toPlain } from "./serialize";

type Row = Record<string, unknown>;

// ============================================================================
// Helpers
// ============================================================================

function logError(scope: string, err: unknown) {
  console.error(`[lifecycle:${scope}]`, err instanceof Error ? err.message : err);
}

/** Exécute une tâche de fond sans bloquer ni faire échouer la requête. */
export function background(scope: string, fn: () => Promise<unknown>) {
  void fn().catch((err) => logError(scope, err));
}

function pick(row: Row, keys: string[]): Row {
  const out: Row = {};
  for (const k of keys) if (k in row) out[k] = row[k];
  return toPlain(out) as Row;
}

function sixDigits(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function changed(before: Row | null, after: Row, key: string): boolean {
  if (!before) return false;
  const a = before[key];
  const b = after[key];
  if (a instanceof Date && b instanceof Date) return a.getTime() !== b.getTime();
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : a == null ? null : new Date(String(a)).getTime();
    const tb = b instanceof Date ? b.getTime() : b == null ? null : new Date(String(b)).getTime();
    return ta !== tb;
  }
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

async function isAdmin(userId: string): Promise<boolean> {
  const r = await basePrisma.user_roles.findFirst({
    where: { user_id: userId, role: "admin" },
    select: { id: true },
  });
  return !!r;
}

async function adminUserIds(): Promise<string[]> {
  const rows = await basePrisma.user_roles.findMany({
    where: { role: "admin" },
    select: { user_id: true },
  });
  return rows.map((r) => r.user_id);
}

async function pharmacyMemberIds(pharmacyId: string): Promise<string[]> {
  const ph = await basePrisma.pharmacies.findUnique({
    where: { id: pharmacyId },
    select: { owner_user_id: true, pharmacy_staff: { select: { user_id: true } } },
  });
  if (!ph) return [];
  const ids = new Set<string>();
  if (ph.owner_user_id) ids.add(ph.owner_user_id);
  for (const s of ph.pharmacy_staff) ids.add(s.user_id);
  return [...ids];
}

async function courierUserId(courierId: string | null | undefined): Promise<string | null> {
  if (!courierId) return null;
  const c = await basePrisma.couriers.findUnique({
    where: { id: courierId },
    select: { user_id: true },
  });
  return c?.user_id ?? null;
}

/** « 05/09/2026 à 14h05 » — heure de Bamako (UTC+0, sans heure d'été). */
export function formatBamako(d: Date | string | null | undefined, withYear = true): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  const day = `${p(date.getUTCDate())}/${p(date.getUTCMonth() + 1)}`;
  const year = withYear ? `/${date.getUTCFullYear()}` : "";
  return `${day}${year} à ${p(date.getUTCHours())}h${p(date.getUTCMinutes())}`;
}

// ============================================================================
// Notifications (private.notify + dispatch push + realtime)
// ============================================================================

export function afterNotificationInserted(row: {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  read_at: Date | null;
  created_at: Date;
}) {
  publish({
    table: "notifications",
    type: "INSERT",
    row: toPlain(row) as Row,
    users: [row.user_id],
  });
  background("push", () => dispatchPush(row));
}

export async function notify(
  userId: string | null | undefined,
  type: string,
  data: Record<string, unknown> = {},
  title = "",
  body = "",
) {
  if (!userId) return;
  // Beaucoup d'appels (`new_reservation`, `delivered`, `courier_assigned`…)
  // passent par le cycle de vie des commandes sans texte : la ligne était alors
  // enregistrée avec un titre ET un corps vides, donc une bulle sans écriture
  // dans l'application (le web se rattrapait avec ses propres libellés, pas le
  // mobile). On complète donc champ par champ avec le texte générique du type,
  // sans jamais écraser ce que l'appelant a fourni.
  const copy = pushCopy(type, "fr", { title: "", body: "" });
  const row = await basePrisma.notifications.create({
    data: {
      user_id: userId,
      type,
      title: title.trim() || copy.title,
      body: body.trim() || copy.body,
      data: data as Prisma.InputJsonValue,
    },
  });
  afterNotificationInserted(row);
}

// ============================================================================
// Garde-fous d'exclusivité des rôles professionnels
// ============================================================================

export async function guardCourier(userId: string | null | undefined) {
  if (!userId || (await isAdmin(userId))) return;
  const [owns, staff] = await Promise.all([
    basePrisma.pharmacies.findFirst({ where: { owner_user_id: userId }, select: { id: true } }),
    basePrisma.pharmacy_staff.findFirst({ where: { user_id: userId }, select: { id: true } }),
  ]);
  if (owns || staff) {
    throw new Error("Ce compte gère déjà une pharmacie et ne peut pas devenir livreur.");
  }
}

export async function guardPharmacyMember(userId: string | null | undefined) {
  if (!userId || (await isAdmin(userId))) return;
  const courier = await basePrisma.couriers.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  if (courier) {
    throw new Error("Ce compte est déjà livreur et ne peut pas gérer une pharmacie.");
  }
}

export async function guardPractitioner(userId: string | null | undefined) {
  if (!userId || (await isAdmin(userId))) return;
  const [courier, owns, staff] = await Promise.all([
    basePrisma.couriers.findUnique({ where: { user_id: userId }, select: { id: true } }),
    basePrisma.pharmacies.findFirst({ where: { owner_user_id: userId }, select: { id: true } }),
    basePrisma.pharmacy_staff.findFirst({ where: { user_id: userId }, select: { id: true } }),
  ]);
  if (courier || owns || staff) {
    throw new Error("Ce compte a déjà un autre rôle professionnel.");
  }
}

// ============================================================================
// Ordonnances : péremption (> 90 jours)
// ============================================================================

export function prescriptionExpiry(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  const d = date instanceof Date ? date : new Date(String(date));
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const limit =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 90 * 86400_000;
  return d.getTime() < limit;
}

// ============================================================================
// Commandes (reservations)
// ============================================================================

/** set_reservation_codes : codes à 6 chiffres + nom/téléphone du patient. */
export async function reservationCreateDefaults<T extends Row>(data: T): Promise<T> {
  const out: Row = { ...data };
  if (out.pickup_code == null) out.pickup_code = sixDigits();
  if (out.receipt_code == null) out.receipt_code = sixDigits();
  const patientId =
    (out.patient_id as string | undefined) ??
    ((out.patient as { connect?: { id?: string } } | undefined)?.connect?.id as string | undefined);
  if (patientId && (out.patient_name == null || out.patient_phone == null)) {
    const p = await basePrisma.profiles.findUnique({
      where: { id: patientId },
      select: { full_name: true, phone: true },
    });
    if (p) {
      if (out.patient_name == null) out.patient_name = p.full_name;
      if (out.patient_phone == null) out.patient_phone = p.phone;
    }
  }
  return out as T;
}

const RESERVATION_RT_FIELDS = [
  "id",
  "patient_id",
  "pharmacy_id",
  "courier_id",
  "status",
  "delivery_status",
  "payment_status",
  "fulfillment_method",
  "updated_at",
];

async function reservationAudience(r: Row, before: Row | null): Promise<string[]> {
  const users = new Set<string>();
  users.add(String(r.patient_id));
  for (const id of await pharmacyMemberIds(String(r.pharmacy_id))) users.add(id);
  const cu = await courierUserId(r.courier_id as string | null);
  if (cu) users.add(cu);
  if (before && before.courier_id && before.courier_id !== r.courier_id) {
    const prev = await courierUserId(before.courier_id as string);
    if (prev) users.add(prev);
  }
  return [...users];
}

/** Champs qui definissent l'endroit de la livraison. */
const DELIVERY_PLACE_FIELDS = [
  "fulfillment_method",
  "delivery_mode",
  "neighborhood_id",
  "patient_address",
  "patient_lat",
  "patient_lng",
];

/** Port fid��le de private.reservations_notify (version avec paiement). */
async function reservationNotify(before: Row | null, r: Row) {
  const payload = { reservation_id: r.id, pharmacy_id: r.pharmacy_id };
  const patientId = r.patient_id as string;
  const pharmacyIds = await pharmacyMemberIds(String(r.pharmacy_id));

  /**
   * Previens la pharmacie d'un evenement de commande. `for: "pharmacy"`
   * indique a pushLink que la destination est l'ecran pharmacie et non celui
   * du patient.
   */
  const notifyPharmacyType = async (type: string) => {
    for (const uid of pharmacyIds) {
      await notify(uid, type, { ...payload, for: "pharmacy" });
    }
  };

  if (!before) {
    if (r.payment_status === "unpaid") return;
    await notifyPharmacyType("new_reservation");
    await notify(patientId, "reservation_created", payload);
    return;
  }

  if (before.payment_status === "unpaid" && r.payment_status !== "unpaid") {
    // La pharmacie n'a pas ete prevenue a la creation (commande non payee) :
    // c'est le paiement qui lui fait decouvrir la commande.
    await notifyPharmacyType("pharmacy_payment_received");
    await notify(patientId, "reservation_created", payload);
  }
  if (r.payment_status === "unpaid") return;

  if (changed(before, r, "status")) {
    if (r.status === "accepted") await notify(patientId, "reservation_accepted", payload);
    else if (r.status === "rejected") await notify(patientId, "reservation_rejected", payload);
    else if (r.status === "ready") await notify(patientId, "reservation_ready", payload);
  }

  if (changed(before, r, "courier_id") && r.courier_id) {
    await notify(patientId, "courier_assigned", payload);
    await notify(await courierUserId(r.courier_id as string), "new_delivery", payload);
    await notifyPharmacyType("pharmacy_courier_assigned");
  }

  if (changed(before, r, "delivery_status")) {
    if (r.delivery_status === "picked_up") {
      await notify(patientId, "courier_picked_up", payload);
      await notifyPharmacyType("pharmacy_order_picked_up");
    } else if (r.delivery_status === "delivered") {
      await notify(patientId, "delivered", payload);
      await notifyPharmacyType("pharmacy_order_delivered");
    }
  }

  // Un endroit de livraison change apres coup : sans cela la pharmacie continue
  // de preparer et le livreur continue de livrer au mauvais endroit. On previent
  // les deux, chacun sur son ecran.
  if (DELIVERY_PLACE_FIELDS.some((f) => changed(before, r, f))) {
    await notifyPharmacyType("delivery_place_updated");
    const courierId = await courierUserId(r.courier_id as string | null);
    if (courierId) {
      await notify(courierId, "delivery_place_updated", { ...payload, for: "courier" });
    }
  }
}

export async function afterReservationWrite(before: Row | null, after: Row | null) {
  if (!after) return;
  const users = await reservationAudience(after, before);
  publish({
    table: "reservations",
    type: before ? "UPDATE" : "INSERT",
    row: pick(after, RESERVATION_RT_FIELDS),
    users,
    admins: true,
  });
  await reservationNotify(before, after);
}

// ============================================================================
// Rendez-vous (appointments)
// ============================================================================

const APPOINTMENT_RT_FIELDS = [
  "id",
  "patient_id",
  "practitioner_id",
  "status",
  "scheduled_at",
  "proposed_at",
  "updated_at",
];

async function appointmentContext(a: Row) {
  const prac = await basePrisma.practitioners.findUnique({
    where: { id: a.practitioner_id as string },
    select: { user_id: true, full_name: true, type: true },
  });
  const profile = await basePrisma.profiles.findUnique({
    where: { id: a.patient_id as string },
    select: { full_name: true },
  });
  const pracName = prac?.full_name ?? null;
  const displayName = prac?.type === "doctor" ? `Dr ${pracName ?? ""}` : (pracName ?? "Praticien");
  const whenTxt = formatBamako((a.scheduled_at as Date | null) ?? (a.proposed_at as Date | null));
  const patientName = profile?.full_name?.trim() ? profile.full_name : "Un patient";
  return { pracUser: prac?.user_id ?? null, displayName, whenTxt, patientName };
}

async function insertNotification(
  userId: string | null,
  type: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
) {
  await notify(userId, type, data, title, body);
}

/** Port fidèle de private.appointments_notify (dernière version). */
async function appointmentNotify(before: Row | null, a: Row) {
  const { pracUser, displayName, whenTxt, patientName } = await appointmentContext(a);
  const id = a.id as string;
  const prescribed = Array.isArray(a.prescribed_items) ? (a.prescribed_items as unknown[]) : [];

  if (!before) {
    if (pracUser) {
      await insertNotification(
        pracUser,
        "appointment_requested",
        "Nouvelle demande de rendez-vous",
        `${patientName} — ${(a.reason as string) || "Consultation"}${a.at_home ? " (à domicile)" : ""}`,
        { appointment_id: id, for: "practitioner" },
      );
    }
    return;
  }

  // Rappel manuel envoyé par le praticien
  if (changed(before, a, "last_reminder_at") && a.last_reminder_at) {
    const body =
      a.status === "completed"
        ? `${displayName} vous demande de confirmer la fin de votre consultation dans l'application.`
        : a.status === "rescheduled"
          ? `${displayName} attend votre réponse pour la date proposée${whenTxt ? ` (${whenTxt})` : ""}.`
          : `${displayName} vous rappelle votre rendez-vous${whenTxt ? ` du ${whenTxt}` : ""}.`;
    await insertNotification(
      a.patient_id as string,
      "appointment_reminder",
      `Rappel de ${displayName}`,
      body,
      {
        appointment_id: id,
        for: "patient",
        reminder: "manual",
      },
    );
  }

  // Présence confirmée par le patient (historique)
  if (changed(before, a, "patient_ack_at") && a.patient_ack_at && pracUser) {
    await insertNotification(
      pracUser,
      "appointment_patient_confirmed",
      "Présence confirmée",
      `${patientName} a confirmé sa présence${whenTxt ? ` pour le ${whenTxt}` : ""}.`,
      { appointment_id: id, for: "practitioner", ack: true },
    );
  }

  // Le patient confirme que la consultation a eu lieu
  if (changed(before, a, "patient_completed_at") && a.patient_completed_at && pracUser) {
    await insertNotification(
      pracUser,
      "appointment_patient_confirmed",
      "Consultation confirmée par le patient",
      `${patientName} a confirmé que la consultation a bien eu lieu.`,
      { appointment_id: id, for: "practitioner", completed: true },
    );
  }

  if (changed(before, a, "status")) {
    const who = patientName;
    if (a.status === "cancelled") {
      if (pracUser) {
        await insertNotification(
          pracUser,
          "appointment_cancelled",
          "Rendez-vous annulé",
          `${who} a annulé sa demande${whenTxt ? ` du ${whenTxt}` : ""}.`,
          { appointment_id: id, status: "cancelled", for: "practitioner" },
        );
      }
      return;
    }

    const status = String(a.status);
    const title =
      status === "accepted"
        ? "Rendez-vous confirmé"
        : status === "rescheduled"
          ? "Nouvelle date proposée"
          : status === "rejected"
            ? "Demande refusée"
            : status === "completed"
              ? "Consultation terminée"
              : "Rendez-vous mis à jour";
    const body =
      status === "accepted"
        ? `${displayName} a accepté votre rendez-vous${whenTxt ? ` prévu le ${whenTxt}` : ""}${a.at_home ? " (à domicile)" : ""}.`
        : status === "rescheduled"
          ? `${displayName} vous propose le ${whenTxt}. Confirmez dans l'application.`
          : status === "rejected"
            ? `${displayName} ne peut pas prendre ce rendez-vous${a.rejection_reason ? ` : ${a.rejection_reason}` : "."}`
            : status === "completed"
              ? `${displayName} a terminé votre consultation.${prescribed.length > 0 ? " Une ordonnance est disponible." : ""} Merci de confirmer dans l'application.`
              : `${displayName} : ${status}`;
    await insertNotification(a.patient_id as string, `appointment_${status}`, title, body, {
      appointment_id: id,
      status,
      for: "patient",
      has_prescription: prescribed.length > 0,
    });

    if (status === "accepted" && before.status === "rescheduled" && pracUser) {
      await insertNotification(
        pracUser,
        "appointment_patient_confirmed",
        "Date confirmée par le patient",
        `${who} a confirmé le rendez-vous du ${whenTxt}.`,
        { appointment_id: id, for: "practitioner" },
      );
    }
  }
}

export async function afterAppointmentWrite(before: Row | null, after: Row | null) {
  if (!after) return;
  const prac = await basePrisma.practitioners.findUnique({
    where: { id: after.practitioner_id as string },
    select: { user_id: true },
  });
  const users = [after.patient_id as string];
  if (prac?.user_id) users.push(prac.user_id);
  publish({
    table: "appointments",
    type: before ? "UPDATE" : "INSERT",
    row: pick(after, APPOINTMENT_RT_FIELDS),
    users,
    admins: true,
  });
  await appointmentNotify(before, after);
}

/**
 * Port de private.send_appointment_reminders (exécuté toutes les heures par
 * le planificateur intégré, voir scheduler.server.ts).
 */
export async function sendAppointmentReminders() {
  const now = new Date();

  // Rendez-vous à venir : veille (≈24 h) et imminent (≈1 h)
  const upcoming = await basePrisma.appointments.findMany({
    where: {
      status: "accepted",
      scheduled_at: { gt: now, lt: new Date(now.getTime() + 25 * 3600_000) },
    },
  });
  for (const a of upcoming) {
    const hoursLeft = (a.scheduled_at!.getTime() - now.getTime()) / 3600_000;
    const key = hoursLeft <= 2 ? "soon" : hoursLeft >= 20 ? "day_before" : null;
    const sent = (a.reminders_sent ?? {}) as Record<string, unknown>;
    if (!key || key in sent) continue;

    const { pracUser, displayName, patientName } = await appointmentContext(a as unknown as Row);
    const whenTxt = formatBamako(a.scheduled_at, false);

    await insertNotification(
      a.patient_id,
      "appointment_reminder",
      key === "soon" ? "Rendez-vous dans environ 1 h" : "Rappel : rendez-vous demain",
      `Avec ${displayName} le ${whenTxt}${a.at_home ? " (à domicile)" : ""}.`,
      { appointment_id: a.id, for: "patient", reminder: key },
    );
    if (pracUser) {
      await insertNotification(
        pracUser,
        "appointment_reminder",
        key === "soon" ? "Patient dans environ 1 h" : "Rappel : consultation demain",
        `${patientName} — ${a.reason || "Consultation"} le ${whenTxt}${a.at_home ? " (visite à domicile)" : ""}.`,
        { appointment_id: a.id, for: "practitioner", reminder: key },
      );
    }
    await basePrisma.appointments.update({
      where: { id: a.id },
      data: { reminders_sent: { ...sent, [key]: now.toISOString() } as Prisma.InputJsonValue },
    });
  }

  // Demandes en attente : relance du praticien toutes les 2 h, alerte admin après 24 h
  const pending = await basePrisma.appointments.findMany({
    where: { status: "requested", requested_at: { lt: new Date(now.getTime() - 2 * 3600_000) } },
  });
  for (const a of pending) {
    const prac = await basePrisma.practitioners.findUnique({
      where: { id: a.practitioner_id },
      select: { user_id: true, full_name: true },
    });
    const profile = await basePrisma.profiles.findUnique({
      where: { id: a.patient_id },
      select: { full_name: true },
    });
    const patientName = profile?.full_name?.trim() ? profile.full_name : "Un patient";
    const sent = { ...((a.reminders_sent ?? {}) as Record<string, unknown>) };
    let dirty = false;

    const last = typeof sent.pending_last === "string" ? new Date(sent.pending_last) : null;
    if (prac?.user_id && (!last || last.getTime() < now.getTime() - 2 * 3600_000)) {
      const hours = Math.max(1, Math.floor((now.getTime() - a.requested_at.getTime()) / 3600_000));
      await insertNotification(
        prac.user_id,
        "appointment_pending",
        "Demande en attente de réponse",
        `${patientName} attend votre réponse depuis ${hours} h.`,
        { appointment_id: a.id, for: "practitioner" },
      );
      sent.pending_last = now.toISOString();
      dirty = true;
    }

    if (a.requested_at.getTime() < now.getTime() - 24 * 3600_000 && !("admin_alert" in sent)) {
      for (const adminId of await adminUserIds()) {
        await insertNotification(
          adminId,
          "appointment_unanswered",
          "Praticien sans réponse",
          `${prac?.full_name ?? "Un praticien"} n'a pas répondu à une demande depuis plus de 24 h.`,
          { appointment_id: a.id, practitioner_id: a.practitioner_id, for: "admin" },
        );
      }
      sent.admin_alert = now.toISOString();
      dirty = true;
    }

    if (dirty) {
      await basePrisma.appointments.update({
        where: { id: a.id },
        data: { reminders_sent: sent as Prisma.InputJsonValue },
      });
    }
  }
}

// ============================================================================
// Pharmacies, livreurs, positions GPS : diffusion temps réel
// ============================================================================

export async function afterPharmacyWrite(before: Row | null, after: Row | null) {
  const row = after ?? before;
  if (!row) return;
  const users = await pharmacyMemberIds(String(row.id));
  if (row.owner_user_id) users.push(String(row.owner_user_id));
  publish({
    table: "pharmacies",
    type: !before ? "INSERT" : !after ? "DELETE" : "UPDATE",
    row: pick(row, ["id", "status", "owner_user_id", "updated_at"]),
    users,
    admins: true,
  });
}

/** Utilisateurs suivant une livraison active de ce livreur. */
async function activeDeliveryWatchers(courierId: string): Promise<string[]> {
  const res = await basePrisma.reservations.findMany({
    where: {
      courier_id: courierId,
      delivery_status: { in: ["assigned", "picked_up", "en_route"] },
    },
    select: { patient_id: true, pharmacy_id: true },
  });
  const users = new Set<string>();
  for (const r of res) {
    users.add(r.patient_id);
    for (const id of await pharmacyMemberIds(r.pharmacy_id)) users.add(id);
  }
  return [...users];
}

export async function afterCourierWrite(before: Row | null, after: Row | null) {
  const row = after ?? before;
  if (!row) return;
  const users = await activeDeliveryWatchers(String(row.id));
  users.push(String(row.user_id));
  publish({
    table: "couriers",
    type: !before ? "INSERT" : !after ? "DELETE" : "UPDATE",
    row: pick(row, [
      "id",
      "user_id",
      "status",
      "is_online",
      "current_lat",
      "current_lng",
      "last_position_at",
    ]),
    users,
    admins: true,
  });
}

export async function afterCourierPositionInsert(row: Row) {
  const users = new Set<string>();
  const cu = await courierUserId(row.courier_id as string);
  if (cu) users.add(cu);
  if (row.reservation_id) {
    const r = await basePrisma.reservations.findUnique({
      where: { id: row.reservation_id as string },
      select: { patient_id: true, pharmacy_id: true, courier_id: true, delivery_status: true },
    });
    // Même règle qu'avant : visible seulement pendant une livraison active de CE livreur.
    if (
      r &&
      r.courier_id === row.courier_id &&
      ["assigned", "picked_up", "en_route"].includes(r.delivery_status)
    ) {
      users.add(r.patient_id);
      for (const id of await pharmacyMemberIds(r.pharmacy_id)) users.add(id);
    }
  }
  publish({
    table: "courier_positions",
    type: "INSERT",
    row: pick(row, ["id", "courier_id", "reservation_id", "lat", "lng", "recorded_at"]),
    users: [...users],
  });
}
