import { createServerFn } from "@tanstack/react-start";
import type { Prisma, app_role } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { toPlain } from "@/server/serialize";

const ROLES = ["patient", "pharmacy_staff", "courier", "doctor", "nurse", "admin"] as const;

const CATEGORIES = [
  "all",
  "auth",
  "prescription",
  "reservation",
  "delivery",
  "payment",
  "pharmacy",
  "admin",
] as const;

const inputSchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  role: z
    .enum(["all", ...ROLES, "system"])
    .optional()
    .default("all"),
  category: z.enum(CATEGORIES).optional().default("all"),
  /// 0 = tout l'historique.
  days: z.number().int().min(0).max(365).optional().default(7),
  limit: z.number().int().min(1).max(500).optional().default(300),
});

/** Filtre Prisma correspondant à une catégorie d'actions. */
function categoryWhere(category: (typeof CATEGORIES)[number]): Prisma.audit_logsWhereInput | null {
  switch (category) {
    case "auth":
      return { action: { startsWith: "auth." } };
    case "prescription":
      return {
        OR: [
          { action: { startsWith: "prescription" } },
          { action: { startsWith: "pharmacy_search" } },
        ],
      };
    case "reservation":
      return { action: { startsWith: "reservation" } };
    case "delivery":
      return {
        OR: [
          { action: { startsWith: "delivery" } },
          { action: { startsWith: "courier" } },
          { action: { startsWith: "fulfillment" } },
        ],
      };
    case "payment":
      return { action: { startsWith: "payment" } };
    case "pharmacy":
      return {
        AND: [
          { action: { startsWith: "pharmacy" } },
          { NOT: { action: { startsWith: "pharmacy_search" } } },
        ],
      };
    case "admin":
      return {
        OR: [
          { action: { startsWith: "admin" } },
          { action: { startsWith: "practitioner" } },
          { action: { startsWith: "neighborhood" } },
          { action: { startsWith: "inventory" } },
        ],
      };
    default:
      return null;
  }
}

/**
 * Journal d'activité (admin) : toutes les actions de `audit_logs`, avec
 * l'auteur, ses rôles et la cible. Filtres : recherche, rôle, catégorie,
 * période. Les compteurs sont calculés sur la période + recherche + catégorie,
 * indépendamment du filtre de rôle, pour rester comparables.
 */
export const listAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const { assertAdmin } = await import("@/server/authz.server");
    await assertAdmin(context.userId);

    const and: Prisma.audit_logsWhereInput[] = [];

    if (data.days > 0) {
      and.push({
        created_at: { gte: new Date(Date.now() - data.days * 86_400_000) },
      });
    }

    const q = data.q.trim();
    if (q) {
      and.push({
        OR: [
          { action: { contains: q, mode: "insensitive" } },
          { entity: { contains: q, mode: "insensitive" } },
          { actor: { is: { email: { contains: q, mode: "insensitive" } } } },
          { actor: { is: { phone: { contains: q } } } },
          {
            actor: {
              is: {
                profile: {
                  is: { full_name: { contains: q, mode: "insensitive" } },
                },
              },
            },
          },
        ],
      });
    }

    const cat = categoryWhere(data.category);
    if (cat) and.push(cat);

    const baseWhere: Prisma.audit_logsWhereInput = and.length ? { AND: and } : {};

    const where: Prisma.audit_logsWhereInput = { ...baseWhere };
    if (data.role === "system") {
      where.actor_user_id = null;
    } else if (data.role !== "all") {
      where.actor = {
        is: { user_roles: { some: { role: data.role as app_role } } },
      };
    }

    const roleCount = (role: app_role) =>
      prisma.audit_logs.count({
        where: {
          AND: [baseWhere, { actor: { is: { user_roles: { some: { role } } } } }],
        },
      });

    const [rows, total, patients, pharmacies, couriers, system] = await Promise.all([
      prisma.audit_logs.findMany({
        where,
        select: {
          id: true,
          action: true,
          entity: true,
          entity_id: true,
          meta: true,
          created_at: true,
          actor: {
            select: {
              id: true,
              email: true,
              phone: true,
              profile: { select: { full_name: true } },
              user_roles: { select: { role: true } },
            },
          },
        },
        orderBy: { created_at: "desc" },
        take: data.limit,
      }),
      prisma.audit_logs.count({ where: baseWhere }),
      roleCount("patient"),
      roleCount("pharmacy_staff"),
      roleCount("courier"),
      prisma.audit_logs.count({
        where: { AND: [baseWhere, { actor_user_id: null }] },
      }),
    ]);

    return toPlain({
      rows: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        entity_id: row.entity_id,
        meta: row.meta,
        created_at: row.created_at,
        actor: row.actor
          ? {
              id: row.actor.id,
              email: row.actor.email,
              phone: row.actor.phone,
              full_name: row.actor.profile?.full_name ?? null,
              roles: row.actor.user_roles.map((r) => r.role),
            }
          : null,
      })),
      counts: { total, patients, pharmacies, couriers, system },
    });
  });

export type AuditLogRow = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  meta: unknown;
  created_at: string;
  actor: {
    id: string;
    email: string | null;
    phone: string | null;
    full_name: string | null;
    roles: string[];
  } | null;
};

export type AuditLogCounts = {
  total: number;
  patients: number;
  pharmacies: number;
  couriers: number;
  system: number;
};

export type AuditLogsResult = {
  rows: AuditLogRow[];
  counts: AuditLogCounts;
};
