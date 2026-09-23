import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { toPlain } from "@/server/serialize";
import type { InventoryLine } from "./medicine-match.server";

/** Clé Google Maps (API Places v1), lue côté serveur uniquement. */
function googleMapsKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Google Maps non configuré");
  return key;
}

const PLACES_API = "https://places.googleapis.com/v1";

/**
 * Pharmacies visibles par l'utilisateur (ancienne RLS de `pharmacies`) :
 * approuvées, ou dont il est propriétaire, ou toutes pour un admin.
 */
async function visiblePharmacyWhere(userId: string) {
  const { isAdmin } = await import("@/server/authz.server");
  if (await isAdmin(userId)) return {};
  return { OR: [{ status: "approved" as const }, { owner_user_id: userId }] };
}

/** Lignes d'ordonnance lisibles (ancienne RLS : patient propriétaire ou admin). */
async function readableItems(userId: string, prescriptionId: string) {
  const { prisma } = await import("@/server/db.server");
  const { isAdmin } = await import("@/server/authz.server");
  const rx = await prisma.prescriptions.findUnique({
    where: { id: prescriptionId },
    select: { patient_id: true },
  });
  if (!rx) return [];
  if (rx.patient_id !== userId && !(await isAdmin(userId))) return [];
  return prisma.prescription_items.findMany({
    where: { prescription_id: prescriptionId },
    select: { id: true, medicine_name_raw: true, strength: true, normalized_medicine_id: true },
  });
}

const INVENTORY_SELECT = {
  pharmacy_id: true,
  stock_qty: true,
  price: true,
  medicines: { select: { id: true, normalized_name: true, generic_name: true } },
} as const;

export const extractPrescription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ prescriptionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");

    const rx = await prisma.prescriptions.findFirst({
      where: { id: data.prescriptionId, patient_id: userId },
      select: { id: true },
    });
    if (!rx) throw new Error("Ordonnance introuvable");

    const { extractPrescriptionCore } = await import("./rx-core.server");
    return extractPrescriptionCore(userId, data.prescriptionId);
  });

export const findNearbyPharmacies = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prescriptionId: z.string().uuid(),
        lat: z.number().min(-90).max(90).nullable(),
        lng: z.number().min(-180).max(180).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const { matchItemsToInventory } = await import("./medicine-match.server");

    const items = await readableItems(userId, data.prescriptionId);

    if (items.length === 0) return { pharmacies: [] };

    // Load approved pharmacies (patients only see approved, like the old RLS)
    const pharmacies = await prisma.pharmacies.findMany({
      where: await visiblePharmacyWhere(userId),
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        lat: true,
        lng: true,
        phone: true,
        opening_hours: true,
        rating: true,
      },
    });

    // Load inventory joined with medicines for these pharmacies
    const pharmIds = pharmacies.map((p) => p.id);
    const inv = await prisma.inventory.findMany({
      where: { pharmacy_id: { in: pharmIds } },
      select: {
        pharmacy_id: true,
        stock_qty: true,
        price: true,
        medicines: {
          select: { id: true, normalized_name: true, generic_name: true, strength: true },
        },
      },
    });

    const enriched = pharmacies.map((p) => {
      const pharmInv = inv.filter((i) => i.pharmacy_id === p.id);
      const availability = matchItemsToInventory(items, pharmInv as unknown as InventoryLine[]);
      const availableCount = availability.filter((a) => a.available).length;
      let distanceKm: number | null = null;
      if (data.lat !== null && data.lng !== null && p.lat !== null && p.lng !== null) {
        distanceKm = haversine(data.lat, data.lng, p.lat, p.lng);
      }
      return { ...p, availability, availableCount, totalItems: items.length, distanceKm };
    });

    enriched.sort((a, b) => {
      if (b.availableCount !== a.availableCount) return b.availableCount - a.availableCount;
      const da = a.distanceKm ?? 999999;
      const db = b.distanceKm ?? 999999;
      return da - db;
    });

    await prisma.audit_logs.create({
      data: {
        actor_user_id: userId,
        action: "pharmacy_search",
        entity: "prescription",
        entity_id: data.prescriptionId,
        meta: { pharmacy_count: enriched.length },
      },
    });

    return toPlain({ pharmacies: enriched });
  });

type PlaceResult = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  nationalPhoneNumber?: string;
  rating?: number;
  currentOpeningHours?: { openNow?: boolean };
  googleMapsUri?: string;
};

