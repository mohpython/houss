/**
 * Espace pharmacie (gérant / personnel) : lectures et écritures qui passaient
 * auparavant directement par un accès direct à la base dans les pages, avec les
 * contrôles d'accès des anciennes politiques RLS.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "@/integrations/auth/middleware";
import { toPlain } from "@/server/serialize";

/**
 * Filtre « commandes visibles » (ancienne RLS de `reservations`) :
 * patient, pharmacie (une fois le paiement déclaré), livreur assigné, admin.
 */
async function visibleReservationsWhere(userId: string): Promise<Prisma.reservationsWhereInput> {
  const { isAdmin, userPharmacyIds, getCourierForUser } = await import("@/server/authz.server");
  if (await isAdmin(userId)) return {};
  const [pharmIds, courier] = await Promise.all([
    userPharmacyIds(userId),
    getCourierForUser(userId),
  ]);
  const or: Prisma.reservationsWhereInput[] = [{ patient_id: userId }];
  if (pharmIds.length > 0) {
    or.push({ pharmacy_id: { in: pharmIds }, payment_status: { not: "unpaid" } });
  }
  if (courier) or.push({ courier_id: courier.id });
  return { OR: or };
}

/**
 * Lecture d'une pharmacie et de son stock : pharmacie approuvée, membre
 * (propriétaire / personnel) ou admin.
 */
async function assertCanReadPharmacy(userId: string, pharmacyId: string) {
  const { prisma } = await import("@/server/db.server");
  const { isPharmacyMember, isAdmin, ForbiddenError } = await import("@/server/authz.server");
  const ph = await prisma.pharmacies.findUnique({
    where: { id: pharmacyId },
    select: { status: true },
  });
  if (!ph) throw new ForbiddenError("Pharmacie introuvable");
  if (ph.status === "approved") return;
  if (await isPharmacyMember(userId, pharmacyId)) return;
  if (await isAdmin(userId)) return;
  throw new ForbiddenError("Pharmacie introuvable");
}

// ============================================================================
// Tableau de bord du gérant
// ============================================================================

/** Pharmacies dont l'utilisateur est le gérant. */
export const listMyPharmacies = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { prisma } = await import("@/server/db.server");
    const rows = await prisma.pharmacies.findMany({
      where: { owner_user_id: context.userId },
      select: { id: true, name: true, status: true },
    });
    return toPlain(rows);
  });

/** Statuts des commandes visibles des pharmacies demandées (pour les compteurs). */
export const listPharmacyReservationStatuses = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ pharmacyIds: z.array(z.string().uuid()).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.pharmacyIds.length === 0) return [];
    const { prisma } = await import("@/server/db.server");
    const visible = await visibleReservationsWhere(context.userId);
    const rows = await prisma.reservations.findMany({
      where: { AND: [{ pharmacy_id: { in: data.pharmacyIds } }, visible] },
      select: { pharmacy_id: true, status: true },
    });
    return toPlain(rows);
  });

// ============================================================================
// Inscription d'une pharmacie
// ============================================================================

/** L'utilisateur a-t-il déjà une pharmacie ou un profil livreur ? */
export const getPharmacyOnboardingStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { prisma } = await import("@/server/db.server");
    const [owned, staff, courier] = await Promise.all([
      prisma.pharmacies.findFirst({
        where: { owner_user_id: context.userId },
        select: { id: true },
      }),
      prisma.pharmacy_staff.findFirst({ where: { user_id: context.userId }, select: { id: true } }),
      prisma.couriers.findFirst({ where: { user_id: context.userId }, select: { id: true } }),
    ]);
    return { owned: !!owned, staff: !!staff, courier: !!courier };
  });

/** Demande d'inscription d'une pharmacie (statut « pending »). */
export const createPharmacyApplication = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(200),
        license_number: z.string().trim().min(1).max(100),
        address: z.string().trim().min(1).max(500),
        city: z.string().trim().max(100).nullable(),
        phone: z.string().trim().max(50).nullable(),
        lat: z.number().finite().nullable(),
        lng: z.number().finite().nullable(),
        google_place_id: z.string().trim().max(300).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const existing = await prisma.pharmacies.findFirst({
      where: { owner_user_id: context.userId },
      select: { id: true },
    });
    if (existing) throw new Error("Vous gérez déjà une pharmacie.");
    if (data.google_place_id) {
      const dup = await prisma.pharmacies.findFirst({
        where: { google_place_id: data.google_place_id },
        select: { id: true },
      });
      if (dup) throw new Error("Cette pharmacie est déjà enregistrée.");
    }
    const row = await prisma.pharmacies.create({
      data: {
        owner_user_id: context.userId,
        name: data.name,
        license_number: data.license_number,
        address: data.address,
        city: data.city || null,
        phone: data.phone || null,
        lat: data.lat,
        lng: data.lng,
        google_place_id: data.google_place_id || null,
        status: "pending",
      },
      select: { id: true },
    });
    return { id: row.id };
  });

