import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Neighborhood = {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  is_active: boolean;
};


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

/** Active neighborhoods (quartiers) available as delivery destinations. */
export const listNeighborhoods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ includeInactive: z.boolean().optional() }).optional().parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("neighborhoods")
      .select("id, name, city, lat, lng, is_active")
      .order("name");
    if (!data?.includeInactive) q = q.eq("is_active", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Neighborhood[];
  });

export const upsertNeighborhood = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(80),
        city: z.string().trim().min(2).max(80).default("Bamako"),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        is_active: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const payload = {
      name: data.name,
      city: data.city,
      lat: data.lat,
      lng: data.lng,
      is_active: data.is_active,
    };
    const q = data.id
      ? supabase.from("neighborhoods").update(payload).eq("id", data.id).select("id").single()
      : supabase.from("neighborhoods").insert(payload).select("id").single();
    const { data: row, error } = await q;
    if (error || !row) throw new Error(error?.message ?? "Enregistrement impossible");

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      action: data.id ? "neighborhood_updated" : "neighborhood_created",
      entity: "neighborhood",
      entity_id: row.id,
      meta: payload,
    });
    return { id: row.id };
  });

export const toggleNeighborhood = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("neighborhoods")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
