/**
 * Commissions SAHA : part de la plateforme sur les médicaments vendus par les
 * pharmacies, plus les frais de commande. La pharmacie encaisse directement
 * auprès du patient (Orange Money) : SAHA pointe les commissions dues et les
 * réclame ensuite — il n'y a pas de prélèvement automatique.
 *
 * Le taux est configurable par pharmacie (admin). Il est figé au moment de la
 * commande dans `reservations.commission_rate` / `commission_amount`, donc un
 * changement de taux n'affecte pas les commandes en cours.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { toPlain } from "@/server/serialize";

/** Taux max accepté pour une pharmacie (50 % de sécurité). */
const MAX_RATE = 0.5;

/** Vérifie que l'utilisateur peut voir les commissions d'une pharmacie : membre ou admin. */
async function assertCanViewCommissions(userId: string, pharmacyId: string) {
  const { prisma } = await import("@/server/db.server");
  const { isPharmacyMember, isAdmin } = await import("@/server/authz.server");
  const ph = await prisma.pharmacies.findUnique({
    where: { id: pharmacyId },
    select: { name: true, status: true, commission_rate: true },
  });
  if (!ph) throw new Error("Pharmacie introuvable");
  if (await isAdmin(userId)) return ph;
  if (!(await isPharmacyMember(userId, pharmacyId))) throw new Error("Pharmacie introuvable");
  return ph;
}

/** Commissions d'une pharmacie : dû, réglé, historique, détail par commande. */
export const getPharmacyCommissions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ pharmacyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const ph = await assertCanViewCommissions(context.userId, data.pharmacyId);

    const [orders, payoutsAgg, payouts] = await Promise.all([
      prisma.reservations.findMany({
        where: { pharmacy_id: data.pharmacyId, payment_status: "paid" },
        select: {
          id: true,
          created_at: true,
          items_total: true,
          commission_rate: true,
          commission_amount: true,
          order_fee: true,
          platform_payout_id: true,
        },
        orderBy: { created_at: "desc" },
        take: 100,
      }),
      prisma.platform_commission_payouts.aggregate({
        where: { pharmacy_id: data.pharmacyId },
        _sum: { amount: true, orders_count: true },
      }),
      prisma.platform_commission_payouts.findMany({
        where: { pharmacy_id: data.pharmacyId },
        select: { id: true, amount: true, orders_count: true, created_at: true },
        orderBy: { created_at: "desc" },
        take: 10,
      }),
    ]);

    const items = orders.map((o) => {
      const due = Number(o.commission_amount ?? 0) + Number(o.order_fee ?? 0);
      return {
        id: o.id,
        created_at: o.created_at,
        items_total: Number(o.items_total ?? 0),
        commission_rate: Number(o.commission_rate ?? 0),
        commission_amount: Number(o.commission_amount ?? 0),
        order_fee: Number(o.order_fee ?? 0),
        due,
        settled: Boolean(o.platform_payout_id),
      };
    });

    const outstanding = items.filter((o) => !o.settled).reduce((s, o) => s + o.due, 0);
    const collected = Number(payoutsAgg._sum.amount ?? 0);

    return toPlain({
      pharmacy: {
        id: data.pharmacyId,
        name: ph.name,
        status: ph.status,
        commission_rate: Number(ph.commission_rate ?? 0.05),
      },
      summary: {
        outstanding,
        collected,
        outstandingOrders: items.filter((o) => !o.settled).length,
        collectedOrders: Number(payoutsAgg._sum.orders_count ?? 0),
      },
      orders: items,
      payouts,
    });
  });

