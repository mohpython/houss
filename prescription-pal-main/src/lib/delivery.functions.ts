import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { encodePolyline } from "@/lib/osmap";

/**
 * Auto-routes a prescription to the closest approved pharmacy that has the most items in stock.
 * Creates a reservation + reservation_items for available items, stores missing ones.
 */
export const autoRouteReservation = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
    const { userId } = context;
    const { autoRouteCore, resolveDeliveryTarget } = await import("./routing-core.server");
    const target = await resolveDeliveryTarget({
      lat: data.patientLat,
      lng: data.patientLng,
      address: data.patientAddress,
      neighborhoodId: data.neighborhoodId,
    });
    return autoRouteCore({
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
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ reservationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const { reservationAccess } = await import("@/server/authz.server");
    const { haversineKm } = await import("./routing-core.server");
    const { updateReservationAs } = await import("./reservation-rules.server");

    const res = await prisma.reservations.findUnique({
      where: { id: data.reservationId },
      select: {
        id: true,
        patient_id: true,
        pharmacy_id: true,
        courier_id: true,
        payment_status: true,
        fulfillment_method: true,
        pharmacies: { select: { lat: true, lng: true } },
      },
    });
    if (!res || !(await reservationAccess(userId, res)).canRead) {
      throw new Error("Réservation introuvable");
    }
    if (res.courier_id) throw new Error("Livreur déjà assigné");
    if (res.fulfillment_method === "pickup")
      throw new Error("Le client récupère lui-même sa commande");
    const pharm = res.pharmacies;
    if (!pharm?.lat || !pharm?.lng) throw new Error("Pharmacie sans coordonnées");
    const pharmLat = pharm.lat;
    const pharmLng = pharm.lng;

    const couriers = await prisma.couriers.findMany({
      where: {
        status: "approved",
        is_online: true,
        current_lat: { not: null },
        current_lng: { not: null },
      },
      select: { id: true, full_name: true, phone: true, current_lat: true, current_lng: true },
    });

    if (couriers.length === 0) {
      throw new Error("Aucun livreur en ligne pour le moment");
    }

    const sorted = couriers
      .map((c) => ({
        c,
        d: haversineKm(pharmLat, pharmLng, c.current_lat!, c.current_lng!),
      }))
      .sort((a, b) => a.d - b.d);
    const best = sorted[0]!.c;

    await updateReservationAs(userId, data.reservationId, {
      courier_id: best.id,
      delivery_status: "assigned",
      assigned_at: new Date(),
      status: "ready",
    });

    await prisma.audit_logs.create({
      data: {
        actor_user_id: userId,
        action: "courier_assigned",
        entity: "reservation",
        entity_id: data.reservationId,
        meta: { courier_id: best.id },
      },
    });

    return { courierId: best.id, courierName: best.full_name };
  });

export const updateCourierPosition = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const courier = await prisma.couriers.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!courier) throw new Error("Livreur introuvable");

    await prisma.couriers.update({
      where: { id: courier.id },
      data: {
        current_lat: data.lat,
        current_lng: data.lng,
        last_position_at: new Date(),
      },
    });

    if (data.reservationId) {
      // Les erreurs d'insertion étaient ignorées auparavant.
      await prisma.courier_positions
        .create({
          data: {
            courier_id: courier.id,
            reservation_id: data.reservationId,
            lat: data.lat,
            lng: data.lng,
          },
        })
        .catch(() => undefined);
    }
    return { ok: true };
  });

export const updateDeliveryStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reservationId: z.string().uuid(),
        status: z.enum(["picked_up", "en_route", "delivered", "failed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const { updateReservationAs } = await import("./reservation-rules.server");
    const patch: {
      delivery_status: "picked_up" | "en_route" | "delivered" | "failed";
      picked_up_at?: Date;
      delivered_at?: Date;
      status?: "completed";
    } = { delivery_status: data.status };
    if (data.status === "picked_up") patch.picked_up_at = new Date();
    if (data.status === "delivered") {
      patch.delivered_at = new Date();
      patch.status = "completed";
    }

    await updateReservationAs(userId, data.reservationId, patch);

    await prisma.audit_logs.create({
      data: {
        actor_user_id: userId,
        action: `delivery_${data.status}`,
        entity: "reservation",
        entity_id: data.reservationId,
      },
    });
    return { ok: true };
  });

