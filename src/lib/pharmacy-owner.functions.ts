import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";

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
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<PharmacyOwnerRow[]> => {
    const { prisma } = await import("@/server/db.server");
    const { assertAdmin } = await import("@/server/authz.server");
    await assertAdmin(context.userId);

    const rows = await prisma.pharmacies.findMany({
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        status: true,
        owner_user_id: true,
        claim_email: true,
        owner: { select: { email: true } },
      },
      orderBy: { name: "asc" },
    });

    return rows.map(({ owner, ...r }) => ({
      ...r,
      owner_email: r.owner_user_id ? (owner?.email ?? "(inconnu)") : null,
    }));
  });

export const assignPharmacyOwner = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        pharmacyId: z.string().uuid(),
        email: z.string().trim().toLowerCase().email().max(255),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const { assertAdmin, isAdmin } = await import("@/server/authz.server");
    await assertAdmin(context.userId);

    const pharmacy = await prisma.pharmacies.findUnique({
      where: { id: data.pharmacyId },
      select: { id: true, name: true, owner_user_id: true },
    });
    if (!pharmacy) throw new Error("Pharmacie introuvable");
    if (pharmacy.owner_user_id) {
      throw new Error("Cette pharmacie a déjà un gérant. Retirez-le d'abord.");
    }

    const user = await prisma.users.findFirst({
      where: { email: { equals: data.email, mode: "insensitive" } },
      select: { id: true, email: true },
    });

    if (!user) {
      // No account yet: reserve the pharmacy for this email.
      const reserved = await prisma.pharmacies.findFirst({
        where: {
          claim_email: { equals: data.email, mode: "insensitive" },
          id: { not: data.pharmacyId },
        },
        select: { id: true, name: true },
      });
      if (reserved) {
        throw new Error(`Cet email est déjà réservé pour « ${reserved.name} »`);
      }
      await prisma.pharmacies.update({
        where: { id: data.pharmacyId },
        data: { claim_email: data.email },
      });

      await prisma.audit_logs.create({
        data: {
          actor_user_id: context.userId,
          action: "pharmacy.owner_invited",
          entity: "pharmacy",
          entity_id: data.pharmacyId,
          meta: { email: data.email },
        },
      });
      return { status: "invited" as const, email: data.email };
    }

    // Account exists — enforce exclusivity rules.
    const [ownsOther, staffOther, courier, targetIsAdmin] = await Promise.all([
      prisma.pharmacies.findFirst({
        where: { owner_user_id: user.id },
        select: { id: true, name: true },
      }),
      prisma.pharmacy_staff.findFirst({ where: { user_id: user.id }, select: { id: true } }),
      prisma.couriers.findFirst({ where: { user_id: user.id }, select: { id: true } }),
      isAdmin(user.id),
    ]);

    if (!targetIsAdmin) {
      if (ownsOther) throw new Error(`Ce compte gère déjà « ${ownsOther.name} »`);
      if (staffOther) throw new Error("Ce compte est déjà rattaché à une autre pharmacie");
      if (courier)
        throw new Error(
          "Ce compte est déjà livreur : un compte ne peut pas cumuler les deux rôles",
        );
    }

    await prisma.pharmacies.update({
      where: { id: data.pharmacyId },
      data: { owner_user_id: user.id, claim_email: null },
    });

    // Comme avant, les échecs de ces insertions (doublons) sont ignorés.
    await prisma.pharmacy_staff
      .create({ data: { pharmacy_id: data.pharmacyId, user_id: user.id } })
      .catch(() => undefined);
    await prisma.user_roles
      .upsert({
        where: { user_id_role: { user_id: user.id, role: "pharmacy_staff" } },
        create: { user_id: user.id, role: "pharmacy_staff" },
        update: {},
      })
      .catch(() => undefined);

    await prisma.audit_logs.create({
      data: {
        actor_user_id: context.userId,
        action: "pharmacy.owner_assigned",
        entity: "pharmacy",
        entity_id: data.pharmacyId,
        meta: { email: data.email, user_id: user.id },
      },
    });

    return { status: "assigned" as const, email: data.email, userId: user.id };
  });

export const unassignPharmacyOwner = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ pharmacyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const { assertAdmin } = await import("@/server/authz.server");
    await assertAdmin(context.userId);

    const pharmacy = await prisma.pharmacies.findUnique({
      where: { id: data.pharmacyId },
      select: { id: true, owner_user_id: true },
    });
    if (!pharmacy) throw new Error("Pharmacie introuvable");

    const ownerId = pharmacy.owner_user_id;

    await prisma.pharmacies.update({
      where: { id: data.pharmacyId },
      data: { owner_user_id: null, claim_email: null },
    });

    if (ownerId) {
      await prisma.pharmacy_staff.deleteMany({
        where: { pharmacy_id: data.pharmacyId, user_id: ownerId },
      });
      const stillStaff = await prisma.pharmacy_staff.findFirst({
        where: { user_id: ownerId },
        select: { id: true },
      });
      if (!stillStaff) {
        await prisma.user_roles.deleteMany({
          where: { user_id: ownerId, role: "pharmacy_staff" },
        });
      }
    }

    await prisma.audit_logs.create({
      data: {
        actor_user_id: context.userId,
        action: "pharmacy.owner_removed",
        entity: "pharmacy",
        entity_id: data.pharmacyId,
        meta: { previous_owner: ownerId },
      },
    });

    return { ok: true };
  });
