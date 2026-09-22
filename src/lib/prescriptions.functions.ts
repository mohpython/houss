import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { toDateOnly, toPlain } from "@/server/serialize";

/**
 * Server functions des écrans patient « ordonnances » (remplacent les accès
 * directs à la base depuis les pages).
 *
 * Règles d'accès reprises de l'ancienne RLS :
 *  - ordonnance : lecture patient / admin / pharmacie ayant une commande dessus,
 *    écriture patient propriétaire uniquement ;
 *  - lignes d'ordonnance : lecture patient / admin, écriture patient uniquement.
 */

const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/;

/** L'ordonnance appartient-elle à l'utilisateur ? */
async function ownsPrescription(userId: string, prescriptionId: string) {
  const { prisma } = await import("@/server/db.server");
  const rx = await prisma.prescriptions.findFirst({
    where: { id: prescriptionId, patient_id: userId },
    select: { id: true },
  });
  return !!rx;
}

/** Crée la ligne `prescriptions` après un téléversement (`uploadPrescriptionFile`). */
export const createPrescriptionFromUpload = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        path: z.string().min(3).max(300),
        mime: z.string().max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const { objectExists, mimeFromKey } = await import("@/server/storage.server");

    // Le fichier doit se trouver dans le dossier de l'utilisateur (ancienne
    // politique du bucket `prescriptions`).
    if (!data.path.startsWith(`${userId}/`) || data.path.split("/").includes("..")) {
      throw new Error("Fichier introuvable");
    }
    if (!(await objectExists("prescriptions", data.path))) {
      throw new Error("Fichier introuvable");
    }
    const mime =
      data.mime && ALLOWED_MIME.test(data.mime)
        ? data.mime
        : ALLOWED_MIME.test(mimeFromKey(data.path))
          ? mimeFromKey(data.path)
          : "image/jpeg";

    const inserted = await prisma.prescriptions.create({
      data: {
        patient_id: userId,
        file_path: data.path,
        file_mime: mime,
        status: "uploaded",
      },
      select: { id: true },
    });
    return { id: inserted.id };
  });

/**
 * Correction manuelle de la date par le patient. `raw` (texte saisi) n'est
 * enregistré que s'il est fourni ; `date` à null efface la date.
 */
export const setPrescriptionDate = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prescriptionId: z.string().uuid(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
        raw: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    if (!(await ownsPrescription(userId, data.prescriptionId))) {
      throw new Error("Ordonnance introuvable");
    }
    await prisma.prescriptions.update({
      where: { id: data.prescriptionId },
      data: {
        prescription_date: toDateOnly(data.date),
        ...(data.raw !== undefined ? { prescription_date_raw: data.raw } : {}),
        date_source: "manual",
      },
    });
    return { ok: true };
  });

/** Le patient confirme avoir vérifié son ordonnance. */
export const markPrescriptionVerified = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ prescriptionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    // Ancienne RLS : seul le patient propriétaire peut modifier (sinon aucun effet).
    const res = await prisma.prescriptions.updateMany({
      where: { id: data.prescriptionId, patient_id: userId },
      data: { status: "verified" },
    });
    return { ok: res.count > 0 };
  });

/** Liste des ordonnances du patient connecté. */
export const listMyPrescriptions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { prisma } = await import("@/server/db.server");
    const rows = await prisma.prescriptions.findMany({
      where: { patient_id: context.userId },
      select: {
        id: true,
        patient_name: true,
        doctor_name: true,
        prescription_date: true,
        status: true,
        ai_confidence: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
    });
    return toPlain(rows);
  });

/**
 * Détail d'une ordonnance + ses lignes. `rx` vaut null si l'utilisateur ne
 * peut pas la lire ; les lignes ne sont visibles que du patient et des admins.
 */
export const getPrescriptionDetail = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ prescriptionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { prisma } = await import("@/server/db.server");
    const { canReadPrescription, isAdmin } = await import("@/server/authz.server");

    if (!(await canReadPrescription(userId, data.prescriptionId))) {
      return { rx: null, items: [], isOwner: false };
    }
    const rx = await prisma.prescriptions.findUnique({
      where: { id: data.prescriptionId },
      select: {
        patient_id: true,
        patient_name: true,
        doctor_name: true,
        hospital: true,
        prescription_date: true,
        ai_confidence: true,
        status: true,
        prescription_date_raw: true,
        date_source: true,
      },
    });
    if (!rx) return { rx: null, items: [], isOwner: false };
    const { patient_id, ...rxFields } = rx;
    const isOwner = patient_id === userId;

    const items =
      isOwner || (await isAdmin(userId))
        ? await prisma.prescription_items.findMany({
            where: { prescription_id: data.prescriptionId },
            select: {
              id: true,
              medicine_name_raw: true,
              strength: true,
              quantity: true,
              dosage: true,
              duration: true,
              instructions: true,
              patient_verified: true,
            },
            orderBy: { created_at: "asc" },
          })
        : [];

    return toPlain({ rx: rxFields, items, isOwner });
  });

const ItemPatch = z
  .object({
    medicine_name_raw: z.string().max(300),
    strength: z.string().max(200).nullable(),
    quantity: z.string().max(200).nullable(),
    dosage: z.string().max(300).nullable(),
    duration: z.string().max(200).nullable(),
    instructions: z.string().max(1000).nullable(),
    patient_verified: z.boolean(),
  })
  .partial();

/** Modification d'une ligne par le patient propriétaire (sinon aucun effet). */
export const updatePrescriptionItem = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ itemId: z.string().uuid(), patch: ItemPatch }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    // A renamed medicine must be re-linked to the catalog on the next search.
    const dbPatch =
      "medicine_name_raw" in data.patch
        ? { ...data.patch, normalized_medicine_id: null }
        : data.patch;
    const res = await prisma.prescription_items.updateMany({
      where: { id: data.itemId, prescriptions: { patient_id: context.userId } },
      data: dbPatch,
    });
    return { ok: res.count > 0 };
  });

/** Suppression d'une ligne par le patient propriétaire (sinon aucun effet). */
export const deletePrescriptionItem = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ itemId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { prisma } = await import("@/server/db.server");
    const res = await prisma.prescription_items.deleteMany({
      where: { id: data.itemId, prescriptions: { patient_id: context.userId } },
    });
    return { ok: res.count > 0 };
  });

/** Dernières commandes du patient connecté (écran d'accueil). */
export const listMyRecentReservations = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { prisma } = await import("@/server/db.server");
    const rows = await prisma.reservations.findMany({
      where: { patient_id: context.userId },
      select: {
        id: true,
        status: true,
        delivery_status: true,
        created_at: true,
        pharmacies: { select: { name: true } },
      },
      orderBy: { created_at: "desc" },
      take: 4,
    });
    return toPlain(rows);
  });
