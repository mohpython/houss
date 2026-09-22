import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { toPlain } from "@/server/serialize";

export type PatientRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  language: string;
  roles: string[];
  created_at: string;
  last_sign_in_at: string | null;
  neighborhood: string | null;
  orders_count: number;
  last_order_at: string | null;
  source: string | null;
};

export type PatientOrder = {
  id: string;
  created_at: string;
  source: string;
  status: string;
  delivery_status: string;
  fulfillment_method: string;
  total_amount: number;
  payment_status: string;
  pharmacy: string | null;
  neighborhood: string | null;
  patient_address: string | null;
};

/** All registered users with roles, last delivery neighborhood and order counts. */
export const listPatients = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { prisma } = await import("@/server/db.server");
    const { assertAdmin } = await import("@/server/authz.server");
    await assertAdmin(context.userId);

    const [rawUsers, profiles, roles, rawOrders] = await Promise.all([
      prisma.users.findMany({
        select: {
          id: true,
          email: true,
          created_at: true,
          last_sign_in_at: true,
          raw_user_meta_data: true,
        },
        orderBy: { created_at: "asc" },
        take: 4000,
      }),
      prisma.profiles.findMany({
        select: { id: true, full_name: true, phone: true, language: true },
      }),
      prisma.user_roles.findMany({ select: { user_id: true, role: true } }),
      prisma.reservations.findMany({
        select: { patient_id: true, created_at: true, neighborhoods: { select: { name: true } } },
        orderBy: { created_at: "desc" },
        take: 5000,
      }),
    ]);
    const users = rawUsers.map((u) => {
      const meta = (u.raw_user_meta_data ?? {}) as Record<string, unknown>;
      return {
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at.toISOString(),
        last_sign_in_at: u.last_sign_in_at ? u.last_sign_in_at.toISOString() : null,
        source: typeof meta.source === "string" ? meta.source : null,
      };
    });
    const orders = toPlain(rawOrders);

    const profMap = new Map(profiles.map((p) => [p.id, p]));
    const roleMap = new Map<string, string[]>();
    for (const r of roles) roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
    const orderMap = new Map<
      string,
      { count: number; last: string; neighborhood: string | null }
    >();
    for (const o of orders) {
      const nb = o.neighborhoods;
      const cur = orderMap.get(o.patient_id);
      if (cur) {
        cur.count += 1;
        if (!cur.neighborhood && nb?.name) cur.neighborhood = nb.name;
      } else {
        orderMap.set(o.patient_id, {
          count: 1,
          last: o.created_at,
          neighborhood: nb?.name ?? null,
        });
      }
    }

    const rows: PatientRow[] = users.map((u) => {
      const p = profMap.get(u.id);
      const o = orderMap.get(u.id);
      return {
        user_id: u.id,
        email: u.email,
        full_name: p?.full_name ?? null,
        phone: p?.phone ?? null,
        language: p?.language ?? "fr",
        roles: roleMap.get(u.id) ?? [],
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        neighborhood: o?.neighborhood ?? null,
        orders_count: o?.count ?? 0,
        last_order_at: o?.last ?? null,
        source: u.source,
      };
    });
    rows.sort((a, b) =>
      (b.last_order_at ?? b.created_at).localeCompare(a.last_order_at ?? a.created_at),
    );
    return rows;
  });

/** Order history of one user. */
export const getPatientOrders = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const { assertAdmin } = await import("@/server/authz.server");
    await assertAdmin(context.userId);
    const rows = toPlain(
      await prisma.reservations.findMany({
        where: { patient_id: data.userId },
        select: {
          id: true,
          created_at: true,
          source: true,
          status: true,
          delivery_status: true,
          fulfillment_method: true,
          total_amount: true,
          payment_status: true,
          patient_address: true,
          pharmacies: { select: { name: true } },
          neighborhoods: { select: { name: true } },
        },
        orderBy: { created_at: "desc" },
        take: 100,
      }),
    );
    return rows.map((r): PatientOrder => {
      return {
        id: r.id,
        created_at: r.created_at,
        source: r.source,
        status: r.status,
        delivery_status: r.delivery_status,
        fulfillment_method: r.fulfillment_method,
        total_amount: Number(r.total_amount ?? 0),
        payment_status: r.payment_status,
        pharmacy: r.pharmacies?.name ?? null,
        neighborhood: r.neighborhoods?.name ?? null,
        patient_address: r.patient_address,
      };
    });
  });

/** Grant or revoke the admin role for a user (professional roles are managed on their own pages). */
export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), admin: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const { assertAdmin } = await import("@/server/authz.server");
    await assertAdmin(context.userId);
    if (!data.admin && data.userId === context.userId) {
      throw new Error("Vous ne pouvez pas retirer votre propre rôle admin");
    }
    if (data.admin) {
      await prisma.user_roles.upsert({
        where: { user_id_role: { user_id: data.userId, role: "admin" } },
        create: { user_id: data.userId, role: "admin" },
        update: {},
      });
    } else {
      await prisma.user_roles.deleteMany({ where: { user_id: data.userId, role: "admin" } });
    }
    await prisma.audit_logs.create({
      data: {
        actor_user_id: context.userId,
        action: data.admin ? "admin.grant" : "admin.revoke",
        entity: "user_roles",
        entity_id: data.userId,
      },
    });
    return { ok: true };
  });
