/**
 * Espace livreur (remplace les anciens accès directs à la base depuis les pages
 * /app/courier). Les droits reproduisent l'ancienne RLS.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { toPlain } from "@/server/serialize";

/** Profil livreur de l'utilisateur connecté (null s'il n'est pas inscrit). */
export const getMyCourier = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { prisma } = await import("@/server/db.server");
    const c = await prisma.couriers.findUnique({
      where: { user_id: context.userId },
      select: { id: true, status: true, is_online: true, full_name: true },
    });
    return c ? toPlain(c) : null;
  });

/** État de l'inscription livreur : profil existant et gestion d'une pharmacie. */
export const getCourierOnboardingState = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { prisma } = await import("@/server/db.server");
    const [courier, owned, staff] = await Promise.all([
      prisma.couriers.findUnique({
        where: { user_id: context.userId },
        select: { status: true },
      }),
      prisma.pharmacies.findFirst({
        where: { owner_user_id: context.userId },
        select: { id: true },
      }),
      prisma.pharmacy_staff.findFirst({
        where: { user_id: context.userId },
        select: { id: true },
      }),
    ]);
    return { courier: courier ? toPlain(courier) : null, isPharmacy: !!owned || !!staff };
  });

/** Livraisons actives du livreur connecté + nombre de livraisons terminées. */
export const listMyDeliveries = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { prisma } = await import("@/server/db.server");
    const { canViewPharmacy } = await import("./reservation-rules.server");
    const courier = await prisma.couriers.findUnique({
      where: { user_id: context.userId },
      select: { id: true },
    });
    if (!courier) return { deliveries: [], done: 0 };
    const [active, done] = await Promise.all([
      prisma.reservations.findMany({
        where: {
          courier_id: courier.id,
          delivery_status: { in: ["assigned", "picked_up", "en_route"] },
        },
        select: {
          id: true,
          delivery_status: true,
          patient_address: true,
          patient_lat: true,
          patient_lng: true,
          created_at: true,
          assigned_at: true,
          pharmacies: {
            select: {
              name: true,
              address: true,
              lat: true,
              lng: true,
              status: true,
              owner_user_id: true,
            },
          },
        },
        // Postgres (ordre décroissant) place les valeurs nulles en premier.
        orderBy: { assigned_at: { sort: "desc", nulls: "first" } },
      }),
      prisma.reservations.count({
        where: { courier_id: courier.id, delivery_status: "delivered" },
      }),
    ]);
    const deliveries = [];
    for (const r of active) {
      const { pharmacies: ph, ...rest } = r;
      deliveries.push({
        ...rest,
        pharmacies: (await canViewPharmacy(context.userId, ph))
          ? { name: ph.name, address: ph.address, lat: ph.lat, lng: ph.lng }
          : null,
      });
    }
    return { deliveries: toPlain(deliveries), done };
  });

/** Détail d'une course (null si introuvable ou non autorisée). */
export const getCourierDelivery = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const { reservationAccess } = await import("@/server/authz.server");
    const { canViewPharmacy, canViewPrescriptionItems } =
      await import("./reservation-rules.server");
    const r = await prisma.reservations.findUnique({
      where: { id: data.id },
      select: {
        id: true,
        patient_id: true,
        pharmacy_id: true,
        courier_id: true,
        payment_status: true,
        prescription_id: true,
        delivery_status: true,
        patient_lat: true,
        patient_lng: true,
        patient_address: true,
        patient_name: true,
        patient_phone: true,
        pickup_code: true,
        pickup_code_verified_at: true,
        receipt_code_verified_at: true,
        pharmacies: {
          select: {
            name: true,
            address: true,
            phone: true,
            lat: true,
            lng: true,
            status: true,
            owner_user_id: true,
          },
        },
        reservation_items: {
          select: {
            prescription_items: {
              select: { medicine_name_raw: true, strength: true, quantity: true },
            },
          },
        },
      },
    });
    if (!r || !(await reservationAccess(context.userId, r)).canRead) return null;
    const {
      patient_id,
      pharmacy_id,
      courier_id,
      payment_status,
      prescription_id,
      pharmacies: ph,
      reservation_items,
      ...rest
    } = r;
    void patient_id;
    void pharmacy_id;
    void courier_id;
    void payment_status;
    // Ancienne RLS : les lignes d'ordonnance ne sont lisibles que par le patient ou un admin.
    const itemsVisible = await canViewPrescriptionItems(context.userId, prescription_id);
    return toPlain({
      ...rest,
      pharmacies: (await canViewPharmacy(context.userId, ph))
        ? { name: ph.name, address: ph.address, phone: ph.phone, lat: ph.lat, lng: ph.lng }
        : null,
      reservation_items: reservation_items.map((i) => ({
        prescription_items: itemsVisible ? i.prescription_items : null,
      })),
    });
  });
