import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

/**
 * Auto-routes a prescription to the closest approved pharmacy that has the most items in stock.
 * Creates a reservation + reservation_items for available items, stores missing ones.
 */
export const autoRouteReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prescriptionId: z.string().uuid(),
        patientLat: z.number().min(-90).max(90).optional(),
        patientLng: z.number().min(-180).max(180).optional(),
        patientAddress: z.string().max(500).optional(),
        neighborhoodId: z.string().uuid().optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { autoRouteCore, resolveDeliveryTarget } = await import("./routing-core.server");
    const target = await resolveDeliveryTarget(supabase, {
      lat: data.patientLat,
      lng: data.patientLng,
      address: data.patientAddress,
      neighborhoodId: data.neighborhoodId,
    });
    return autoRouteCore(supabase, {
      prescriptionId: data.prescriptionId,
      patientId: userId,
      patientLat: target.lat,
      patientLng: target.lng,
      patientAddress: target.address,
      neighborhoodId: target.neighborhoodId,
      deliveryMode: target.deliveryMode,
      notes: data.notes ?? null,
      source: "app",
    });
  });


/**
 * Assigns the closest online approved courier to a reservation.
 */
export const assignCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ reservationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: res } = await supabase
      .from("reservations")
      .select("id, pharmacy_id, courier_id, fulfillment_method, pharmacies(lat, lng)")
      .eq("id", data.reservationId)
      .single();
    if (!res) throw new Error("Réservation introuvable");
    if (res.courier_id) throw new Error("Livreur déjà assigné");
    if (res.fulfillment_method === "pickup")
      throw new Error("Le client récupère lui-même sa commande");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pharm = (res as any).pharmacies;
    if (!pharm?.lat || !pharm?.lng) throw new Error("Pharmacie sans coordonnées");

    const { data: couriers } = await supabase
      .from("couriers")
      .select("id, full_name, phone, current_lat, current_lng")
      .eq("status", "approved")
      .eq("is_online", true)
      .not("current_lat", "is", null)
      .not("current_lng", "is", null);

    if (!couriers || couriers.length === 0) {
      throw new Error("Aucun livreur en ligne pour le moment");
    }

    const sorted = couriers
      .map((c) => ({
        c,
        d: haversine(pharm.lat, pharm.lng, c.current_lat!, c.current_lng!),
      }))
      .sort((a, b) => a.d - b.d);
    const best = sorted[0]!.c;

    const { error } = await supabase
      .from("reservations")
      .update({
        courier_id: best.id,
        delivery_status: "assigned",
        assigned_at: new Date().toISOString(),
        status: "ready",
      })
      .eq("id", data.reservationId);
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      action: "courier_assigned",
      entity: "reservation",
      entity_id: data.reservationId,
      meta: { courier_id: best.id },
    });

    return { courierId: best.id, courierName: best.full_name };
  });

export const updateCourierPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        reservationId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: courier } = await supabase
      .from("couriers")
      .select("id")
      .eq("user_id", userId)
      .single();
    if (!courier) throw new Error("Livreur introuvable");

    await supabase
      .from("couriers")
      .update({
        current_lat: data.lat,
        current_lng: data.lng,
        last_position_at: new Date().toISOString(),
      })
      .eq("id", courier.id);

    if (data.reservationId) {
      await supabase.from("courier_positions").insert({
        courier_id: courier.id,
        reservation_id: data.reservationId,
        lat: data.lat,
        lng: data.lng,
      });
    }
    return { ok: true };
  });

export const updateDeliveryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reservationId: z.string().uuid(),
        status: z.enum(["picked_up", "en_route", "delivered", "failed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: {
      delivery_status: "picked_up" | "en_route" | "delivered" | "failed";
      picked_up_at?: string;
      delivered_at?: string;
      status?: "completed";
    } = { delivery_status: data.status };
    if (data.status === "picked_up") patch.picked_up_at = new Date().toISOString();
    if (data.status === "delivered") {
      patch.delivered_at = new Date().toISOString();
      patch.status = "completed";
    }

    const { error } = await supabase
      .from("reservations")
      .update(patch)
      .eq("id", data.reservationId);
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      action: `delivery_${data.status}`,
      entity: "reservation",
      entity_id: data.reservationId,
    });
    return { ok: true };
  });

