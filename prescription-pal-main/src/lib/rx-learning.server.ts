/**
 * Apprentissage des corrections d'extraction — serveur uniquement.
 *
 * Quand un humain corrige une ligne lue par l'IA (admin dans la file de
 * vérification, patient dans le détail de son ordonnance), la paire
 * « libellé lu → nom exact » est mémorisée. Les extractions suivantes
 * réutilisent ces corrections :
 *
 * - dans le prompt (les corrections les plus fréquentes sont montrées au
 *   modèle pour qu'il écrive directement le bon nom) ;
 * - après la lecture (application déterministe des corrections exactes ou
 *   très proches, avant la correspondance catalogue).
 *
 * L'IA ne réécrit ainsi jamais deux fois la même erreur, sans fine-tuning ni
 * réentraînement : c'est un apprentissage par corrections validées.
 */
import { prisma } from "@/server/db.server";
import { diceSimilarity, normalizeMedName } from "./medicine-match.server";

export type LearnedCorrection = {
  raw_name: string;
  corrected_name: string;
  source: string;
  hits: number;
};

/** Clé de comparaison stable (minuscules, sans accents, sans forme galénique). */
export function learningKey(raw: string | null | undefined): string {
  return normalizeMedName(raw ?? "").text;
}

function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 200);
}

/**
 * Charge les corrections mémorisées, les plus confirmées d'abord.
 * Toute panne (table pas encore migrée) renvoie une liste vide : l'extraction
 * ne doit jamais être bloquée par l'apprentissage.
 */
export async function loadLearnedCorrections(limit = 800): Promise<LearnedCorrection[]> {
  try {
    const rows = await prisma.ai_medicine_corrections.findMany({
      select: { raw_name: true, corrected_name: true, source: true, hits: true },
      orderBy: [{ hits: "desc" }, { updated_at: "desc" }],
      take: limit,
    });
    return rows;
  } catch {
    return [];
  }
}

/**
 * Applique les corrections apprises aux noms lus par l'IA.
 *
 * Une correction `patient` n'est appliquée qu'après deux confirmations : une
 * seule faute de frappe ne doit pas contaminer toutes les ordonnances à venir.
 */
export function applyLearnedCorrections<T extends { name: string }>(
  medicines: T[],
  corrections: LearnedCorrection[],
): T[] {
  if (medicines.length === 0 || corrections.length === 0) return medicines;

  const usable = corrections.filter((c) => {
    const key = learningKey(c.raw_name);
    if (!key || !c.corrected_name.trim()) return false;
    return c.source !== "patient" || c.hits >= 2;
  });
  if (usable.length === 0) return medicines;

  const exact = new Map<string, { name: string; hits: number }>();
  for (const c of usable) {
    const key = learningKey(c.raw_name);
    if (!key) continue;
    const name = cleanName(c.corrected_name);
    const prev = exact.get(key);
    // La correction la plus confirmée gagne.
    if (!prev || c.hits > prev.hits) exact.set(key, { name, hits: c.hits });
  }

  return medicines.map((m) => {
    const key = learningKey(m.name);
    if (!key) return m;

    let corrected = exact.get(key)?.name;

    if (!corrected) {
      // Variante OCR très proche uniquement (une lettre mal lue), jamais un nom
      // simplement ressemblant : au-delà du seuil on préfère ne rien changer.
      let best: { score: number; name: string; hits: number } | null = null;
      for (const c of usable) {
        const ck = learningKey(c.raw_name);
        if (!ck) continue;
        const score = diceSimilarity(key, ck);
        if (score < 0.9) continue;
        const candidate = cleanName(c.corrected_name);
        if (!best || score > best.score || (score === best.score && c.hits > best.hits)) {
          best = { score, name: candidate, hits: c.hits };
        }
      }
      corrected = best?.name;
    }

    if (!corrected || corrected === m.name) return m;
    return { ...m, name: corrected };
  });
}

/**
 * Mémorise une correction validée. Les corrections purement typographiques
 * (même nom normalisé) sont ignorées : elles n'apprennent rien au modèle.
 */
export async function recordMedicineCorrection(opts: {
  raw: string;
  corrected: string;
  source: "admin" | "patient" | "pharmacy";
  userId?: string | null;
}): Promise<void> {
  const rawKey = learningKey(opts.raw);
  const corrected = cleanName(opts.corrected);
  const correctedKey = learningKey(corrected);
  if (!rawKey || !corrected || !correctedKey || rawKey === correctedKey) return;

  try {
    await prisma.ai_medicine_corrections.upsert({
      where: {
        raw_name_corrected_name: { raw_name: rawKey, corrected_name: corrected },
      },
      create: {
        raw_name: rawKey,
        corrected_name: corrected,
        source: opts.source,
        created_by: opts.userId ?? null,
      },
      update: { hits: { increment: 1 }, source: opts.source },
    });
  } catch {
    // L'apprentissage est un bonus : une erreur ici ne doit jamais empêcher
    // l'enregistrement de la correction elle-même.
  }
}

/**
 * Bloc ajouté au prompt : les corrections les plus fréquentes, pour que le
 * modèle écrive directement le nom attendu au lieu de le réinventer.
 */
export function correctionsPromptHint(
  corrections: LearnedCorrection[],
  max = 80,
): string {
  const usable = corrections
    .filter((c) => c.source !== "patient" || c.hits >= 2)
    .filter((c) => learningKey(c.raw_name) && c.corrected_name.trim())
    .slice(0, max);
  if (usable.length === 0) return "";
  const lines = usable.map((c) => `- "${c.raw_name}" → "${cleanName(c.corrected_name)}"`);
  return `\n\nCorrections already validated by our pharmacists (left = handwriting as read, right = EXACT medicine name to write in "name"; apply them whenever the same word appears, never invent others):\n${lines.join("\n")}`;
}