// ============================================================================
// Inventaire (pharmacie et back-office)
// ============================================================================

export const listPharmacyInventory = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ pharmacyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCanReadPharmacy(context.userId, data.pharmacyId);
    const { prisma } = await import("@/server/db.server");
    const rows = await prisma.inventory.findMany({
      where: { pharmacy_id: data.pharmacyId },
      select: {
        id: true,
        stock_qty: true,
        price: true,
        medicines: {
          select: { id: true, normalized_name: true, strength: true, generic_name: true },
        },
      },
    });
    return toPlain(rows);
  });

/** Ajoute (ou remplace) un médicament dans le stock d'une pharmacie. */
export const upsertInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        pharmacyId: z.string().uuid(),
        name: z.string().trim().min(1).max(300),
        generic: z.string().trim().max(300).optional().default(""),
        strength: z.string().trim().max(100).optional().default(""),
        stock: z.number().int().min(-10_000_000).max(10_000_000),
        price: z.number().finite().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const { assertPharmacyMemberOrAdmin, isAdmin } = await import("@/server/authz.server");
    await assertPharmacyMemberOrAdmin(context.userId, data.pharmacyId);

    const normalized = data.name.trim().toLowerCase();
    const existing = await prisma.medicines.findFirst({
      where: { normalized_name: normalized, strength: data.strength || "" },
      select: { id: true },
    });
    let medId = existing?.id;
    if (!medId) {
      // Le catalogue des médicaments n'est modifiable que par les admins.
      if (!(await isAdmin(context.userId))) {
        throw new Error(
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
      where: { pharmacy_id_medicine_id: { pharmacy_id: data.pharmacyId, medicine_id: medId } },
      create: {
        pharmacy_id: data.pharmacyId,
        medicine_id: medId,
        stock_qty: data.stock,
        price: data.price,
      },
      update: { stock_qty: data.stock, price: data.price },
    });
    return { ok: true };
  });

async function loadInventoryRowForWrite(userId: string, id: string) {
  const { prisma } = await import("@/server/db.server");
  const { assertPharmacyMemberOrAdmin } = await import("@/server/authz.server");
  const row = await prisma.inventory.findUnique({
    where: { id },
    select: { id: true, pharmacy_id: true },
  });
  if (!row) return null;
  await assertPharmacyMemberOrAdmin(userId, row.pharmacy_id);
  return row;
}

export const updateInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        stock_qty: z.number().int().min(-10_000_000).max(10_000_000).optional(),
        price: z.number().finite().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = await loadInventoryRowForWrite(context.userId, data.id);
    if (!row) return { ok: true };
    const { prisma } = await import("@/server/db.server");
    await prisma.inventory.update({
      where: { id: row.id },
      data: {
        ...(data.stock_qty !== undefined ? { stock_qty: data.stock_qty } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
      },
    });
    return { ok: true };
  });

export const deleteInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const row = await loadInventoryRowForWrite(context.userId, data.id);
    if (!row) return { ok: true };
    const { prisma } = await import("@/server/db.server");
    await prisma.inventory.deleteMany({ where: { id: row.id } });
    return { ok: true };
  });

// ============================================================================
// Commandes reçues par une pharmacie
// ============================================================================

export const listPharmacyReservations = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ pharmacyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const { createSignedUrl } = await import("@/server/storage.server");
    const visible = await visibleReservationsWhere(context.userId);
    const rows = await prisma.reservations.findMany({
      where: { AND: [{ pharmacy_id: data.pharmacyId }, visible] },
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
    });

    // L'ordonnance est lisible par la pharmacie destinataire de la commande.
    const rxUrls: Record<string, string> = {};
    for (const r of rows) {
      const path = r.prescriptions?.file_path;
      if (!path) continue;
      try {
        rxUrls[r.id] = createSignedUrl("prescriptions", path, 300);
      } catch {
        // chemin invalide : pas d'aperçu
      }
    }
    return { rows: toPlain(rows), rxUrls };
  });
