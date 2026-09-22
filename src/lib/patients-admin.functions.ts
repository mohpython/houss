import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data: row } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!row) throw new Error("Accès réservé aux administrateurs");
}

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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const users: { id: string; email: string | null; created_at: string; last_sign_in_at: string | null; source: string | null }[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      for (const u of data.users) {
        users.push({
          id: u.id,
          email: u.email ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
          source: (u.user_metadata?.source as string | undefined) ?? null,
        });
      }
      if (data.users.length < 200) break;
    }

    const [{ data: profiles }, { data: roles }, { data: orders }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, phone, language"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin
        .from("reservations")
        .select("patient_id, created_at, neighborhoods(name)")
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);

    const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const roleMap = new Map<string, string[]>();
    for (const r of roles ?? []) roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
    const orderMap = new Map<string, { count: number; last: string; neighborhood: string | null }>();
    for (const o of orders ?? []) {
      const nb = (o as unknown as { neighborhoods: { name: string } | null }).neighborhoods;
      const cur = orderMap.get(o.patient_id);
      if (cur) {
        cur.count += 1;
        if (!cur.neighborhood && nb?.name) cur.neighborhood = nb.name;
      } else {
        orderMap.set(o.patient_id, { count: 1, last: o.created_at, neighborhood: nb?.name ?? null });
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
    rows.sort((a, b) => (b.last_order_at ?? b.created_at).localeCompare(a.last_order_at ?? a.created_at));
    return rows;
  });

/** Order history of one user. */
export const getPatientOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("reservations")
      .select(
        "id, created_at, source, status, delivery_status, fulfillment_method, total_amount, payment_status, patient_address, pharmacies(name), neighborhoods(name)",
      )
      .eq("patient_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r): PatientOrder => {
      const row = r as unknown as Record<string, unknown>;
      return {
        id: r.id,
        created_at: r.created_at,
        source: r.source,
        status: r.status,
        delivery_status: r.delivery_status,
        fulfillment_method: r.fulfillment_method,
        total_amount: Number(r.total_amount ?? 0),
        payment_status: r.payment_status,
        pharmacy: (row.pharmacies as { name: string } | null)?.name ?? null,
        neighborhood: (row.neighborhoods as { name: string } | null)?.name ?? null,
        patient_address: r.patient_address,
      };
    });
  });

/** Grant or revoke the admin role for a user (professional roles are managed on their own pages). */
export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), admin: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (!data.admin && data.userId === context.userId) {
      throw new Error("Vous ne pouvez pas retirer votre propre rôle admin");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.admin) {
      const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: "admin" });
      if (error && !`${error.message}`.toLowerCase().includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: context.userId,
      action: data.admin ? "admin.grant" : "admin.revoke",
      entity: "user_roles",
      entity_id: data.userId,
    });
    return { ok: true };
  });
