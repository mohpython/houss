/**
 * Core prescription extraction — server only.
 * Shared by the web app (authenticated server fn) and the WhatsApp bot
 * (server side), so both go through the exact same AI pipeline.
 */
import { z } from "zod";
import { resolveRxDate, rxDateStatus } from "./date-utils";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db.server";
import { readObject } from "@/server/storage.server";
import { visionModel } from "@/server/ai.server";
import { toDateOnly } from "@/server/serialize";
import { catalogHint, linkPrescriptionItemsToCatalog, loadCatalog } from "./medicine-match.server";

export const ExtractionSchema = z.object({
  is_prescription: z.boolean(),
  authenticity_score: z.number(),
  rejection_reason: z.string().nullable(),
  patient_name: z.string().nullable(),
  doctor_name: z.string().nullable(),
  hospital: z.string().nullable(),
  prescription_date: z.string().nullable(),
  prescription_date_iso: z.string().nullable(),
  confidence: z.number(),
  unreadable_zones: z.array(z.string()),
  inconsistencies: z.array(z.string()),
  quality_notes: z.string().nullable(),
  medicines: z.array(
    z.object({
      name: z.string(),
      strength: z.string().nullable(),
      quantity: z.string().nullable(),
      dosage: z.string().nullable(),
      duration: z.string().nullable(),
      instructions: z.string().nullable(),
    }),
  ),
});

