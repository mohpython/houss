/**
 * Core routing / dispatch logic — server only.
 * Shared by the web app (authenticated server fns) and the WhatsApp bot.
 */
import type { AnySupabase } from "./rx-core.server";
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
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Flat delivery fee, in FCFA. */
export const DELIVERY_FEE = 1000;

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
export async function resolveDeliveryTarget(
  supabase: AnySupabase,
  input: {
    lat?: number | null;
    lng?: number | null;
    address?: string | null;
    neighborhoodId?: string | null;
  },
): Promise<DeliveryTarget> {
  if (input.neighborhoodId) {
    const { data: nb } = await supabase
      .from("neighborhoods")
      .select("id, name, city, lat, lng, is_active")
      .eq("id", input.neighborhoodId)
      .maybeSingle();
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
export async function autoRouteCore(
  supabase: AnySupabase,
  input: AutoRouteInput,
): Promise<AutoRouteResult> {
  const { data: rx } = await supabase
    .from("prescriptions")
    .select("id, patient_id, prescription_date")
    .eq("id", input.prescriptionId)
    .single();
  if (!rx || rx.patient_id !== input.patientId) throw new Error("Ordonnance introuvable");

  const dateStatus = rxDateStatus(rx.prescription_date);
  if (dateStatus === "expired") {
    throw new Error(
      "Cette ordonnance a plus de 3 mois : elle est expirée et ne peut plus être envoyée à une pharmacie.",
    );
  }
  if (dateStatus === "future") {
    throw new Error("La date de cette ordonnance est invalide (dans le futur).");
  }

  let { data: items } = await supabase
    .from("prescription_items")
    .select("id, medicine_name_raw, strength, normalized_medicine_id")
    .eq("prescription_id", input.prescriptionId);

  if (!items || items.length === 0) throw new Error("Aucun médicament extrait");

  // Make sure every line is linked to the catalog (stable results across runs).
  if (items.some((i) => !i.normalized_medicine_id)) {
    await linkPrescriptionItemsToCatalog(supabase, input.prescriptionId);
    const { data: relinked } = await supabase
      .from("prescription_items")
      .select("id, medicine_name_raw, strength, normalized_medicine_id")
      .eq("prescription_id", input.prescriptionId);
    if (relinked && relinked.length > 0) items = relinked;
  }

  const { data: pharmacies } = await supabase
    .from("pharmacies")
    .select("id, name, lat, lng, address, phone")
    .eq("status", "approved")
    .not("lat", "is", null)
    .not("lng", "is", null);

  if (!pharmacies || pharmacies.length === 0) {
    throw new Error("Aucune pharmacie enregistrée disponible");
  }

  const pharmIds = pharmacies.map((p) => p.id);
  const { data: inv } = await supabase
    .from("inventory")
    .select("pharmacy_id, stock_qty, price, medicines(id, normalized_name, generic_name)")
    .in("pharmacy_id", pharmIds);
  const invLines = (inv ?? []) as unknown as Array<InventoryLine & { pharmacy_id: string }>;

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
    const missing = avail.filter((a) => !a.available).map((a) => ({ itemId: a.itemId, name: a.name }));
    return {
      pharmacy: p,
      matched,
      missing,
      distanceKm: haversineKm(input.patientLat, input.patientLng, p.lat!, p.lng!),
    };
  });

  const fullMatches = scored.filter((s) => s.missing.length === 0);
  fullMatches.sort((a, b) => a.distanceKm - b.distanceKm || a.pharmacy.id.localeCompare(b.pharmacy.id));

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

  const { data: res, error } = await supabase
    .from("reservations")
    .insert({
      prescription_id: input.prescriptionId,
      patient_id: input.patientId,
      pharmacy_id: best.pharmacy.id,
      status: "pending",
      notes: input.notes ?? null,
      is_partial: best.missing.length > 0,
      missing_items: JSON.parse(JSON.stringify(missingItems)),
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
    })
    .select("id")
    .single();
  if (error || !res) throw new Error(error?.message ?? "Erreur réservation");

  if (best.matched.length > 0) {
    await supabase.from("reservation_items").insert(
      best.matched.map((m) => ({
        reservation_id: res.id,
        prescription_item_id: m.itemId,
        unit_price: m.price,
      })),
    );
  }


  await supabase.from("audit_logs").insert({
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
  supabase: AnySupabase,
  reservationId: string,
  actorUserId: string,
): Promise<{ courierId: string; courierName: string } | null> {
  const { data: res } = await supabase
    .from("reservations")
    .select("id, pharmacy_id, courier_id, fulfillment_method, pharmacies(lat, lng)")
    .eq("id", reservationId)
    .single();
  if (!res || res.courier_id || res.fulfillment_method === "pickup") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pharm = (res as any).pharmacies;
  if (!pharm?.lat || !pharm?.lng) return null;

  const { data: couriers } = await supabase
    .from("couriers")
    .select("id, full_name, current_lat, current_lng")
    .eq("status", "approved")
    .eq("is_online", true)
    .not("current_lat", "is", null)
    .not("current_lng", "is", null);
  if (!couriers || couriers.length === 0) return null;

  const best = couriers
    .map((c) => ({ c, d: haversineKm(pharm.lat, pharm.lng, c.current_lat!, c.current_lng!) }))
    .sort((a, b) => a.d - b.d)[0]!.c;

  const { error } = await supabase
    .from("reservations")
    .update({
      courier_id: best.id,
      delivery_status: "assigned",
      assigned_at: new Date().toISOString(),
    })
    .eq("id", reservationId);
  if (error) return null;

  await supabase.from("audit_logs").insert({
    actor_user_id: actorUserId,
    action: "courier_assigned",
    entity: "reservation",
    entity_id: reservationId,
    meta: { courier_id: best.id },
  });

  return { courierId: best.id, courierName: best.full_name };
}
