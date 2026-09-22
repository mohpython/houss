import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function assertCallerIsAdmin(supabase: any, userId: string) {
  const { data: row } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!row) throw new Error("Accès réservé aux administrateurs");
}

async function findUserByEmail(supabaseAdmin: any, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = list.users.find((u: any) => (u.email ?? "").toLowerCase() === email);
    if (match) return match;
    if (list.users.length < 200) break;
  }
  return null;
}

export type PharmacyOwnerRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  status: string;
  owner_user_id: string | null;
  owner_email: string | null;
  claim_email: string | null;
};

export const listPharmaciesWithOwners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PharmacyOwnerRow[]> => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("pharmacies")
      .select("id, name, address, city, status, owner_user_id, claim_email")
      .order("name");
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const ownerIds = Array.from(
      new Set(rows.map((r) => r.owner_user_id).filter((v): v is string => !!v)),
    );
    const emails = new Map<string, string>();
    await Promise.all(
      ownerIds.map(async (id) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        if (u?.user?.email) emails.set(id, u.user.email);
      }),
    );

    return rows.map((r) => ({
      ...r,
      owner_email: r.owner_user_id ? (emails.get(r.owner_user_id) ?? "(inconnu)") : null,
    }));
  });

export const assignPharmacyOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        pharmacyId: z.string().uuid(),
        email: z.string().trim().toLowerCase().email().max(255),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pharmacy, error: pErr } = await supabaseAdmin
      .from("pharmacies")
      .select("id, name, owner_user_id")
      .eq("id", data.pharmacyId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!pharmacy) throw new Error("Pharmacie introuvable");
    if (pharmacy.owner_user_id) {
      throw new Error("Cette pharmacie a déjà un gérant. Retirez-le d'abord.");
    }

    const user = await findUserByEmail(supabaseAdmin, data.email);

    if (!user) {
      // No account yet: reserve the pharmacy for this email.
      const { data: reserved } = await supabaseAdmin
        .from("pharmacies")
        .select("id, name")
        .ilike("claim_email", data.email)
        .neq("id", data.pharmacyId)
        .maybeSingle();
      if (reserved) {
        throw new Error(`Cet email est déjà réservé pour « ${reserved.name} »`);
      }
      const { error } = await supabaseAdmin
        .from("pharmacies")
        .update({ claim_email: data.email })
        .eq("id", data.pharmacyId);
      if (error) throw new Error(error.message);

      await supabaseAdmin.from("audit_logs").insert({
        actor_user_id: context.userId,
        action: "pharmacy.owner_invited",
        entity: "pharmacy",
        entity_id: data.pharmacyId,
        meta: { email: data.email },
      });
      return { status: "invited" as const, email: data.email };
    }

    // Account exists — enforce exclusivity rules.
    const [{ data: ownsOther }, { data: staffOther }, { data: courier }, { data: isAdmin }] =
      await Promise.all([
        supabaseAdmin.from("pharmacies").select("id, name").eq("owner_user_id", user.id).maybeSingle(),
        supabaseAdmin.from("pharmacy_staff").select("id").eq("user_id", user.id).maybeSingle(),
        supabaseAdmin.from("couriers").select("id").eq("user_id", user.id).maybeSingle(),
        supabaseAdmin
          .from("user_roles")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle(),
      ]);

    if (!isAdmin) {
      if (ownsOther) throw new Error(`Ce compte gère déjà « ${ownsOther.name} »`);
      if (staffOther) throw new Error("Ce compte est déjà rattaché à une autre pharmacie");
      if (courier) throw new Error("Ce compte est déjà livreur : un compte ne peut pas cumuler les deux rôles");
    }

    const { error: upErr } = await supabaseAdmin
      .from("pharmacies")
      .update({ owner_user_id: user.id, claim_email: null })
      .eq("id", data.pharmacyId);
    if (upErr) throw new Error(upErr.message);

    await supabaseAdmin
      .from("pharmacy_staff")
      .insert({ pharmacy_id: data.pharmacyId, user_id: user.id });
    await supabaseAdmin.from("user_roles").insert({ user_id: user.id, role: "pharmacy_staff" });

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: context.userId,
      action: "pharmacy.owner_assigned",
      entity: "pharmacy",
      entity_id: data.pharmacyId,
      meta: { email: data.email, user_id: user.id },
    });

    return { status: "assigned" as const, email: data.email, userId: user.id };
  });

export const unassignPharmacyOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ pharmacyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pharmacy } = await supabaseAdmin
      .from("pharmacies")
      .select("id, owner_user_id")
      .eq("id", data.pharmacyId)
      .maybeSingle();
    if (!pharmacy) throw new Error("Pharmacie introuvable");

    const ownerId = pharmacy.owner_user_id;

    const { error } = await supabaseAdmin
      .from("pharmacies")
      .update({ owner_user_id: null, claim_email: null })
      .eq("id", data.pharmacyId);
    if (error) throw new Error(error.message);

    if (ownerId) {
      await supabaseAdmin
        .from("pharmacy_staff")
        .delete()
        .eq("pharmacy_id", data.pharmacyId)
        .eq("user_id", ownerId);
      const { data: stillStaff } = await supabaseAdmin
        .from("pharmacy_staff")
        .select("id")
        .eq("user_id", ownerId)
        .maybeSingle();
      if (!stillStaff) {
        await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", ownerId)
          .eq("role", "pharmacy_staff");
      }
    }

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: context.userId,
      action: "pharmacy.owner_removed",
      entity: "pharmacy",
      entity_id: data.pharmacyId,
      meta: { previous_owner: ownerId },
    });

    return { ok: true };
  });