const SYSTEM_PROMPT = `You are a medical prescription analyzer AND authenticity validator. First decide whether the document IS a genuine medical prescription (ordonnance). Then, only if genuine, extract structured data. Return ONLY a JSON object matching EXACTLY this shape (use these exact key names, use null for missing values, no extra keys):

{
  "is_prescription": boolean,             // true only if this is a real medical prescription
  "authenticity_score": number,           // 0-100 confidence that it is a genuine prescription
  "rejection_reason": string | null,      // short reason (in French) if is_prescription is false
  "patient_name": string | null,
  "doctor_name": string | null,
  "hospital": string | null,
  "prescription_date": string | null,        // the date EXACTLY as written on the document (any format, any language)
  "prescription_date_iso": string | null,    // the same date normalized to YYYY-MM-DD, null if no date is visible
  "confidence": number,
  "unreadable_zones": string[],           // short FR labels of illegible areas, e.g. "date en haut à droite", "2e ligne de médicament", "cachet du médecin"
  "inconsistencies": string[],            // short FR notes on anything suspicious: dosage impossible, nom de médecin absent, écritures de polices différentes, ratures, date incohérente
  "quality_notes": string | null,         // short FR note on image quality (flou, reflet, coupé, sombre)
  "medicines": [
    { "name": string, "strength": string | null, "quantity": string | null, "dosage": string | null, "duration": string | null, "instructions": string | null }
  ]
}


Authenticity rules (STRICT):
- A genuine prescription in Mali must contain: a patient name (or "Patient:" field), a date, and a list of medicines with dosages. A doctor identification (name, title Dr., signature, stamp/cachet) is NOT mandatory — many valid local pads do not print the doctor's name. Do NOT lower the authenticity score because the doctor's name is missing.
- Reject (is_prescription=false, authenticity_score<50) if the image is: a random photo, selfie, landscape, receipt, invoice, ID card, shopping list, screenshot of text unrelated to medicine, blank paper, meme, or any document that is clearly NOT a medical prescription.
- Also reject obvious forgeries: mismatched fonts everywhere, digital watermarks like "SAMPLE"/"TEMPLATE"/"FAKE", visible photo-editing artifacts, or medicines that don't exist.
- If unsure but the document plausibly looks like a prescription, set is_prescription=true with a moderate authenticity_score (50-80).
- When is_prescription=false, set medicines to [] and all other extracted fields to null.

KNOWN GENUINE FORMAT — SAHA Santé prescription pad (Mali, très fréquent, TOUJOURS authentique) :
- Carnet pré-imprimé bleu avec logo "SAHA Santé — Votre Santé, Notre Priorité", adresse "Hamdallaye ACI 2000, Bamako - Mali", tél "(+223) 76185950 / 66185950", cadre "ORDONNANCE N° :", encadré "ORDONNANCE MÉDICALE", et bas de page "NB: Lire attentivement la prescription avant usage".
- Le corps est MANUSCRIT en stylo bleu, souvent en cursive rapide, avec un gros cachet/logo bleu translucide imprimé au milieu qui chevauche l'écriture, plus une signature manuscrite. Ce chevauchement, l'écriture penchée, les ratures et les traits de soulignement sont NORMAUX : ne jamais les traiter comme falsification ni comme "polices différentes".
- Sur ce carnet il n'y a PAS de nom de médecin imprimé : l'absence de nom/RPPS n'est PAS un motif de rejet ET ne doit PAS être listée dans "inconsistencies". Mettre doctor_name à null, hospital = "SAHA Santé", et is_prescription=true avec authenticity_score >= 85 dès que le pré-imprimé et une écriture manuscrite de médicaments sont visibles.
- Deux champs "Date" existent : celui de l'en-tête (souvent vide) et celui du cadre patient ("Patient / âge / Poids / Date :"). Utiliser celui qui est REMPLI, en général celui du cadre patient, écrit en chiffres collés type "19/08/2026", "27/08/2026", "11/08/2026", "07/05/2026". Les chiffres manuscrits collés doivent être lus chiffre par chiffre.
- Le nom du patient est manuscrit à droite de "Patient:".

Écriture manuscrite — abréviations courantes au Mali (normaliser le nom, garder la quantité telle quelle) :
- "Para 500 mg" = Paracétamol 500 mg ; "Cipro 500/750 mg" = Ciprofloxacine ; "Amoxi sel" / "Amoxysel" = Amoxicilline ; "SP" = Sulfadoxine-Pyriméthamine ; "Ibu 400 mg" = Ibuprofène 400 mg ; "Fer comprimé" = Fer (sulfate ferreux) ; "Genta collyre", "Tobra collyre", "Béta collyre" = collyres (Gentamicine, Tobramycine, Bétaméthasone) ; "Novalgin" = Métamizole ; "Ceftriaxone 1 g" ; "Quinine 0,60 g" ; "VAT"/"SAT" = vaccin / sérum antitétanique ; "Genclovir/Aciclovir crème".
- Quantités : "3 pl" = 3 plaquettes, "1 fl" = 1 flacon, "1 tube", "amp" = ampoule, "cp" = comprimé, "bte" = boîte, "IM"/"IV" = voie d'administration (mettre dans instructions).
- Une ligne illisible ne doit pas bloquer les autres : extraire ce qui est lisible et signaler la ligne dans "unreadable_zones".


Extraction rules (only when is_prescription=true):
- Use EXACTLY the key names above. Extract every medicine listed.
- Language may be French, English, or Arabic — keep values in the original language.
- Output ONLY the JSON object, no markdown, no commentary.

Diagnostics rules (ALWAYS fill, they help a human reviewer):
- "unreadable_zones": list every area you could not read with certainty (empty array if all is clear). Be concrete and localized.
- "inconsistencies": list every doubt about coherence or authenticity. NEVER list "missing doctor" / "nom de médecin absent" as an inconsistency, because it is NOT required in Mali. Flag instead: impossible posology, altered text, date incoherent with the document, medicines that don't exist, or obvious forgeries.
- "quality_notes": one short sentence about photo quality when it hurts reading, else null.

Date rules (CRITICAL for authenticity — the YEAR is the most common error, be extremely careful):
- Find the prescription/consultation date anywhere on the document (header, near the doctor stamp, near the signature, "Le ...", "Date :", "التاريخ").
- "prescription_date" = the raw string EXACTLY as printed/handwritten, character by character, including the separators (e.g. "12/03/2026", "le 3 mars 26", "٠٥/٠٤/٢٠٢٦"). Never reformat it, never complete it.
- Read the YEAR digit by digit from the pixels. NEVER guess it, NEVER replace it with today's year, NEVER "correct" it to look recent. A prescription from a previous year is normal.
- If the year has only 2 digits, keep those 2 digits in "prescription_date" and expand them to 20XX in "prescription_date_iso" (e.g. "26" -> 2026).
- If any digit of the year is uncertain or illegible, still write what you see in "prescription_date", set "prescription_date_iso" to null, and add "année de la date illisible" to "unreadable_zones".
- "prescription_date_iso" = that same date converted to YYYY-MM-DD, with the SAME year as the raw string. Day-first formats (JJ/MM/AAAA) are the norm in French documents.
- Sanity check before answering: the year in "prescription_date_iso" MUST match the digits in "prescription_date". If they differ, fix the ISO value.
- If several dates appear, use the prescribing date (not a birth date, not an expiry date of a medicine).
- If truly no date is visible, set BOTH date fields to null — never invent one.`;

export type ReviewSeverity = "critical" | "moderate" | "minor";

