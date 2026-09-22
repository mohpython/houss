/**
 * Règles d'accès aux commandes (reservations), livreurs et positions GPS —
 * portage des anciennes politiques RLS et du trigger
 * `enforce_reservation_update_columns` (migration 20260905151609).
 *
 * Serveur uniquement.
 */
import type { Prisma, reservations } from "@prisma/client";
import { prisma } from "@/server/db.server";
import {
  ForbiddenError,
  NotFoundError,
  isAdmin,
  isPharmacyMember,
  isUserCourier,
} from "@/server/authz.server";

export type ReservationPatch = Partial<Omit<reservations, "id" | "created_at">>;

const ACTIVE_DELIVERY = ["assigned", "picked_up", "en_route"] as const;

const PHARMACY_COLUMNS = [
  "status",
  "accepted_at",
  "ready_at",
  "delivered_at",
  "picked_up_at",
  "assigned_at",
  "courier_id",
  "delivery_status",
  "payment_status",
  "paid_at",
  "payment_method",
  "payment_reference",
  "pickup_code_verified_at",
  "receipt_code_verified_at",
  "code_attempts",
  "is_partial",
  "missing_items",
  "items_total",
  "delivery_fee",
  "total_amount",
  "notes",
];

const COURIER_COLUMNS = [
  "delivery_status",
  "picked_up_at",
  "delivered_at",
  "status",
  "receipt_code_verified_at",
  "code_attempts",
];

const PATIENT_COLUMNS = [
  "fulfillment_method",
  "delivery_fee",
  "total_amount",
  "payment_status",
  "payment_method",
  "payment_reference",
  "patient_phone",
  "patient_name",
  "patient_address",
  "patient_lat",
  "patient_lng",
  "neighborhood_id",
  "delivery_mode",
  "notes",
  "status",
];

function norm(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (v === undefined) return null;
  return v;
}

function differs(a: unknown, b: unknown): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (na !== null && typeof na === "object") return JSON.stringify(na) !== JSON.stringify(nb);
  if (nb !== null && typeof nb === "object") return JSON.stringify(na) !== JSON.stringify(nb);
  if (typeof na === "string" && typeof nb === "number") return new Date(na).getTime() !== nb;
  return na !== nb;
}

/**
 * Vérifie qu'un utilisateur peut appliquer `patch` à la commande `before`
 * (politique RLS UPDATE + trigger enforce_reservation_update_columns).
 */
export async function assertReservationUpdate(
  userId: string,
  before: reservations,
  patch: ReservationPatch,
) {
  const [admin, pharmacy, courier] = await Promise.all([
    isAdmin(userId),
    isPharmacyMember(userId, before.pharmacy_id),
    isUserCourier(userId, before.courier_id),
  ]);
  const patient = before.patient_id === userId;

  // Politique RLS UPDATE : patient, membre de la pharmacie, livreur assigné, admin.
  if (!(patient || pharmacy || courier || admin)) {
    throw new NotFoundError("Commande introuvable");
  }
  // Un UPDATE PostgreSQL applique aussi la politique SELECT : la pharmacie ne
  // voyait (donc ne pouvait modifier) une commande qu'après déclaration du paiement.
  if (!patient && !courier && !admin && before.payment_status === "unpaid") {
    throw new NotFoundError("Commande introuvable");
  }
  if (admin) return;

  const old = before as unknown as Record<string, unknown>;
  const next: Record<string, unknown> = { ...old, ...patch };
  const changed = Object.keys(patch).filter(
    (k) => k !== "updated_at" && differs(old[k], (patch as Record<string, unknown>)[k]),
  );
  if (changed.length === 0) return;

  const allowed = new Set<string>(["updated_at"]);
  if (pharmacy) PHARMACY_COLUMNS.forEach((c) => allowed.add(c));

  if (courier) {
    COURIER_COLUMNS.forEach((c) => allowed.add(c));
    if (next.status !== old.status && next.status !== "completed") {
      throw new ForbiddenError("Le livreur ne peut que clôturer la commande.");
    }
  }

  if (patient) {
    PATIENT_COLUMNS.forEach((c) => allowed.add(c));
    if (
      next.payment_status !== old.payment_status &&
      !(old.payment_status === "unpaid" && next.payment_status === "pending_verification") &&
      !pharmacy
    ) {
      throw new ForbiddenError("Le paiement ne peut être confirmé que par la pharmacie.");
    }
    if (next.status !== old.status && next.status !== "cancelled" && !pharmacy) {
      throw new ForbiddenError("Le patient ne peut qu'annuler sa commande.");
    }
    if (
      (next.fulfillment_method !== old.fulfillment_method ||
        Number(next.delivery_fee) !== Number(old.delivery_fee) ||
        Number(next.total_amount) !== Number(old.total_amount)) &&
      !pharmacy
    ) {
      if (old.payment_status !== "unpaid") {
        throw new ForbiddenError("Le mode de retrait ne peut plus être modifié après le paiement.");
      }
      const fee = Number(next.delivery_fee);
      if (
        (fee !== 0 && fee !== 1000) ||
        (next.fulfillment_method === "pickup" && fee !== 0) ||
        Number(next.total_amount) !== Number(next.items_total) + fee
      ) {
        throw new ForbiddenError("Montant de commande invalide.");
      }
    }
  }

  const bad = changed.filter((c) => !allowed.has(c));
  if (bad.length > 0) {
    throw new ForbiddenError(`Modification non autorisée des champs: ${bad.join(", ")}`);
  }
}

/** Met à jour une commande au nom d'un utilisateur, avec les anciennes règles. */
export async function updateReservationAs(
  userId: string,
  reservationId: string,
  patch: ReservationPatch,
) {
  const before = await prisma.reservations.findUnique({ where: { id: reservationId } });
  if (!before) throw new NotFoundError("Commande introuvable");
  await assertReservationUpdate(userId, before, patch);
  return prisma.reservations.update({
    where: { id: reservationId },
    data: patch as Prisma.reservationsUncheckedUpdateInput,
  });
}

/**
 * Ancienne RLS `couriers` : son propre profil, admin, ou patient / pharmacie
 * d'une livraison ACTIVE de ce livreur (private.user_can_view_courier).
 */
export async function canViewCourier(userId: string, courierId: string | null | undefined) {
  if (!courierId) return false;
  if (await isUserCourier(userId, courierId)) return true;
  if (await isAdmin(userId)) return true;
  const rows = await prisma.reservations.findMany({
    where: { courier_id: courierId, delivery_status: { in: [...ACTIVE_DELIVERY] } },
    select: { patient_id: true, pharmacy_id: true },
  });
  for (const r of rows) {
    if (r.patient_id === userId) return true;
    if (await isPharmacyMember(userId, r.pharmacy_id)) return true;
  }
  return false;
}

/** Ancienne RLS `prescription_items` : patient de l'ordonnance ou admin. */
export async function canViewPrescriptionItems(userId: string, prescriptionId: string) {
  const rx = await prisma.prescriptions.findUnique({
    where: { id: prescriptionId },
    select: { patient_id: true },
  });
  if (rx?.patient_id === userId) return true;
  return isAdmin(userId);
}

/** Ancienne RLS `pharmacies` (lecture) : approuvée, propriétaire ou admin. */
export async function canViewPharmacy(
  userId: string,
  ph: { status: string; owner_user_id: string | null } | null,
) {
  if (!ph) return false;
  if (ph.status === "approved") return true;
  if (ph.owner_user_id && ph.owner_user_id === userId) return true;
  return isAdmin(userId);
}
