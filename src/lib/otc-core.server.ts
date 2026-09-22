/**
 * OTC photo recognition — server only.
 * The patient photographs a medicine box / blister and Gemini returns the
 * medicine names so we can search partner pharmacies.
 */
import { z } from "zod";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output, NoObjectGeneratedError } from "ai";

const OtcSchema = z.object({
  is_medicine: z.boolean(),
  medicines: z.array(
    z.object({
      name: z.string(),
      dosage: z.string(),
      confidence: z.number(),
    }),
  ),
});

const SYSTEM_PROMPT = `Tu es un pharmacien malien expert en identification de médicaments à partir de photos (boîtes, plaquettes, flacons, tubes).

Règles:
- Lis le nom commercial principal EXACTEMENT tel qu'imprimé (ex: "Doliprane", "Efferalgan", "Amoxisel", "Coartem").
- Ajoute le dosage s'il est visible (ex: "500mg", "1g", "250mg/5ml").
- Si plusieurs boîtes différentes sont visibles, retourne une entrée par médicament (max 10).
- N'invente jamais un nom: si le texte est illisible, baisse la confiance (<50) ou omets l'entrée.
- Si la photo ne montre aucun médicament, retourne is_medicine=false et medicines=[].
- Ignore les mentions génériques comme "comprimés", "boîte de 20", le nom du laboratoire, les codes-barres.
- Réponds UNIQUEMENT en JSON conforme au schéma, sans texte autour.
- Tous les champs sont obligatoires: is_medicine (booléen), medicines (tableau, vide si rien), et pour chaque entrée name (chaîne), dosage (chaîne, "" si inconnu), confidence (nombre 0-100).`;

export async function extractOtcFromImage(dataUrl: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY manquant");

  const provider = createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error("Image invalide");
  const mediaType = match[1]!;
  const bytes = Uint8Array.from(atob(match[2]!), (c) => c.charCodeAt(0));

  const userContent = [
    { type: "text", text: "Identifie le ou les médicaments sur cette photo. JSON uniquement." },
    { type: "image", image: bytes, mediaType },
  ];

  let output: z.infer<typeof OtcSchema>;
  try {
    ({ output } = await generateText({
      maxRetries: 2,
      model: provider("google/gemini-3-flash-preview"),
      system: SYSTEM_PROMPT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "user", content: userContent as any }],
      output: Output.object({ schema: OtcSchema }),
    }));
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;
    // Fallback: plain text generation + tolerant JSON parsing.
    const { text } = await generateText({
      model: provider("google/gemini-3-flash-preview"),
      system: SYSTEM_PROMPT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "user", content: userContent as any }],
    });
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      const raw = Array.isArray(parsed["medicines"]) ? (parsed["medicines"] as unknown[]) : [];
      output = {
        is_medicine: parsed["is_medicine"] !== false,
        medicines: raw.map((m) => {
          const o = (typeof m === "string" ? { name: m } : m) as Record<string, unknown>;
          return {
            name: String(o["name"] ?? ""),
            dosage: String(o["dosage"] ?? ""),
            confidence: Number(o["confidence"] ?? 100),
          };
        }),
      };
    } catch {
      return { isMedicine: false, medicines: [] };
    }
  }

  const medicines = (output.medicines ?? [])
    .filter((m) => m.name && m.name.trim().length >= 2 && (m.confidence ?? 100) >= 40)
    .map((m) => ({
      name: [m.name.trim(), m.dosage?.trim()].filter(Boolean).join(" ").slice(0, 120),
      confidence: m.confidence ?? 100,
    }));

  return { isMedicine: output.is_medicine && medicines.length > 0, medicines };
}