export const findNearbyPharmaciesPlaces = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prescriptionId: z.string().uuid(),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radiusMeters: z.number().min(500).max(50000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const { matchItemsToInventory } = await import("./medicine-match.server");

    const gmapsKey = googleMapsKey();

    const rxItems = await readableItems(userId, data.prescriptionId);

    const radius = data.radiusMeters ?? 5000;

    const res = await fetch(`${PLACES_API}/places:searchNearby`, {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": gmapsKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.rating,places.currentOpeningHours.openNow,places.googleMapsUri",
      },
      body: JSON.stringify({
        includedTypes: ["pharmacy"],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: data.lat, longitude: data.lng },
            radius,
          },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Places (${res.status}): ${body.slice(0, 200)}`);
    }

    const payload = (await res.json()) as { places?: PlaceResult[] };
    const places = payload.places ?? [];
    const placeIds = places.map((p) => p.id);

    // Match against locally registered pharmacies
    const visibleWhere = await visiblePharmacyWhere(userId);
    const localPharms =
      placeIds.length > 0
        ? await prisma.pharmacies.findMany({
            where: { AND: [visibleWhere, { google_place_id: { in: placeIds } }] },
            select: { id: true, google_place_id: true },
          })
        : [];

    const localIds = localPharms.map((p) => p.id);
    const inv =
      localIds.length > 0
        ? await prisma.inventory.findMany({
            where: { pharmacy_id: { in: localIds } },
            select: INVENTORY_SELECT,
          })
        : [];

    const results = places.map((p) => {
      const local = localPharms.find((lp) => lp.google_place_id === p.id);
      const pharmInv = local ? inv.filter((i) => i.pharmacy_id === local.id) : [];
      const availability = matchItemsToInventory(rxItems, pharmInv as unknown as InventoryLine[]);
      const distanceKm = p.location
        ? haversine(data.lat, data.lng, p.location.latitude, p.location.longitude)
        : null;
      return {
        placeId: p.id,
        localPharmacyId: local?.id ?? null,
        name: p.displayName?.text ?? "Pharmacie",
        address: p.formattedAddress ?? "",
        phone: p.nationalPhoneNumber ?? null,
        rating: p.rating ?? null,
        openNow: p.currentOpeningHours?.openNow ?? null,
        mapsUri: p.googleMapsUri ?? null,
        distanceKm,
        availability,
        availableCount: availability.filter((a) => a.available).length,
        totalItems: rxItems.length,
        registered: !!local,
      };
    });

    // Also include locally-approved partner pharmacies within radius
    // (covers pharmacies registered by admin without a google_place_id).
    const radiusKm = radius / 1000;
    const placeIdSet = new Set(placeIds);
    const extraLocal = await prisma.pharmacies.findMany({
      where: { status: "approved" },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        lat: true,
        lng: true,
        rating: true,
        google_place_id: true,
      },
    });
    const extras = extraLocal
      .filter((lp) => {
        if (lp.google_place_id && placeIdSet.has(lp.google_place_id)) return false;
        if (lp.lat == null || lp.lng == null) return false;
        const d = haversine(data.lat, data.lng, lp.lat, lp.lng);
        return d <= radiusKm;
      })
      .map((lp) => {
        const pharmInv = inv.filter((i) => i.pharmacy_id === lp.id);
        // If inv wasn't loaded for this pharmacy id, fetch skipped — reload below if needed.
        const availability = matchItemsToInventory(rxItems, pharmInv as unknown as InventoryLine[]);
        return {
          placeId: lp.google_place_id ?? `local-${lp.id}`,
          localPharmacyId: lp.id,
          name: lp.name,
          address: lp.address ?? "",
          phone: lp.phone ?? null,
          rating: lp.rating ?? null,
          openNow: null as boolean | null,
          mapsUri:
            lp.lat != null && lp.lng != null
              ? `https://www.google.com/maps/search/?api=1&query=${lp.lat},${lp.lng}`
              : null,
          distanceKm: haversine(data.lat, data.lng, lp.lat!, lp.lng!),
          availability,
          availableCount: availability.filter((a) => a.available).length,
          totalItems: rxItems.length,
          registered: true,
        };
      });

    // Load inventory for any extra pharmacies not covered above
    const missingInvIds = extras
      .filter((e) => !inv.some((i) => i.pharmacy_id === e.localPharmacyId))
      .map((e) => e.localPharmacyId!);
    if (missingInvIds.length > 0) {
      const inv2 = await prisma.inventory.findMany({
        where: { pharmacy_id: { in: missingInvIds } },
        select: INVENTORY_SELECT,
      });
      for (const e of extras) {
        const pharmInv = inv2.filter((i) => i.pharmacy_id === e.localPharmacyId);
        if (pharmInv.length === 0) continue;
        e.availability = matchItemsToInventory(rxItems, pharmInv as unknown as InventoryLine[]);
        e.availableCount = e.availability.filter((a) => a.available).length;
      }
    }

    results.push(...extras);

    // Priority: registered partners with stock → registered → unregistered; then stock count; then distance
    results.sort((a, b) => {
      const scoreA = (a.registered ? 100 : 0) + (a.availableCount > 0 ? 50 : 0);
      const scoreB = (b.registered ? 100 : 0) + (b.availableCount > 0 ? 50 : 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      if (b.availableCount !== a.availableCount) return b.availableCount - a.availableCount;
      return (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9);
    });

    await prisma.audit_logs.create({
      data: {
        actor_user_id: userId,
        action: "pharmacy_search_places",
        entity: "prescription",
        entity_id: data.prescriptionId,
        meta: { count: results.length, radius },
      },
    });

    return toPlain({ pharmacies: results });
  });

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const createReservation = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prescriptionId: z.string().uuid(),
        pharmacyId: z.string().uuid(),
        itemIds: z.array(z.string().uuid()),
        notes: z.string().max(500).optional(),
        patientLat: z.number().optional(),
        patientLng: z.number().optional(),
        patientAddress: z.string().max(300).optional(),
        neighborhoodId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const { matchItemsToInventory } = await import("./medicine-match.server");

    const rx = await prisma.prescriptions.findUnique({
      where: { id: data.prescriptionId },
      select: { id: true, patient_id: true },
    });
    if (!rx) throw new Error("Ordonnance introuvable");
    if (rx.patient_id !== userId) {
      throw new Error(
        "Cette ordonnance appartient à un autre patient : seul son propriétaire peut réserver.",
      );
    }

    // Price each requested item from the pharmacy's own inventory.
    const { DELIVERY_FEE, resolveDeliveryTarget } = await import("./routing-core.server");
    const target =
      data.neighborhoodId || (data.patientLat != null && data.patientLng != null)
        ? await resolveDeliveryTarget({
            lat: data.patientLat,
            lng: data.patientLng,
            address: data.patientAddress,
            neighborhoodId: data.neighborhoodId,
          })
        : null;
    // Only lines of this prescription can be reserved.
    const chosen =
      data.itemIds.length > 0
        ? await prisma.prescription_items.findMany({
            where: { id: { in: data.itemIds }, prescription_id: data.prescriptionId },
            select: { id: true, medicine_name_raw: true, normalized_medicine_id: true },
          })
        : [];
    const chosenIds = new Set(chosen.map((c) => c.id));
    const itemIds = data.itemIds.filter((id) => chosenIds.has(id));
    const inv = await prisma.inventory.findMany({
      where: {
        pharmacy_id: data.pharmacyId,
        pharmacies: await visiblePharmacyWhere(userId),
      },
      select: INVENTORY_SELECT,
    });

    const availability = matchItemsToInventory(chosen, inv as unknown as InventoryLine[]);
    const prices = new Map<string, number | null>(availability.map((a) => [a.itemId, a.price]));
    const itemsTotal = [...prices.values()].reduce<number>((s, p) => s + (p ?? 0), 0);

    let res: { id: string };
    try {
      res = await prisma.reservations.create({
        data: {
          prescription_id: data.prescriptionId,
          patient_id: userId,
          pharmacy_id: data.pharmacyId,
          status: "pending",
          notes: data.notes ?? null,
          patient_lat: target?.lat ?? null,
          patient_lng: target?.lng ?? null,
          patient_address: target?.address ?? data.patientAddress ?? null,
          neighborhood_id: target?.neighborhoodId ?? null,
          delivery_mode: target?.deliveryMode ?? "gps",
          items_total: itemsTotal,
          delivery_fee: DELIVERY_FEE,
          total_amount: itemsTotal + DELIVERY_FEE,
          payment_status: "unpaid",
        },
        select: { id: true },
      });
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Erreur de réservation");
    }

    if (itemIds.length > 0) {
      await prisma.reservation_items.createMany({
        data: itemIds.map((id) => ({
          reservation_id: res.id,
          prescription_item_id: id,
          unit_price: prices.get(id) ?? null,
        })),
      });
    }

    await prisma.audit_logs.create({
      data: {
        actor_user_id: userId,
        action: "reservation_created",
        entity: "reservation",
        entity_id: res.id,
        meta: { pharmacy_id: data.pharmacyId, item_count: data.itemIds.length },
      },
    });

    return { id: res.id };
  });

