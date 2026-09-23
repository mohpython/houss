import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { toPlain } from "@/server/serialize";

/** Keeps the last 8 significant digits so +223 / 00223 / spaces all match. */
function phoneKey(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.slice(-8);
}

const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

/** A signed-in patient rates one of their own completed orders. */
export const submitReservationFeedback = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    ratingSchema.extend({ reservationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");

    const res = await prisma.reservations.findUnique({
      where: { id: data.reservationId },
      select: {
        id: true,
        patient_id: true,
        pharmacy_id: true,
        courier_id: true,
        payment_status: true,
        status: true,
        patient_phone: true,
      },
    });
    if (!res) throw new Error("Commande introuvable");
    if (res.patient_id !== userId) {
      const { reservationAccess } = await import("@/server/authz.server");
      const access = await reservationAccess(userId, res);
      if (!access.canRead) throw new Error("Commande introuvable");
      throw new Error("Non autorisé");
    }
    if (res.status !== "completed") {
      throw new Error("Vous pourrez laisser un avis une fois la commande terminée.");
    }

    const existing = await prisma.feedback.findFirst({
      where: { reservation_id: data.reservationId, user_id: userId },
      select: { id: true },
    });
    if (existing) throw new Error("Vous avez déjà laissé un avis pour cette commande.");

    await prisma.feedback.create({
      data: {
        user_id: userId,
        reservation_id: res.id,
        pharmacy_id: res.pharmacy_id,
        phone: res.patient_phone ?? "",
        rating: data.rating,
        comment: data.comment ?? null,
      },
    });

    return { ok: true };
  });

/** A signed-in patient sends a general remark (must have at least one order). */
export const submitGeneralFeedback = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => ratingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const last = await prisma.reservations.findFirst({
      where: { patient_id: userId },
      select: { id: true, pharmacy_id: true, patient_phone: true },
      orderBy: { created_at: "desc" },
    });
    if (!last) throw new Error("Seuls les clients ayant déjà commandé peuvent laisser un avis.");

    await prisma.feedback.create({
      data: {
        user_id: userId,
        pharmacy_id: last.pharmacy_id,
        phone: last.patient_phone ?? "",
        rating: data.rating,
        comment: data.comment ?? null,
      },
    });
    return { ok: true };
  });

/** Checks that a phone number belongs to an existing customer (no account needed). */
export const checkFeedbackEligibility = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ phone: z.string().trim().min(6).max(25) }).parse(input),
  )
  .handler(async ({ data }) => {
    const key = phoneKey(data.phone);
    if (key.length < 6) return { eligible: false as const };

    const { prisma } = await import("@/server/db.server");
    const last = await prisma.reservations.findFirst({
      where: { patient_phone: { endsWith: key } },
      select: { id: true, created_at: true, pharmacies: { select: { name: true } } },
      orderBy: { created_at: "desc" },
    });
    if (!last) return { eligible: false as const };

    return {
      eligible: true as const,
      lastOrderAt: last.created_at.toISOString(),
      pharmacyName: last.pharmacies?.name ?? null,
    };
  });

/** Stores a remark from a verified customer phone number. */
export const submitPhoneFeedback = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    ratingSchema.extend({ phone: z.string().trim().min(6).max(25) }).parse(input),
  )
  .handler(async ({ data }) => {
    const key = phoneKey(data.phone);
    if (key.length < 6) throw new Error("Numéro invalide");

    const { prisma } = await import("@/server/db.server");
    const last = await prisma.reservations.findFirst({
      where: { patient_phone: { endsWith: key } },
      select: { id: true, patient_id: true, pharmacy_id: true },
      orderBy: { created_at: "desc" },
    });
    if (!last) {
      throw new Error("Aucune commande trouvée pour ce numéro.");
    }

    await prisma.feedback.create({
      data: {
        user_id: last.patient_id,
        reservation_id: last.id,
        pharmacy_id: last.pharmacy_id,
        phone: data.phone.trim(),
        rating: data.rating,
        comment: data.comment ?? null,
      },
    });
    return { ok: true };
  });

/** Admin-only: lists every review with pharmacy name and average per pharmacy. */
export const listFeedback = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { isAdmin } = await import("@/server/authz.server");
    if (!(await isAdmin(userId))) throw new Error("Accès réservé aux administrateurs");

    const { prisma } = await import("@/server/db.server");
    const data = toPlain(
      await prisma.feedback.findMany({
        select: {
          id: true,
          rating: true,
          comment: true,
          phone: true,
          created_at: true,
          reservation_id: true,
          pharmacy_id: true,
          pharmacies: { select: { name: true } },
        },
        orderBy: { created_at: "desc" },
        take: 200,
      }),
    );

    const rows = data.map((r) => {
      const row = r as unknown as {
        id: string;
        rating: number;
        comment: string | null;
        phone: string;
        created_at: string;
        pharmacy_id: string | null;
        pharmacies: { name: string } | null;
      };
      return {
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        phone: row.phone,
        createdAt: row.created_at,
        pharmacyId: row.pharmacy_id,
        pharmacyName: row.pharmacies?.name ?? null,
      };
    });

    const byPharmacy = new Map<string, { name: string; total: number; count: number }>();
    for (const r of rows) {
      const key = r.pharmacyName ?? "—";
      const cur = byPharmacy.get(key) ?? { name: key, total: 0, count: 0 };
      cur.total += r.rating;
      cur.count += 1;
      byPharmacy.set(key, cur);
    }
    const averages = [...byPharmacy.values()].map((p) => ({
      name: p.name,
      count: p.count,
      average: Math.round((p.total / p.count) * 10) / 10,
    }));

    const overall = rows.length
      ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / rows.length) * 10) / 10
      : 0;

    return { rows, averages, overall };
  });