export const setCourierOnline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        online: z.boolean(),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: {
      is_online: boolean;
      current_lat?: number;
      current_lng?: number;
      last_position_at?: string;
    } = { is_online: data.online };
    if (data.lat !== undefined && data.lng !== undefined) {
      patch.current_lat = data.lat;
      patch.current_lng = data.lng;
      patch.last_position_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("couriers")
      .update(patch)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const registerCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        fullName: z.string().min(2).max(120),
        phone: z.string().min(6).max(30),
        vehicleType: z.string().min(2).max(30),
        licenseNumber: z.string().max(60).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("couriers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) throw new Error("Vous êtes déjà inscrit comme livreur");

    const { error } = await supabase.from("couriers").insert({
      user_id: userId,
      full_name: data.fullName,
      phone: data.phone,
      vehicle_type: data.vehicleType,
      license_number: data.licenseNumber ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const approveCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        courierId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: adminRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRow) throw new Error("Réservé aux admins");

    const { data: courier } = await supabase
      .from("couriers")
      .select("user_id")
      .eq("id", data.courierId)
      .single();
    if (!courier) throw new Error("Livreur introuvable");

    const { error } = await supabase
      .from("couriers")
      .update({ status: data.decision })
      .eq("id", data.courierId);
    if (error) throw new Error(error.message);

    if (data.decision === "approved") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: courier.user_id, role: "courier" }, { onConflict: "user_id,role" });
    }
    return { ok: true };
  });

/**
 * Google Directions route between two points, returns encoded polyline + duration/distance.
 */
export const getDeliveryRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        originLat: z.number(),
        originLng: z.number(),
        destLat: z.number(),
        destLng: z.number(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    const gmapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey || !gmapsKey) throw new Error("Google Maps non configuré");

    const res = await fetch(
      "https://connector-gateway.lovable.dev/google_maps/routes/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-Connection-Api-Key": gmapsKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": "routes.polyline.encodedPolyline,routes.duration,routes.distanceMeters",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: data.originLat, longitude: data.originLng } } },
          destination: { location: { latLng: { latitude: data.destLat, longitude: data.destLng } } },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Routes API (${res.status}): ${body.slice(0, 200)}`);
    }
    const payload = (await res.json()) as {
      routes?: Array<{
        polyline?: { encodedPolyline?: string };
        duration?: string;
        distanceMeters?: number;
      }>;
    };
    const r = payload.routes?.[0];
    return {
      polyline: r?.polyline?.encodedPolyline ?? null,
      durationSeconds: r?.duration ? parseInt(r.duration.replace("s", ""), 10) : null,
      distanceMeters: r?.distanceMeters ?? null,
    };
  });

/** Admin: supprimer définitivement un livreur. */
export const deleteCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ courierId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: adminRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRow) throw new Error("Réservé aux admins");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: courier } = await supabaseAdmin
      .from("couriers")
      .select("id, user_id")
      .eq("id", data.courierId)
      .maybeSingle();
    if (!courier) throw new Error("Livreur introuvable");

    const { count: activeCount } = await supabaseAdmin
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("courier_id", data.courierId)
      .in("delivery_status", ["assigned", "picked_up", "en_route"]);
    if ((activeCount ?? 0) > 0) {
      throw new Error("Ce livreur a des livraisons en cours : terminez-les avant de le supprimer.");
    }

    await supabaseAdmin
      .from("reservations")
      .update({ courier_id: null })
      .eq("courier_id", data.courierId);
    await supabaseAdmin.from("courier_positions").delete().eq("courier_id", data.courierId);

    const { error } = await supabaseAdmin.from("couriers").delete().eq("id", data.courierId);
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", courier.user_id)
      .eq("role", "courier");

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: context.userId,
      action: "courier.delete",
      entity: "couriers",
      entity_id: data.courierId,
      meta: {},
    });

    return { ok: true };
  });