/** Synthèse admin : dû et réglé par pharmacie, triée par dû croissant. */
export const listPlatformCommissions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { prisma } = await import("@/server/db.server");
    const { assertAdmin } = await import("@/server/authz.server");
    await assertAdmin(context.userId);

    const [pharmacies, grouped, collectedAgg] = await Promise.all([
      prisma.pharmacies.findMany({
        select: { id: true, name: true, status: true, commission_rate: true },
        orderBy: { name: "asc" },
      }),
      prisma.reservations.groupBy({
        by: ["pharmacy_id", "platform_payout_id"],
        where: { payment_status: "paid" },
        _sum: { commission_amount: true, order_fee: true },
        _count: { _all: true },
      }),
      prisma.platform_commission_payouts.groupBy({
        by: ["pharmacy_id"],
        _sum: { amount: true, orders_count: true },
      }),
    ]);

    const byPharmacy = new Map<
      string,
      { outstanding: number; collected: number; outstandingOrders: number; collectedOrders: number }
    >();
    for (const g of grouped) {
      const entry = byPharmacy.get(g.pharmacy_id) ?? {
        outstanding: 0,
        collected: 0,
        outstandingOrders: 0,
        collectedOrders: 0,
      };
      const amount = Number(g._sum.commission_amount ?? 0) + Number(g._sum.order_fee ?? 0);
      const count = g._count._all;
      if (g.platform_payout_id === null) {
        entry.outstanding += amount;
        entry.outstandingOrders += count;
      } else {
        entry.collected += amount;
        entry.collectedOrders += count;
      }
      byPharmacy.set(g.pharmacy_id, entry);
    }
    for (const g of collectedAgg) {
      const entry = byPharmacy.get(g.pharmacy_id) ?? {
        outstanding: 0,
        collected: 0,
        outstandingOrders: 0,
        collectedOrders: 0,
      };
      entry.collected = Number(g._sum.amount ?? 0);
      entry.collectedOrders = Number(g._sum.orders_count ?? 0);
      byPharmacy.set(g.pharmacy_id, entry);
    }

    const rows = pharmacies
      .map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        commission_rate: Number(p.commission_rate ?? 0.05),
        ...(byPharmacy.get(p.id) ?? {
          outstanding: 0,
          collected: 0,
          outstandingOrders: 0,
          collectedOrders: 0,
        }),
      }))
      .sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name));

    const totals = rows.reduce(
      (acc, r) => ({
        outstanding: acc.outstanding + r.outstanding,
        collected: acc.collected + r.collected,
      }),
      { outstanding: 0, collected: 0 },
    );

    return toPlain({ rows, totals });
  });

/** Marque les commissions d'une pharmacie comme réglées (admin). */
export const markCommissionsCollected = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        pharmacyId: z.string().uuid(),
        note: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const { assertAdmin } = await import("@/server/authz.server");
    await assertAdmin(context.userId);

    const outstanding = await prisma.reservations.findMany({
      where: { pharmacy_id: data.pharmacyId, payment_status: "paid", platform_payout_id: null },
      select: { id: true, commission_amount: true, order_fee: true },
    });
    if (outstanding.length === 0) throw new Error("Aucune commission à régler");

    const amount = outstanding.reduce(
      (sum, o) => sum + Number(o.commission_amount ?? 0) + Number(o.order_fee ?? 0),
      0,
    );

    const payout = await prisma.platform_commission_payouts.create({
      data: {
        pharmacy_id: data.pharmacyId,
        amount,
        orders_count: outstanding.length,
        created_by: context.userId,
        note: data.note ?? null,
      },
    });
    await prisma.reservations.updateMany({
      where: { id: { in: outstanding.map((o) => o.id) } },
      data: { platform_payout_id: payout.id },
    });
    await prisma.audit_logs.create({
      data: {
        actor_user_id: context.userId,
        action: "commissions_collected",
        entity: "pharmacy",
        entity_id: data.pharmacyId,
        meta: { amount, orders: outstanding.length, payoutId: payout.id },
      },
    });
    return { amount, ordersCount: outstanding.length, payoutId: payout.id };
  });

/** Modifie le taux de commission d'une pharmacie (admin uniquement). */
export const setPharmacyCommissionRate = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        pharmacyId: z.string().uuid(),
        rate: z.number().min(0).max(MAX_RATE),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const { assertAdmin } = await import("@/server/authz.server");
    await assertAdmin(context.userId);
    const rate = Math.round(data.rate * 10000) / 10000;
    await prisma.pharmacies.update({
      where: { id: data.pharmacyId },
      data: { commission_rate: rate },
    });
    await prisma.audit_logs.create({
      data: {
        actor_user_id: context.userId,
        action: "commission_rate_updated",
        entity: "pharmacy",
        entity_id: data.pharmacyId,
        meta: { rate },
      },
    });
    return { rate };
  });
