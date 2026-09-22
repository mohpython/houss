import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCallerIsAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  // has_role lives in `private` schema; fall back to direct query if RPC not exposed.
  if (error || data !== true) {
    const { data: row } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!row) throw new Error("Accès réservé aux administrateurs");
  }
}

export const listAdmins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, created_at")
      .eq("role", "admin")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const results = await Promise.all(
      (roles ?? []).map(async (r) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
        return {
          user_id: r.user_id,
          email: data?.user?.email ?? "(inconnu)",
          created_at: r.created_at,
        };
      }),
    );
    return results;
  });

export const manageAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email().max(255),
        action: z.enum(["grant", "revoke"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find target user by email via listUsers (paged search).
    let targetId: string | null = null;
    let targetEmail: string | null = null;
    let confirmed = false;
    let page = 1;
    for (; page <= 20; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new Error(error.message);
      const match = list.users.find((u) => (u.email ?? "").toLowerCase() === data.email);
      if (match) {
        targetId = match.id;
        targetEmail = match.email ?? data.email;
        confirmed = !!match.email_confirmed_at || !!(match as any).confirmed_at;
        break;
      }
      if (list.users.length < 200) break;
    }
    if (!targetId) throw new Error("Aucun utilisateur avec cet email");
    if (data.action === "grant" && !confirmed) {
      throw new Error("Cet utilisateur n'a pas encore confirmé son email");
    }
    if (data.action === "revoke" && targetId === context.userId) {
      throw new Error("Vous ne pouvez pas retirer votre propre rôle admin");
    }

    if (data.action === "grant") {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: targetId, role: "admin" });
      if (error && !`${error.message}`.toLowerCase().includes("duplicate")) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", targetId)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: context.userId,
      action: data.action === "grant" ? "admin.grant" : "admin.revoke",
      entity: "user_roles",
      entity_id: targetId,
      meta: { email: targetEmail },
    });

    return { ok: true, user_id: targetId, email: targetEmail };
  });
