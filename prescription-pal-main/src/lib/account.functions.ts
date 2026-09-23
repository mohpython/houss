import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { toPlain } from "@/server/serialize";

/** Rôles de l'utilisateur connecté (patient, pharmacy_staff, admin, courier, doctor, nurse). */
export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { getRoles } = await import("@/server/auth.server");
    return getRoles(context.userId);
  });

export const getMyLanguage = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { prisma } = await import("@/server/db.server");
    const p = await prisma.profiles.findUnique({
      where: { id: context.userId },
      select: { language: true },
    });
    return p?.language ?? null;
  });

export const setMyLanguage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ language: z.enum(["fr", "en", "ar"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    await prisma.profiles.updateMany({
      where: { id: context.userId },
      data: { language: data.language },
    });
    return { ok: true };
  });

/** 50 dernières notifications de l'utilisateur. */
export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { prisma } = await import("@/server/db.server");
    const rows = await prisma.notifications.findMany({
      where: { user_id: context.userId },
      orderBy: { created_at: "desc" },
      take: 50,
    });
    return toPlain(rows);
  });

/** Marque comme lues une notification (`id`) ou toutes (`all: true`). */
export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    if (!data.id && !data.all) return { ok: true };
    await prisma.notifications.updateMany({
      where: {
        user_id: context.userId,
        read_at: null,
        ...(data.id ? { id: data.id } : {}),
      },
      data: { read_at: new Date() },
    });
    return { ok: true };
  });