export const respondToReservation = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reservationId: z.string().uuid(),
        decision: z.enum(["accepted", "rejected", "ready", "completed", "cancelled"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const { updateReservationAs } = await import("./reservation-rules.server");

    const patch: {
      status: typeof data.decision;
      accepted_at?: Date;
      ready_at?: Date;
      delivered_at?: Date;
    } = { status: data.decision };
    if (data.decision === "accepted") patch.accepted_at = new Date();
    if (data.decision === "ready") patch.ready_at = new Date();
    if (data.decision === "completed") patch.delivered_at = new Date();
    // Ancienne RLS UPDATE + trigger enforce_reservation_update_columns.
    await updateReservationAs(userId, data.reservationId, patch);
    await prisma.audit_logs.create({
      data: {
        actor_user_id: userId,
        action: `reservation_${data.decision}`,
        entity: "reservation",
        entity_id: data.reservationId,
      },
    });
    return { ok: true };
  });

export const approvePharmacy = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        pharmacyId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const { isAdmin } = await import("@/server/authz.server");

    if (!(await isAdmin(userId))) throw new Error("Accès admin requis");

    const pharm = await prisma.pharmacies.update({
      where: { id: data.pharmacyId },
      data: { status: data.decision },
      select: { id: true, owner_user_id: true },
    });

    if (data.decision === "approved") {
      // Grant pharmacy_staff role to owner (if the pharmacy has been claimed)
      if (pharm.owner_user_id) {
        const { addRole } = await import("@/server/auth.server");
        await addRole(pharm.owner_user_id, "pharmacy_staff");
      }
    }

    await prisma.audit_logs.create({
      data: {
        actor_user_id: userId,
        action: `pharmacy_${data.decision}`,
        entity: "pharmacy",
        entity_id: data.pharmacyId,
      },
    });
    return { ok: true };
  });

