import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/auth/middleware";
import { toPlain } from "@/server/serialize";

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
    const { createOtcOrderCore } = await import("./otc-core.server");
    return toPlain(
      await createOtcOrderCore(context.userId, {
        medicines: data.medicines,
        lat: data.lat,
        lng: data.lng,
        address: data.address,
        neighborhoodId: data.neighborhoodId,
      }),
    );
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