export type ExtractResult = {
  ok: true;
  confidence: number;
  authenticityScore: number;
  count: number;
  prescriptionDate: string | null;
  prescriptionDateRaw: string | null;
  dateStatus: "valid" | "expired" | "future" | "missing";
  unreadableZones: string[];
  inconsistencies: string[];
  qualityNotes: string | null;
  severity: ReviewSeverity;
  blocking: boolean;
  reasons: string[];
};

/**
 * Classifies the extraction result into a severity level.
 * - critical: not a prescription, future date, no medicines, very low authenticity
 * - moderate: low confidence, low authenticity, inconsistencies, expired date
 * - minor: date missing but medicines clear, single unreadable zone, image quality
 */
export function classifySeverity(res: {
  count: number;
  dateStatus: "valid" | "expired" | "future" | "missing";
  confidence: number;
  authenticityScore: number;
  inconsistencies: string[];
  unreadableZones: string[];
  qualityNotes: string | null;
}): { severity: ReviewSeverity; blocking: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (res.count === 0) reasons.push("Aucun médicament détecté");
  if (res.dateStatus === "missing") reasons.push("Date illisible ou absente");
  if (res.dateStatus === "expired") reasons.push("Ordonnance périmée (> 90 jours)");
  if (res.confidence < 60) reasons.push(`Confiance IA faible (${res.confidence}%)`);
  if (res.authenticityScore < 70)
    reasons.push(`Score d'authenticité faible (${res.authenticityScore}%)`);
  for (const z of res.unreadableZones) reasons.push(`Zone illisible : ${z}`);
  for (const i of res.inconsistencies) reasons.push(`Incohérence : ${i}`);
  if (res.qualityNotes) reasons.push(`Qualité image : ${res.qualityNotes}`);

  const critical = res.count === 0 || res.dateStatus === "future" || res.authenticityScore < 50;

  const moderate =
    !critical &&
    (res.dateStatus === "expired" ||
      res.confidence < 60 ||
      res.authenticityScore < 70 ||
      res.inconsistencies.length > 0);

  const minor =
    !critical &&
    !moderate &&
    (res.dateStatus === "missing" || res.unreadableZones.length > 0 || res.qualityNotes !== null);

  const severity: ReviewSeverity = critical
    ? "critical"
    : moderate
      ? "moderate"
      : minor
        ? "minor"
        : "minor";

  // Critical and moderate always block (go to admin). Minor blocks too but
  // the patient gets a chance to self-correct first.
  const blocking = critical || moderate || minor;

  return { severity, blocking, reasons };
}

/**
 * Runs the AI extraction on an existing prescription row and persists the
 * results (items, metadata, audit log). Throws a human-readable error when the
 * document is rejected or unreadable.
 */
