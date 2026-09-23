/**
 * Back-office administrateur : lectures qui passaient auparavant directement
 * par un accès direct à la base dans les pages d'administration.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/integrations/auth/middleware";
import { toPlain } from "@/server/serialize";

/** L'utilisateur connecté est-il administrateur ? */
export const getIsAdmin = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await import("@/server/authz.server");
    return { isAdmin: await isAdmin(context.userId) };
  });

/** Tableau de bord : liste des pharmacies + compteurs globaux. */
export const getAdminDashboard = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { prisma } = await import("@/server/db.server");
    const { assertAdmin } = await import("@/server/authz.server");
    await assertAdmin(context.userId);

    const [pharmacies, couriers, approvedPharmacies, all] = await Promise.all([
      prisma.pharmacies.findMany({
        select: {
          id: true,
          name: true,
          license_number: true,
          address: true,
          city: true,
          status: true,
          created_at: true,
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.couriers.count({ where: { status: "approved" } }),
      prisma.pharmacies.count({ where: { status: "approved" } }),
      prisma.reservations.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    let active = 0;
    let delivered = 0;
    for (const g of all) {
      if (g.status === "completed") delivered += g._count._all;
      if (!["completed", "cancelled", "rejected"].includes(g.status)) active += g._count._all;
    }

    return {
      pharmacies: toPlain(pharmacies),
      global: { pharmacies: approvedPharmacies, couriers, active, delivered },
    };
  });

/** Liste des livreurs (admin). */
export const listCouriersAdmin = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { prisma } = await import("@/server/db.server");
    const { assertAdmin } = await import("@/server/authz.server");
    await assertAdmin(context.userId);
    const rows = await prisma.couriers.findMany({
      select: {
        id: true,
        full_name: true,
        phone: true,
        vehicle_type: true,
        license_number: true,
        status: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
    });
    return toPlain(rows);
  });

/** Pharmacies approuvées (sélecteur de la page « Stocks des pharmacies »). */
export const listApprovedPharmacies = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async () => {
    const { prisma } = await import("@/server/db.server");
    const rows = await prisma.pharmacies.findMany({
      where: { status: "approved" },
      select: { id: true, name: true, address: true, city: true },
      orderBy: { name: "asc" },
    });
    return toPlain(rows);
  });
