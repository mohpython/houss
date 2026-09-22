import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { InventoryLine } from "./medicine-match.server";



export const extractPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ prescriptionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: rx } = await supabase
      .from("prescriptions")
      .select("id")
      .eq("id", data.prescriptionId)
      .eq("patient_id", userId)
      .maybeSingle();
    if (!rx) throw new Error("Ordonnance introuvable");

    const { extractPrescriptionCore } = await import("./rx-core.server");
    return extractPrescriptionCore(supabase, userId, data.prescriptionId);
  });


export const findNearbyPharmacies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    const { supabase, userId } = context;
    const { matchItemsToInventory } = await import("./medicine-match.server");

    const { data: items } = await supabase
      .from("prescription_items")
      .select("id, medicine_name_raw, strength, normalized_medicine_id")
      .eq("prescription_id", data.prescriptionId);

    if (!items || items.length === 0) return { pharmacies: [] };

    // Load approved pharmacies (patients only see approved via RLS)
    const { data: pharmacies, error } = await supabase
      .from("pharmacies")
      .select("id, name, address, city, lat, lng, phone, opening_hours, rating");
    if (error) throw error;
    if (!pharmacies) return { pharmacies: [] };

    // Load inventory joined with medicines for these pharmacies
    const pharmIds = pharmacies.map((p) => p.id);
    const { data: inv } = await supabase
      .from("inventory")
      .select("pharmacy_id, stock_qty, price, medicines(id, normalized_name, generic_name, strength)")
      .in("pharmacy_id", pharmIds);

    const enriched = pharmacies.map((p) => {
      const pharmInv = (inv ?? []).filter((i) => i.pharmacy_id === p.id);
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

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      action: "pharmacy_search",
      entity: "prescription",
      entity_id: data.prescriptionId,
      meta: { pharmacy_count: enriched.length },
    });

    return { pharmacies: enriched };
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
  .middleware([requireSupabaseAuth])
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
    const { supabase, userId } = context;
    const { matchItemsToInventory } = await import("./medicine-match.server");

    const apiKey = process.env.LOVABLE_API_KEY;
    const gmapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey || !gmapsKey) throw new Error("Google Maps non configuré");

    const { data: items } = await supabase
      .from("prescription_items")
      .select("id, medicine_name_raw, strength, normalized_medicine_id")
      .eq("prescription_id", data.prescriptionId);
    const rxItems = items ?? [];

    const radius = data.radiusMeters ?? 5000;

    const res = await fetch(
      "https://connector-gateway.lovable.dev/google_maps/places/v1/places:searchNearby",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-Connection-Api-Key": gmapsKey,
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
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Places (${res.status}): ${body.slice(0, 200)}`);
    }

    const payload = (await res.json()) as { places?: PlaceResult[] };
    const places = payload.places ?? [];
    const placeIds = places.map((p) => p.id);

    // Match against locally registered pharmacies
    const { data: localPharms } = await supabase
      .from("pharmacies")
      .select("id, google_place_id")
      .in("google_place_id", placeIds.length > 0 ? placeIds : ["__none__"]);

    const localIds = (localPharms ?? []).map((p) => p.id);
    const { data: inv } = await supabase
      .from("inventory")
      .select("pharmacy_id, stock_qty, price, medicines(id, normalized_name, generic_name)")
      .in("pharmacy_id", localIds.length > 0 ? localIds : ["00000000-0000-0000-0000-000000000000"]);

    const results = places.map((p) => {
      const local = (localPharms ?? []).find((lp) => lp.google_place_id === p.id);
      const pharmInv = local ? (inv ?? []).filter((i) => i.pharmacy_id === local.id) : [];
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
    const { data: extraLocal } = await supabase
      .from("pharmacies")
      .select("id, name, address, phone, lat, lng, rating, google_place_id")
      .eq("status", "approved");
    const extras = (extraLocal ?? [])
      .filter((lp) => {
        if (lp.google_place_id && placeIdSet.has(lp.google_place_id)) return false;
        if (lp.lat == null || lp.lng == null) return false;
        const d = haversine(data.lat, data.lng, lp.lat, lp.lng);
        return d <= radiusKm;
      })
      .map((lp) => {
        const pharmInv = (inv ?? []).filter((i) => i.pharmacy_id === lp.id);
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
          mapsUri: lp.lat != null && lp.lng != null
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
      .filter((e) => !(inv ?? []).some((i) => i.pharmacy_id === e.localPharmacyId))
      .map((e) => e.localPharmacyId!);
    if (missingInvIds.length > 0) {
      const { data: inv2 } = await supabase
        .from("inventory")
        .select("pharmacy_id, stock_qty, price, medicines(id, normalized_name, generic_name)")
        .in("pharmacy_id", missingInvIds);
      for (const e of extras) {
        const pharmInv = (inv2 ?? []).filter((i) => i.pharmacy_id === e.localPharmacyId);
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

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      action: "pharmacy_search_places",
      entity: "prescription",
      entity_id: data.prescriptionId,
      meta: { count: results.length, radius },
    });

    return { pharmacies: results };
  });

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
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

export const createReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    const { supabase, userId } = context;
    const { matchItemsToInventory } = await import("./medicine-match.server");

    const { data: rx } = await supabase
      .from("prescriptions")
      .select("id, patient_id")
      .eq("id", data.prescriptionId)
      .maybeSingle();
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
        ? await resolveDeliveryTarget(supabase, {
            lat: data.patientLat,
            lng: data.patientLng,
            address: data.patientAddress,
            neighborhoodId: data.neighborhoodId,
          })
        : null;
    const { data: chosen } = await supabase
      .from("prescription_items")
      .select("id, medicine_name_raw, normalized_medicine_id")
      .in("id", data.itemIds.length > 0 ? data.itemIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: inv } = await supabase
      .from("inventory")
      .select("stock_qty, price, medicines(id, normalized_name, generic_name)")
      .eq("pharmacy_id", data.pharmacyId);

    const availability = matchItemsToInventory(chosen ?? [], (inv ?? []) as unknown as InventoryLine[]);
    const prices = new Map<string, number | null>(availability.map((a) => [a.itemId, a.price]));
    const itemsTotal = [...prices.values()].reduce<number>((s, p) => s + (p ?? 0), 0);

    const { data: res, error } = await supabase
      .from("reservations")
      .insert({
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
      })
      .select("id")
      .single();
    if (error || !res) throw new Error(error?.message ?? "Erreur de réservation");

    if (data.itemIds.length > 0) {
      await supabase.from("reservation_items").insert(
        data.itemIds.map((id) => ({
          reservation_id: res.id,
          prescription_item_id: id,
          unit_price: prices.get(id) ?? null,
        })),
      );
    }


    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      action: "reservation_created",
      entity: "reservation",
      entity_id: res.id,
      meta: { pharmacy_id: data.pharmacyId, item_count: data.itemIds.length },
    });

    return { id: res.id };
  });

export const respondToReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reservationId: z.string().uuid(),
        decision: z.enum(["accepted", "rejected", "ready", "completed", "cancelled"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: {
      status: typeof data.decision;
      accepted_at?: string;
      ready_at?: string;
      delivered_at?: string;
    } = { status: data.decision };
    if (data.decision === "accepted") patch.accepted_at = new Date().toISOString();
    if (data.decision === "ready") patch.ready_at = new Date().toISOString();
    if (data.decision === "completed") patch.delivered_at = new Date().toISOString();
    const { error } = await supabase
      .from("reservations")
      .update(patch)
      .eq("id", data.reservationId);
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      action: `reservation_${data.decision}`,
      entity: "reservation",
      entity_id: data.reservationId,
    });
    return { ok: true };
  });

export const approvePharmacy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        pharmacyId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: adminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRow) throw new Error("Accès admin requis");

    const { error } = await supabase
      .from("pharmacies")
      .update({ status: data.decision })
      .eq("id", data.pharmacyId);
    if (error) throw new Error(error.message);

    if (data.decision === "approved") {
      // Grant pharmacy_staff role to owner (if the pharmacy has been claimed)
      const { data: pharm } = await supabase
        .from("pharmacies")
        .select("owner_user_id")
        .eq("id", data.pharmacyId)
        .single();
      if (pharm?.owner_user_id) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: pharm.owner_user_id, role: "pharmacy_staff" })
          .select();
      }
    }

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      action: `pharmacy_${data.decision}`,
      entity: "pharmacy",
      entity_id: data.pharmacyId,
    });
    return { ok: true };
  });

async function requireAdmin(supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Accès admin requis");
}

export const searchPlacesPharmaciesAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().min(2).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await requireAdmin(supabase as any, userId);

    const apiKey = process.env.LOVABLE_API_KEY;
    const gmapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey || !gmapsKey) throw new Error("Google Maps non configuré");

    const res = await fetch(
      "https://connector-gateway.lovable.dev/google_maps/places/v1/places:searchText",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-Connection-Api-Key": gmapsKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.rating",
        },
        body: JSON.stringify({
          textQuery: `pharmacie ${data.query}`,
          includedType: "pharmacy",
          maxResultCount: 15,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Places (${res.status}): ${body.slice(0, 200)}`);
    }
    const payload = (await res.json()) as { places?: PlaceResult[] };
    const places = payload.places ?? [];
    const ids = places.map((p) => p.id);

    const { data: existing } = await supabase
      .from("pharmacies")
      .select("id, google_place_id")
      .in("google_place_id", ids.length > 0 ? ids : ["__none__"]);
    const existingMap = new Map((existing ?? []).map((e) => [e.google_place_id, e.id]));

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
  .middleware([requireSupabaseAuth])
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
    const { supabase, userId } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await requireAdmin(supabase as any, userId);

    const { data: existing } = await supabase
      .from("pharmacies")
      .select("id")
      .eq("google_place_id", data.placeId)
      .maybeSingle();
    if (existing) return { id: existing.id, created: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error } = await supabaseAdmin
      .from("pharmacies")
      .insert({
        owner_user_id: null,
        name: data.name,
        address: data.address,
        phone: data.phone,
        lat: data.lat,
        lng: data.lng,
        license_number: `GMAPS-${data.placeId.slice(0, 20)}`,
        google_place_id: data.placeId,
        status: "approved",
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Erreur");

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      action: "pharmacy_registered_from_places",
      entity: "pharmacy",
      entity_id: inserted.id,
      meta: { place_id: data.placeId },
    });

    return { id: inserted.id, created: true };
  });
