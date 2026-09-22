import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Over-the-counter order: the patient types medicine names (paracétamol,
 * doliprane…) and we route the order to the closest pharmacy in stock,
 * reusing the same reservation / delivery / payment pipeline.
 */
export const createOtcOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);
    const { autoRouteCore, resolveDeliveryTarget } = await import("./routing-core.server");
    const target = await resolveDeliveryTarget(supabase, {
      lat: data.lat,
      lng: data.lng,
      address: data.address,
      neighborhoodId: data.neighborhoodId,
    });

    const { data: rx, error } = await supabase
      .from("prescriptions")
      .insert({
        patient_id: userId,
        file_path: "otc",
        file_mime: "text/plain",
        source: "otc",
        status: "verified",
        prescription_date: today,
        date_source: "manual",
      })
      .select("id")
      .single();
    if (error || !rx) throw new Error(error?.message ?? "Impossible de créer la commande");

    const { error: itemsError } = await supabase.from("prescription_items").insert(
      data.medicines.map((name) => ({
        prescription_id: rx.id,
        medicine_name_raw: name,
        patient_verified: true,
      })),
    );
    if (itemsError) throw new Error(itemsError.message);

    const result = await autoRouteCore(supabase, {
      prescriptionId: rx.id,
      patientId: userId,
      patientLat: target.lat,
      patientLng: target.lng,
      patientAddress: target.address,
      neighborhoodId: target.neighborhoodId,
      deliveryMode: target.deliveryMode,
      source: "otc",
    });

    return result;
  });

/** Identify medicine names from a photo of the box / blister (AI vision). */
export const extractOtcPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ image: z.string().min(50).max(12_000_000) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { extractOtcFromImage } = await import("./otc-core.server");
    return extractOtcFromImage(data.image);
  });
