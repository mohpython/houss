/**
 * Core routing / dispatch logic — server only.
 * Shared by the web app (authenticated server fns) and the WhatsApp bot.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db.server";
import { rxDateStatus } from "./date-utils";
import {
  matchItemsToInventory,
  linkPrescriptionItemsToCatalog,
  type InventoryLine,
} from "./medicine-match.server";

/** Another partner pharmacy able to supply a medicine missing from the chosen one. */
export type MissingAlternative = {
  pharmacyId: string;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  distanceKm: number;
  price: number | null;
};

export type MissingItem = {
  itemId: string;
  name: string;
  alternatives: MissingAlternative[];
};

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Flat delivery fee, in FCFA. Source unique : `payment-config.ts`. */
import { DELIVERY_FEE } from "./payment-config";
export { DELIVERY_FEE };

export type AutoRouteInput = {
  prescriptionId: string;
  patientId: string;
  patientLat: number;
  patientLng: number;
  patientAddress?: string | null;
  /** Chosen neighborhood (quartier) when delivering somewhere other than the GPS position. */
  neighborhoodId?: string | null;
  deliveryMode?: "gps" | "neighborhood";
  notes?: string | null;
  source?: string;
};

export type DeliveryTarget = {
  lat: number;
  lng: number;
  address: string | null;
  neighborhoodId: string | null;
  deliveryMode: "gps" | "neighborhood";
};

/**
 * Resolves the delivery point. When a neighborhood is given, its coordinates
 * (read server-side) take precedence over anything the client sent.
 */
export async function resolveDeliveryTarget(input: {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  neighborhoodId?: string | null;
}): Promise<DeliveryTarget> {
  if (input.neighborhoodId) {
    const nb = await prisma.neighborhoods.findFirst({
      where: { id: input.neighborhoodId },
      select: { id: true, name: true, city: true, lat: true, lng: true, is_active: true },
    });
    if (!nb || !nb.is_active) throw new Error("Quartier de livraison introuvable");
    const detail = (input.address ?? "").trim();
    return {
      lat: nb.lat,
      lng: nb.lng,
      address: detail ? `Quartier ${nb.name} — ${detail}` : `Quartier ${nb.name}`,
      neighborhoodId: nb.id,
      deliveryMode: "neighborhood",
    };
  }
  if (input.lat == null || input.lng == null) throw new Error("Position de livraison requise");
  return {
    lat: input.lat,
    lng: input.lng,
    address: input.address ?? null,
    neighborhoodId: null,
    deliveryMode: "gps",
  };
}

export type AutoRouteResult = {
  reservationId: string;
  pharmacyName: string;
  pharmacyPhone: string | null;
  pharmacyAddress: string | null;
  matchedCount: number;
  missingCount: number;
  isPartial: boolean;
  distanceKm: number;
  itemsTotal: number;
  deliveryFee: number;
  totalAmount: number;
  missingItems: MissingItem[];
};

/**
 * Picks the closest approved pharmacy holding 100% of the prescribed items in
 * stock and creates the reservation. Throws when no pharmacy can serve it.
 */
