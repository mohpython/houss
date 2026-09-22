import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { toPlain } from "@/server/serialize";

export const listAdmins = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { prisma } = await import("@/server/db.server");
    const { assertAdmin } = await import("@/server/authz.server");
    await assertAdmin(context.userId);

    const roles = await prisma.user_roles.findMany({
      where: { role: "admin" },
      select: { user_id: true, created_at: true, user: { select: { email: true } } },
      orderBy: { created_at: "asc" },
    });

    return toPlain(
      roles.map((r) => ({
        user_id: r.user_id,
        email: r.user?.email ?? "(inconnu)",
        created_at: r.created_at,
      })),
    );
  });

export const manageAdminRole = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email().max(255),
        action: z.enum(["grant", "revoke"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const { assertAdmin } = await import("@/server/authz.server");
    await assertAdmin(context.userId);

    const match = await prisma.users.findFirst({
      where: { email: { equals: data.email, mode: "insensitive" } },
      select: { id: true, email: true, email_verified_at: true },
    });
    if (!match) throw new Error("Aucun utilisateur avec cet email");
    const targetId = match.id;
    const targetEmail = match.email ?? data.email;
    const confirmed = !!match.email_verified_at;

    if (data.action === "grant" && !confirmed) {
      throw new Error("Cet utilisateur n'a pas encore confirmé son email");
    }
    if (data.action === "revoke" && targetId === context.userId) {
      throw new Error("Vous ne pouvez pas retirer votre propre rôle admin");
    }

    if (data.action === "grant") {
      await prisma.user_roles.upsert({
        where: { user_id_role: { user_id: targetId, role: "admin" } },
        create: { user_id: targetId, role: "admin" },
        update: {},
      });
    } else {
      await prisma.user_roles.deleteMany({ where: { user_id: targetId, role: "admin" } });
    }

    await prisma.audit_logs.create({
      data: {
        actor_user_id: context.userId,
        action: data.action === "grant" ? "admin.grant" : "admin.revoke",
        entity: "user_roles",
        entity_id: targetId,
        meta: { email: targetEmail },
      },
    });

    return { ok: true, user_id: targetId, email: targetEmail };
  });