export const setCourierOnline = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const patch: {
      is_online: boolean;
      current_lat?: number;
      current_lng?: number;
      last_position_at?: Date;
    } = { is_online: data.online };
    if (data.lat !== undefined && data.lng !== undefined) {
      patch.current_lat = data.lat;
      patch.current_lng = data.lng;
      patch.last_position_at = new Date();
    }

    await prisma.couriers.updateMany({ where: { user_id: userId }, data: patch });
    return { ok: true };
  });

export const registerCourier = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const existing = await prisma.couriers.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (existing) throw new Error("Vous êtes déjà inscrit comme livreur");

    await prisma.couriers.create({
      data: {
        user_id: userId,
        full_name: data.fullName,
        phone: data.phone,
        vehicle_type: data.vehicleType,
        license_number: data.licenseNumber ?? null,
      },
    });
    return { ok: true };
  });

export const approveCourier = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        courierId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const { isAdmin } = await import("@/server/authz.server");
    if (!(await isAdmin(userId))) throw new Error("Réservé aux admins");

    const courier = await prisma.couriers.findUnique({
      where: { id: data.courierId },
      select: { user_id: true },
    });
    if (!courier) throw new Error("Livreur introuvable");

    await prisma.couriers.update({
      where: { id: data.courierId },
      data: { status: data.decision },
    });

    if (data.decision === "approved") {
      await prisma.user_roles.upsert({
        where: { user_id_role: { user_id: courier.user_id, role: "courier" } },
        create: { user_id: courier.user_id, role: "courier" },
        update: {},
      });
    }
    return { ok: true };
  });

/**
 * Itinéraire entre deux points via OSRM public (OpenStreetMap, sans clé),
 * renvoie la polyline encodée (format Google) + durée/distance.
 */
export const getDeliveryRoute = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${data.originLng},${data.originLat},${data.destLng},${data.destLat}` +
      `?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM (${res.status})`);
    const payload = (await res.json()) as {
      routes?: Array<{
        geometry?: { coordinates?: number[][] };
        duration?: number;
        distance?: number;
      }>;
    };
    const r = payload.routes?.[0];
    if (!r?.geometry?.coordinates) {
      return { polyline: null, durationSeconds: null, distanceMeters: null };
    }
    // GeoJSON est en [lng, lat] : on inverse pour obtenir des points lat/lng.
    const points = r.geometry.coordinates.map((c) => ({ lat: c[1], lng: c[0] }));
    return {
      polyline: encodePolyline(points),
      durationSeconds: r.duration != null ? Math.round(r.duration) : null,
      distanceMeters: r.distance != null ? Math.round(r.distance) : null,
    };
  });

/** Admin: supprimer définitivement un livreur. */
export const deleteCourier = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ courierId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const { isAdmin } = await import("@/server/authz.server");
    if (!(await isAdmin(context.userId))) throw new Error("Réservé aux admins");

    const courier = await prisma.couriers.findUnique({
      where: { id: data.courierId },
      select: { id: true, user_id: true },
    });
    if (!courier) throw new Error("Livreur introuvable");

    const activeCount = await prisma.reservations.count({
      where: {
        courier_id: data.courierId,
        delivery_status: { in: ["assigned", "picked_up", "en_route"] },
      },
    });
    if (activeCount > 0) {
      throw new Error("Ce livreur a des livraisons en cours : terminez-les avant de le supprimer.");
    }

    await prisma.reservations.updateMany({
      where: { courier_id: data.courierId },
      data: { courier_id: null },
    });
    await prisma.courier_positions.deleteMany({ where: { courier_id: data.courierId } });

    await prisma.couriers.delete({ where: { id: data.courierId } });

    await prisma.user_roles.deleteMany({
      where: { user_id: courier.user_id, role: "courier" },
    });

    await prisma.audit_logs.create({
      data: {
        actor_user_id: context.userId,
        action: "courier.delete",
        entity: "couriers",
        entity_id: data.courierId,
        meta: {},
      },
    });

    return { ok: true };
  });