export async function autoRouteCore(input: AutoRouteInput): Promise<AutoRouteResult> {
  const rx = await prisma.prescriptions.findUnique({
    where: { id: input.prescriptionId },
    select: { id: true, patient_id: true, prescription_date: true },
  });
  if (!rx || rx.patient_id !== input.patientId) throw new Error("Ordonnance introuvable");

  const dateStatus = rxDateStatus(
    rx.prescription_date ? rx.prescription_date.toISOString().slice(0, 10) : null,
  );
  if (dateStatus === "expired") {
    throw new Error(
      "Cette ordonnance a plus de 3 mois : elle est expirée et ne peut plus être envoyée à une pharmacie.",
    );
  }
  if (dateStatus === "future") {
    throw new Error("La date de cette ordonnance est invalide (dans le futur).");
  }

  const itemSelect = {
    id: true,
    medicine_name_raw: true,
    strength: true,
    normalized_medicine_id: true,
  } as const;
  let items = await prisma.prescription_items.findMany({
    where: { prescription_id: input.prescriptionId },
    select: itemSelect,
  });

  if (!items || items.length === 0) throw new Error("Aucun médicament extrait");

  // Make sure every line is linked to the catalog (stable results across runs).
  if (items.some((i) => !i.normalized_medicine_id)) {
    await linkPrescriptionItemsToCatalog(input.prescriptionId);
    const relinked = await prisma.prescription_items.findMany({
      where: { prescription_id: input.prescriptionId },
      select: itemSelect,
    });
    if (relinked.length > 0) items = relinked;
  }

  const pharmacies = await prisma.pharmacies.findMany({
    where: { status: "approved", lat: { not: null }, lng: { not: null } },
    select: { id: true, name: true, lat: true, lng: true, address: true, phone: true },
  });

  if (pharmacies.length === 0) {
    throw new Error("Aucune pharmacie enregistrée disponible");
  }

  const pharmIds = pharmacies.map((p) => p.id);
  const inv = await prisma.inventory.findMany({
    where: { pharmacy_id: { in: pharmIds } },
    select: {
      pharmacy_id: true,
      stock_qty: true,
      price: true,
      medicines: { select: { id: true, normalized_name: true, generic_name: true } },
    },
  });
  const invLines = inv as unknown as Array<InventoryLine & { pharmacy_id: string }>;

  type Matched = { itemId: string; name: string; price: number | null };

  type ScoreEntry = {
    pharmacy: (typeof pharmacies)[number];
    matched: Matched[];
    missing: { itemId: string; name: string }[];
    distanceKm: number;
  };

  const scored: ScoreEntry[] = pharmacies.map((p) => {
    const pInv = invLines.filter((i) => i.pharmacy_id === p.id);
    const avail = matchItemsToInventory(items!, pInv);
    const matched: Matched[] = avail
      .filter((a) => a.available)
      .map((a) => ({ itemId: a.itemId, name: a.name, price: a.price }));
    const missing = avail
      .filter((a) => !a.available)
      .map((a) => ({ itemId: a.itemId, name: a.name }));
    return {
      pharmacy: p,
      matched,
      missing,
      distanceKm: haversineKm(input.patientLat, input.patientLng, p.lat!, p.lng!),
    };
  });

  const fullMatches = scored.filter((s) => s.missing.length === 0);
  fullMatches.sort(
    (a, b) => a.distanceKm - b.distanceKm || a.pharmacy.id.localeCompare(b.pharmacy.id),
  );

  // Priorité : pharmacie la plus proche ayant 100% des médicaments.
  // Sinon, celle qui en a le plus (à nombre égal, la plus proche).
  const partialMatches = scored
    .filter((s) => s.matched.length > 0)
    .sort(
      (a, b) =>
        b.matched.length - a.matched.length ||
        a.distanceKm - b.distanceKm ||
        a.pharmacy.id.localeCompare(b.pharmacy.id),
    );

  const best = fullMatches[0] ?? partialMatches[0];
  if (!best) {
    throw new Error("Aucune pharmacie partenaire n'a vos médicaments en stock");
  }

  // For each missing medicine, list the other partner pharmacies that have it
  // (even far away) so the patient can order it there himself.
  const missingItems: MissingItem[] = best.missing.map((m) => {
    const alternatives: MissingAlternative[] = scored
      .filter((s) => s.pharmacy.id !== best.pharmacy.id)
      .map((s) => ({ s, hit: s.matched.find((x) => x.itemId === m.itemId) }))
      .filter((x) => !!x.hit)
      .sort((a, b) => a.s.distanceKm - b.s.distanceKm)
      .slice(0, 3)
      .map(({ s, hit }) => ({
        pharmacyId: s.pharmacy.id,
        name: s.pharmacy.name,
        address: s.pharmacy.address,
        phone: s.pharmacy.phone,
        lat: s.pharmacy.lat,
        lng: s.pharmacy.lng,
        distanceKm: Math.round(s.distanceKm * 10) / 10,
        price: hit!.price,
      }));
    return { itemId: m.itemId, name: m.name, alternatives };
  });

  const itemsTotal = best.matched.reduce((sum, m) => sum + (m.price ?? 0), 0);
  const deliveryFee = DELIVERY_FEE;
  const totalAmount = itemsTotal + deliveryFee;

  let res: { id: string };
  try {
    res = await prisma.reservations.create({
      data: {
        prescription_id: input.prescriptionId,
        patient_id: input.patientId,
        pharmacy_id: best.pharmacy.id,
        status: "pending",
        notes: input.notes ?? null,
        is_partial: best.missing.length > 0,
        missing_items: JSON.parse(JSON.stringify(missingItems)) as Prisma.InputJsonValue,
        patient_lat: input.patientLat,
        patient_lng: input.patientLng,
        patient_address: input.patientAddress ?? null,
        neighborhood_id: input.neighborhoodId ?? null,
        delivery_mode: input.deliveryMode ?? "gps",
        delivery_status: "unassigned",
        source: input.source ?? "app",
        items_total: itemsTotal,
        delivery_fee: deliveryFee,
        total_amount: totalAmount,
        payment_status: "unpaid",
      },
      select: { id: true },
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Erreur réservation");
  }

  if (best.matched.length > 0) {
    await prisma.reservation_items.createMany({
      data: best.matched.map((m) => ({
        reservation_id: res.id,
        prescription_item_id: m.itemId,
        unit_price: m.price,
      })),
    });
  }

  await prisma.audit_logs.create({
    data: {
      actor_user_id: input.patientId,
      action: "reservation_auto_routed",
      entity: "reservation",
      entity_id: res.id,
      meta: {
        pharmacy_id: best.pharmacy.id,
        matched: best.matched.length,
        missing: best.missing.length,
        distance_km: best.distanceKm,
        source: input.source ?? "app",
      },
    },
  });

  return {
    reservationId: res.id,
    pharmacyName: best.pharmacy.name,
    pharmacyPhone: best.pharmacy.phone,
    pharmacyAddress: best.pharmacy.address,
    matchedCount: best.matched.length,
    missingCount: best.missing.length,
    isPartial: best.missing.length > 0,
    distanceKm: best.distanceKm,
    itemsTotal,
    deliveryFee,
    totalAmount,
    missingItems,
  };
}

/** Assigns the closest online approved courier. Returns null when none is available. */
export async function assignCourierCore(
  reservationId: string,
  actorUserId: string,
): Promise<{ courierId: string; courierName: string } | null> {
  const res = await prisma.reservations.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      pharmacy_id: true,
      courier_id: true,
      fulfillment_method: true,
      pharmacies: { select: { lat: true, lng: true } },
    },
  });
  if (!res || res.courier_id || res.fulfillment_method === "pickup") return null;
  const pharm = res.pharmacies;
  if (!pharm?.lat || !pharm?.lng) return null;
  const pharmLat = pharm.lat;
  const pharmLng = pharm.lng;

  const couriers = await prisma.couriers.findMany({
    where: {
      status: "approved",
      is_online: true,
      current_lat: { not: null },
      current_lng: { not: null },
    },
    select: { id: true, full_name: true, current_lat: true, current_lng: true },
  });
  if (couriers.length === 0) return null;

  const best = couriers
    .map((c) => ({ c, d: haversineKm(pharmLat, pharmLng, c.current_lat!, c.current_lng!) }))
    .sort((a, b) => a.d - b.d)[0]!.c;

  try {
    await prisma.reservations.update({
      where: { id: reservationId },
      data: {
        courier_id: best.id,
        delivery_status: "assigned",
        assigned_at: new Date(),
      },
    });
  } catch {
    return null;
  }

  await prisma.audit_logs.create({
    data: {
      actor_user_id: actorUserId,
      action: "courier_assigned",
      entity: "reservation",
      entity_id: reservationId,
      meta: { courier_id: best.id },
    },
  });

  return { courierId: best.id, courierName: best.full_name };
}
