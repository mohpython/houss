/**
 * Lecture des commandes côté patient (remplace les anciens accès directs
 * à la base depuis les pages /app/reservations).
 * Les droits reproduisent l'ancienne RLS.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { toPlain } from "@/server/serialize";

const idInput = (input: unknown) => z.object({ id: z.string().uuid() }).parse(input);

/** Commandes du patient connecté, les plus récentes d'abord. */
export const listMyReservations = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { prisma } = await import("@/server/db.server");
    const { canViewPharmacy } = await import("./reservation-rules.server");
    const rows = await prisma.reservations.findMany({
      where: { patient_id: context.userId },
      select: {
        id: true,
        status: true,
        created_at: true,
        pharmacies: { select: { name: true, address: true, status: true, owner_user_id: true } },
      },
      orderBy: { created_at: "desc" },
    });
    const out = [];
    for (const r of rows) {
      const ph = r.pharmacies;
      out.push({
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        pharmacies: (await canViewPharmacy(context.userId, ph))
          ? { name: ph.name, address: ph.address }
          : null,
      });
    }
    return toPlain(out);
  });

/** Détail d'une commande (null si introuvable ou non autorisée). */
export const getReservationDetail = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const { reservationAccess } = await import("@/server/authz.server");
    const { canViewPharmacy, canViewPrescriptionItems } =
      await import("./reservation-rules.server");
    const r = await prisma.reservations.findUnique({
      where: { id: data.id },
      select: {
        id: true,
        status: true,
        notes: true,
        patient_id: true,
        pharmacy_id: true,
        prescription_id: true,
        payment_status: true,
        created_at: true,
        accepted_at: true,
        ready_at: true,
        assigned_at: true,
        picked_up_at: true,
        delivered_at: true,
        delivery_status: true,
        fulfillment_method: true,
        courier_id: true,
        pharmacies: {
          select: { name: true, address: true, phone: true, status: true, owner_user_id: true },
        },
        reservation_items: {
          select: {
            id: true,
            prescription_items: {
              select: { medicine_name_raw: true, strength: true, quantity: true },
            },
          },
        },
      },
    });
    if (!r || !(await reservationAccess(context.userId, r)).canRead) return null;
    const { pharmacy_id, prescription_id, payment_status, pharmacies, reservation_items, ...rest } =
      r;
    void pharmacy_id;
    void payment_status;
    const itemsVisible = await canViewPrescriptionItems(context.userId, prescription_id);
    return toPlain({
      ...rest,
      pharmacies: (await canViewPharmacy(context.userId, pharmacies))
        ? { name: pharmacies.name, address: pharmacies.address, phone: pharmacies.phone }
        : null,
      reservation_items: reservation_items.map((i) => ({
        id: i.id,
        prescription_items: itemsVisible ? i.prescription_items : null,
      })),
    });
  });

/** Données de l'écran de paiement (null si introuvable ou non autorisée). */
export const getReservationCheckout = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator(idInput)
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
        items_total: true,
        delivery_fee: true,
        total_amount: true,
        payment_status: true,
        fulfillment_method: true,
        patient_address: true,
        patient_phone: true,
        is_partial: true,
        missing_items: true,
        prescription_id: true,
        neighborhood_id: true,
        patient_lat: true,
        patient_lng: true,
        pharmacies: { select: { name: true, address: true, status: true, owner_user_id: true } },
        reservation_items: {
          select: {
            id: true,
            unit_price: true,
            prescription_items: { select: { medicine_name_raw: true, strength: true } },
          },
        },
      },
    });
    if (!r || !(await reservationAccess(context.userId, r)).canRead) return null;
    const { patient_id, pharmacy_id, courier_id, pharmacies, reservation_items, ...rest } = r;
    void patient_id;
    void pharmacy_id;
    void courier_id;
    const itemsVisible = await canViewPrescriptionItems(context.userId, r.prescription_id);
    return toPlain({
      ...rest,
      pharmacies: (await canViewPharmacy(context.userId, pharmacies))
        ? { name: pharmacies.name, address: pharmacies.address }
        : null,
      reservation_items: reservation_items.map((i) => ({
        id: i.id,
        unit_price: i.unit_price,
        prescription_items: itemsVisible ? i.prescription_items : null,
      })),
    });
  });

/** Données de l'écran de suivi (null si introuvable ou non autorisée). */
export const getReservationTracking = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const { reservationAccess } = await import("@/server/authz.server");
    const { canViewPharmacy, canViewCourier } = await import("./reservation-rules.server");
    const r = await prisma.reservations.findUnique({
      where: { id: data.id },
      select: {
        id: true,
        patient_id: true,
        pharmacy_id: true,
        payment_status: true,
        status: true,
        delivery_status: true,
        is_partial: true,
        missing_items: true,
        prescription_id: true,
        neighborhood_id: true,
        patient_address: true,
        patient_lat: true,
        patient_lng: true,
        courier_id: true,
        fulfillment_method: true,
        pickup_code: true,
        receipt_code: true,
        pharmacies: {
          select: {
            name: true,
            lat: true,
            lng: true,
            address: true,
            phone: true,
            status: true,
            owner_user_id: true,
          },
        },
        couriers: {
          select: {
            id: true,
            full_name: true,
            phone: true,
            current_lat: true,
            current_lng: true,
            vehicle_type: true,
          },
        },
      },
    });
    if (!r || !(await reservationAccess(context.userId, r)).canRead) return null;
    const { patient_id, pharmacy_id, payment_status, pharmacies, couriers, ...rest } = r;
    void patient_id;
    void pharmacy_id;
    void payment_status;
    return toPlain({
      ...rest,
      pharmacies:
        pharmacies && (await canViewPharmacy(context.userId, pharmacies))
          ? {
              name: pharmacies.name,
              lat: pharmacies.lat,
              lng: pharmacies.lng,
              address: pharmacies.address,
              phone: pharmacies.phone,
            }
          : null,
      couriers: couriers && (await canViewCourier(context.userId, couriers.id)) ? couriers : null,
    });
  });