export async function extractPrescriptionCore(
  actorUserId: string,
  prescriptionId: string,
): Promise<ExtractResult> {
  const rx = await prisma.prescriptions.findUnique({ where: { id: prescriptionId } });
  if (!rx) throw new Error("Ordonnance introuvable");

  let fileBytes: Buffer;
  try {
    fileBytes = await readObject("prescriptions", rx.file_path);
  } catch {
    throw new Error("Impossible d'accéder au fichier");
  }

  const model = visionModel();

  await prisma.prescriptions.update({ where: { id: rx.id }, data: { status: "processing" } });

  const isPdf = rx.file_mime === "application/pdf";

  // Catalog names help the model spell medicine names consistently run after run.
  let hint = "";
  try {
    hint = catalogHint(await loadCatalog());
  } catch {
    hint = "";
  }
  const userContent: Array<Record<string, unknown>> = [
    {
      type: "text",
      text:
        "Extract this prescription. Return JSON only." +
        (hint
          ? `\n\nKnown medicine names in our partner pharmacies (use EXACTLY one of these spellings for \"name\" when the handwritten word clearly designates it; put dosage in \"strength\", not in \"name\"; never add form words like cp/comprimé/gélule to \"name\"): ${hint}`
          : ""),
    },
  ];
  if (isPdf) {
    userContent.push({
      type: "file",
      data: new Uint8Array(fileBytes),
      mediaType: "application/pdf",
      filename: "prescription.pdf",
    });
  } else {
    userContent.push({ type: "image", image: new Uint8Array(fileBytes), mediaType: rx.file_mime });
  }

  try {
    const { output } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "user", content: userContent as any }],
      output: Output.object({ schema: ExtractionSchema }),
    });

    if (!output.is_prescription || output.authenticity_score < 50) {
      await prisma.prescriptions.update({
        where: { id: rx.id },
        data: {
          status: "failed",
          ai_confidence: output.authenticity_score,
          ai_raw: JSON.parse(JSON.stringify(output)) as Prisma.InputJsonValue,
        },
      });
      await prisma.prescription_items.deleteMany({ where: { prescription_id: rx.id } });
      await prisma.audit_logs.create({
        data: {
          actor_user_id: actorUserId,
          action: "prescription_rejected",
          entity: "prescription",
          entity_id: rx.id,
          meta: {
            authenticity_score: output.authenticity_score,
            reason: output.rejection_reason,
          },
        },
      });
      throw new Error(
        output.rejection_reason ??
          "Ce document ne semble pas être une ordonnance médicale valide. Veuillez téléverser une vraie ordonnance.",
      );
    }

    // ---- Date normalization + authenticity checks -------------------------
    const rawDate = output.prescription_date?.trim() || null;
    const resolved = resolveRxDate(rawDate, output.prescription_date_iso);
    // An implausible year (too old / too far ahead) is treated as unreadable.
    const isoDate = resolved.implausibleYear ? null : resolved.iso;
    if (resolved.yearConflict)
      output.inconsistencies.push("Année de la date incertaine (lecture IA corrigée)");
    if (resolved.implausibleYear) output.unreadable_zones.push("année de la date invraisemblable");
    const dateStatus = rxDateStatus(isoDate);

    if (dateStatus === "future") {
      // Date dans le futur : on ne bloque plus l'extraction, on signale à l'admin.
      output.inconsistencies.push("Date de l'ordonnance dans le futur");
      await prisma.audit_logs.create({
        data: {
          actor_user_id: actorUserId,
          action: "prescription_flagged",
          entity: "prescription",
          entity_id: rx.id,
          meta: { reason: "future_date", date: isoDate },
        },
      });
    }

    // No readable date => authenticity penalty, the document stays reviewable.
    const confidence =
      dateStatus === "missing"
        ? Math.max(0, Math.round(output.confidence * 0.7))
        : output.confidence;

    await prisma.prescriptions.update({
      where: { id: rx.id },
      data: {
        patient_name: output.patient_name,
        doctor_name: output.doctor_name,
        hospital: output.hospital,
        prescription_date: toDateOnly(isoDate),
        prescription_date_raw: rawDate,
        date_source: "ai",
        ai_confidence: confidence,
        ai_raw: JSON.parse(
          JSON.stringify({ ...output, date_iso: isoDate, date_status: dateStatus }),
        ) as Prisma.InputJsonValue,
        status: "extracted",
      },
    });

    await prisma.prescription_items.deleteMany({ where: { prescription_id: rx.id } });
    if (output.medicines.length > 0) {
      await prisma.prescription_items.createMany({
        data: output.medicines.map((m) => ({
          prescription_id: rx.id,
          medicine_name_raw: m.name,
          strength: m.strength,
          quantity: m.quantity,
          dosage: m.dosage,
          duration: m.duration,
          instructions: m.instructions,
          patient_verified: confidence >= 85,
        })),
      });
      // Link each line to the catalog once: later searches become deterministic.
      await linkPrescriptionItemsToCatalog(rx.id);
    }

    await prisma.audit_logs.create({
      data: {
        actor_user_id: actorUserId,
        action: "prescription_extracted",
        entity: "prescription",
        entity_id: rx.id,
        meta: {
          confidence,
          authenticity_score: output.authenticity_score,
          count: output.medicines.length,
          date: isoDate,
          date_status: dateStatus,
        },
      },
    });

    const baseResult = {
      ok: true as const,
      confidence,
      authenticityScore: output.authenticity_score,
      count: output.medicines.length,
      prescriptionDate: isoDate,
      prescriptionDateRaw: rawDate,
      dateStatus,
      unreadableZones: output.unreadable_zones ?? [],
      inconsistencies: output.inconsistencies ?? [],
      qualityNotes: output.quality_notes ?? null,
    };

    const { severity, blocking, reasons } = classifySeverity(baseResult);
    return { ...baseResult, severity, blocking, reasons };
  } catch (err) {
    let message = "Extraction impossible";
    if (NoObjectGeneratedError.isInstance(err)) {
      message = "L'IA n'a pas pu structurer l'ordonnance. Réessayez avec une photo plus nette.";
    } else if (err instanceof Error) {
      message = err.message;
    }
    await prisma.prescriptions
      .update({ where: { id: rx.id }, data: { status: "failed" } })
      .catch(() => undefined);
    throw new Error(message);
  }
}
