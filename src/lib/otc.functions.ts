import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { toDateOnly, toPlain } from "@/server/serialize";

/**
 * Over-the-counter order: the patient types medicine names (paracétamol,
 * doliprane…) and we route the order to the closest pharmacy in stock,
 * reusing the same reservation / delivery / payment pipeline.
 */
export const createOtcOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        medicines: z.array(z.string().trim().min(2).max(120)).min(1).max(10),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
        address: z.string().trim().max(200).optional(),
        neighborhoodId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const today = new Date().toISOString().slice(0, 10);
    const { prisma } = await import("@/server/db.server");
    const { autoRouteCore, resolveDeliveryTarget } = await import("./routing-core.server");
    const target = await resolveDeliveryTarget({
      lat: data.lat,
      lng: data.lng,
      address: data.address,
      neighborhoodId: data.neighborhoodId,
    });

    let rx: { id: string };
    try {
      rx = await prisma.prescriptions.create({
        data: {
          patient_id: userId,
          file_path: "otc",
          file_mime: "text/plain",
          source: "otc",
          status: "verified",
          prescription_date: toDateOnly(today),
          date_source: "manual",
        },
        select: { id: true },
      });
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Impossible de créer la commande");
    }

    await prisma.prescription_items.createMany({
      data: data.medicines.map((name) => ({
        prescription_id: rx.id,
        medicine_name_raw: name,
        patient_verified: true,
      })),
    });

    const result = await autoRouteCore({
      prescriptionId: rx.id,
      patientId: userId,
      patientLat: target.lat,
      patientLng: target.lng,
      patientAddress: target.address,
      neighborhoodId: target.neighborhoodId,
      deliveryMode: target.deliveryMode,
      source: "otc",
    });

    return toPlain(result);
  });

/** Identify medicine names from a photo of the box / blister (AI vision). */
export const extractOtcPhoto = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ image: z.string().min(50).max(12_000_000) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { extractOtcFromImage } = await import("./otc-core.server");
    return extractOtcFromImage(data.image);
  });
