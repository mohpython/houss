import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";

export type Neighborhood = {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  is_active: boolean;
};

/** Active neighborhoods (quartiers) available as delivery destinations. */
export const listNeighborhoods = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ includeInactive: z.boolean().optional() })
      .optional()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const { isAdmin } = await import("@/server/authz.server");
    // Ancienne RLS : seuls les admins voient les quartiers inactifs.
    const all = !!data?.includeInactive && (await isAdmin(context.userId));
    const rows = await prisma.neighborhoods.findMany({
      where: all ? {} : { is_active: true },
      select: { id: true, name: true, city: true, lat: true, lng: true, is_active: true },
      orderBy: { name: "asc" },
    });
    return rows as Neighborhood[];
  });

export const upsertNeighborhood = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const { assertAdmin } = await import("@/server/authz.server");
    await assertAdmin(userId);

    const payload = {
      name: data.name,
      city: data.city,
      lat: data.lat,
      lng: data.lng,
      is_active: data.is_active,
    };
    let row: { id: string };
    try {
      row = data.id
        ? await prisma.neighborhoods.update({
            where: { id: data.id },
            data: payload,
            select: { id: true },
          })
        : await prisma.neighborhoods.create({ data: payload, select: { id: true } });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "P2002") throw new Error("Ce quartier existe déjà dans cette ville");
      throw new Error("Enregistrement impossible");
    }

    await prisma.audit_logs.create({
      data: {
        actor_user_id: userId,
        action: data.id ? "neighborhood_updated" : "neighborhood_created",
        entity: "neighborhood",
        entity_id: row.id,
        meta: payload,
      },
    });
    return { id: row.id };
  });

export const toggleNeighborhood = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const { assertAdmin } = await import("@/server/authz.server");
    await assertAdmin(context.userId);
    await prisma.neighborhoods.updateMany({
      where: { id: data.id },
      data: { is_active: data.is_active },
    });
    return { ok: true };
  });