async function requireAdmin(userId: string) {
  const { isAdmin } = await import("@/server/authz.server");
  if (!(await isAdmin(userId))) throw new Error("Accès admin requis");
}

export const searchPlacesPharmaciesAdmin = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ query: z.string().min(2).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await requireAdmin(userId);
    const { prisma } = await import("@/server/db.server");

    const gmapsKey = googleMapsKey();

    const res = await fetch(`${PLACES_API}/places:searchText`, {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": gmapsKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.rating",
      },
      body: JSON.stringify({
        textQuery: `pharmacie ${data.query}`,
        includedType: "pharmacy",
        maxResultCount: 15,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Places (${res.status}): ${body.slice(0, 200)}`);
    }
    const payload = (await res.json()) as { places?: PlaceResult[] };
    const places = payload.places ?? [];
    const ids = places.map((p) => p.id);

    const existing =
      ids.length > 0
        ? await prisma.pharmacies.findMany({
            where: { google_place_id: { in: ids } },
            select: { id: true, google_place_id: true },
          })
        : [];
    const existingMap = new Map(existing.map((e) => [e.google_place_id, e.id]));

    return {
      places: places.map((p) => ({
        placeId: p.id,
        name: p.displayName?.text ?? "Pharmacie",
        address: p.formattedAddress ?? "",
        phone: p.nationalPhoneNumber ?? null,
        rating: p.rating ?? null,
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
        localPharmacyId: existingMap.get(p.id) ?? null,
      })),
    };
  });

export const registerPlacePharmacyAdmin = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        placeId: z.string().min(1),
        name: z.string().min(1),
        address: z.string().min(1),
        phone: z.string().nullable(),
        lat: z.number().nullable(),
        lng: z.number().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await requireAdmin(userId);
    const { prisma } = await import("@/server/db.server");

    const existing = await prisma.pharmacies.findFirst({
      where: { google_place_id: data.placeId },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };

    let inserted: { id: string };
    try {
      inserted = await prisma.pharmacies.create({
        data: {
          owner_user_id: null,
          name: data.name,
          address: data.address,
          phone: data.phone,
          lat: data.lat,
          lng: data.lng,
          license_number: `GMAPS-${data.placeId.slice(0, 20)}`,
          google_place_id: data.placeId,
          status: "approved",
        },
        select: { id: true },
      });
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Erreur");
    }

    await prisma.audit_logs.create({
      data: {
        actor_user_id: userId,
        action: "pharmacy_registered_from_places",
        entity: "pharmacy",
        entity_id: inserted.id,
        meta: { place_id: data.placeId },
      },
    });

    return { id: inserted.id, created: true };
  });
