/**
 * Contrôles d'accès (remplacent les politiques RLS et fonctions
 * `private.has_role`, `private.is_pharmacy_member`, etc. de Supabase).
 *
 * Toute server function doit vérifier explicitement les droits avec ces
 * helpers : il n'y a plus de RLS au niveau de la base.
 */
import type { app_role } from "@prisma/client";
import { basePrisma } from "./prisma-base.server";

export class ForbiddenError extends Error {
  constructor(message = "Accès refusé") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Introuvable") {
    super(message);
    this.name = "NotFoundError";
  }
}

export async function hasRole(userId: string, role: app_role): Promise<boolean> {
  const r = await basePrisma.user_roles.findFirst({
    where: { user_id: userId, role },
    select: { id: true },
  });
  return !!r;
}

export async function isAdmin(userId: string): Promise<boolean> {
  return hasRole(userId, "admin");
}

export async function assertAdmin(userId: string, message = "Accès réservé aux administrateurs") {
  if (!(await isAdmin(userId))) throw new ForbiddenError(message);
}

/** Propriétaire ou membre du personnel de la pharmacie. */
export async function isPharmacyMember(userId: string, pharmacyId: string | null | undefined) {
  if (!pharmacyId) return false;
  const [owner, staff] = await Promise.all([
    basePrisma.pharmacies.findFirst({
      where: { id: pharmacyId, owner_user_id: userId },
      select: { id: true },
    }),
    basePrisma.pharmacy_staff.findFirst({
      where: { pharmacy_id: pharmacyId, user_id: userId },
      select: { id: true },
    }),
  ]);
  return !!owner || !!staff;
}

export async function assertPharmacyMemberOrAdmin(userId: string, pharmacyId: string) {
  if (await isPharmacyMember(userId, pharmacyId)) return;
  if (await isAdmin(userId)) return;
  throw new ForbiddenError("Accès réservé à la pharmacie");
}

/** Identifiants des pharmacies dont l'utilisateur est propriétaire ou employé. */
export async function userPharmacyIds(userId: string): Promise<string[]> {
  const [owned, staff] = await Promise.all([
    basePrisma.pharmacies.findMany({ where: { owner_user_id: userId }, select: { id: true } }),
    basePrisma.pharmacy_staff.findMany({ where: { user_id: userId }, select: { pharmacy_id: true } }),
  ]);
  return [...new Set([...owned.map((p) => p.id), ...staff.map((s) => s.pharmacy_id)])];
}

export async function getCourierForUser(userId: string) {
  return basePrisma.couriers.findUnique({ where: { user_id: userId } });
}

export async function isUserCourier(userId: string, courierId: string | null | undefined) {
  if (!courierId) return false;
  const c = await basePrisma.couriers.findFirst({
    where: { id: courierId, user_id: userId },
    select: { id: true },
  });
  return !!c;
}

export async function getPractitionerForUser(userId: string) {
  return basePrisma.practitioners.findUnique({ where: { user_id: userId } });
}

export async function isUserPractitioner(userId: string, practitionerId: string | null | undefined) {
  if (!practitionerId) return false;
  const p = await basePrisma.practitioners.findFirst({
    where: { id: practitionerId, user_id: userId },
    select: { id: true },
  });
  return !!p;
}

export type ReservationAccess = {
  isPatient: boolean;
  isPharmacy: boolean;
  isCourier: boolean;
  isAdmin: boolean;
};

/**
 * Droits d'un utilisateur sur une commande (ancienne RLS de `reservations`).
 * La pharmacie ne voit la commande qu'une fois le paiement déclaré.
 */
export async function reservationAccess(
  userId: string,
  r: { patient_id: string; pharmacy_id: string; courier_id: string | null; payment_status: string },
): Promise<ReservationAccess & { canRead: boolean }> {
  const [pharmacy, courier, admin] = await Promise.all([
    isPharmacyMember(userId, r.pharmacy_id),
    isUserCourier(userId, r.courier_id),
    isAdmin(userId),
  ]);
  const isPatient = r.patient_id === userId;
  const canRead =
    isPatient || admin || courier || (pharmacy && r.payment_status !== "unpaid");
  return { isPatient, isPharmacy: pharmacy, isCourier: courier, isAdmin: admin, canRead };
}

/** Charge une commande et vérifie que l'utilisateur peut la lire. */
export async function loadReservationForUser(userId: string, reservationId: string) {
  const r = await basePrisma.reservations.findUnique({ where: { id: reservationId } });
  if (!r) throw new NotFoundError("Commande introuvable");
  const access = await reservationAccess(userId, r);
  if (!access.canRead) throw new NotFoundError("Commande introuvable");
  return { reservation: r, access };
}

/** Droits sur une ordonnance : patient, admin, ou pharmacie ayant une commande dessus. */
export async function canReadPrescription(userId: string, prescriptionId: string) {
  const rx = await basePrisma.prescriptions.findUnique({
    where: { id: prescriptionId },
    select: { patient_id: true },
  });
  if (!rx) return false;
  if (rx.patient_id === userId) return true;
  if (await isAdmin(userId)) return true;
  const pharmIds = await userPharmacyIds(userId);
  if (pharmIds.length === 0) return false;
  const r = await basePrisma.reservations.findFirst({
    where: { prescription_id: prescriptionId, pharmacy_id: { in: pharmIds } },
    select: { id: true },
  });
  return !!r;
}
