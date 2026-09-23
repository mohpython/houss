/**
 * Single, deterministic medicine ↔ stock matching engine — server only.
 * Used by pharmacy search, automatic routing, reservation pricing, OTC and the
 * WhatsApp bot so that the same prescription always yields the same result.
 */
import { prisma } from "@/server/db.server";

/** Words that describe a form / packaging, never the product itself. */
const NOISE = new Set([
  "cp",
  "cps",
  "comp",
  "comprime",
  "comprimes",
  "co",
  "tab",
  "tabs",
  "tablet",
  "tablets",
  "gelule",
  "gelules",
  "gel",
  "capsule",
  "capsules",
  "caps",
  "sirop",
  "syrup",
  "sol",
  "solution",
  "susp",
  "suspension",
  "buv",
  "buvable",
  "inj",
  "injectable",
  "amp",
  "ampoule",
  "ampoules",
  "fl",
  "flacon",
  "flacons",
  "tube",
  "tubes",
  "creme",
  "cream",
  "pommade",
  "collyre",
  "gouttes",
  "drops",
  "sachet",
  "sachets",
  "pl",
  "plaquette",
  "plaquettes",
  "bte",
  "boite",
  "boites",
  "box",
  "dermique",
  "sterile",
  "steriles",
  "enfant",
  "enfants",
  "adulte",
  "adultes",
  "nourrisson",
  "forte",
  "fort",
  "simple",
  "retard",
  "lp",
  "eff",
  "effervescent",
  "sec",
  "ovule",
  "ovules",
  "poudre",
  "spray",
  "patch",
  "unite",
  "unites",
  "de",
  "du",
  "des",
  "le",
  "la",
  "les",
  "et",
  "x",
  "b",
  "p",
  "t",
  "n",
  "pcs",
  "pieces",
]);

const UNIT_RE =
  /^\d+([.,]\d+)?(mg|g|gr|kg|ml|l|cl|mcg|µg|ug|ui|iu|%|cc|mmol|meq)(\/\d*([.,]\d+)?(mg|g|ml|l|kg)?)?$/;
const PACK_RE = /^(b|p|bt|bte|t)\/?\d+[a-z]*$/;
const DIM_RE = /^\d+x\d+$/;

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%µ/x]+/g, " ")
    .replace(/(\d)\s*x\s*(\d)/g, "$1x$2")
    .replace(/(\d+)\s*(mg|g|ml|mcg|ui|%|cc)\b/g, "$1$2")
    .trim();
}

function stem(t: string) {
  return t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t;
}

export type NormalizedName = {
  /** Meaningful tokens, in order (brand / generic words + size like 40x40). */
  tokens: string[];
  /** First meaningful word — usually the brand or the generic name. */
  core: string;
  /** Size / dimension token when present (e.g. "40x40"). */
  dim: string | null;
  /** Joined normalized string. */
  text: string;
};

export function normalizeMedName(raw: string | null | undefined): NormalizedName {
  const folded = fold(raw ?? "");
  const tokens: string[] = [];
  let dim: string | null = null;
  for (const t0 of folded.split(/\s+/)) {
    const t = t0.replace(/^\/+|\/+$/g, "");
    if (!t) continue;
    if (DIM_RE.test(t)) {
      dim = dim ?? t;
      tokens.push(t);
      continue;
    }
    if (/^\d+([.,]\d+)?$/.test(t)) continue;
    if (UNIT_RE.test(t) || PACK_RE.test(t)) continue;
    if (t.length < 2) continue;
    const s = stem(t);
    if (NOISE.has(s) || NOISE.has(t)) continue;
    tokens.push(s);
  }
  const words = tokens.filter((t) => !DIM_RE.test(t));
  const core = words[0] ?? tokens[0] ?? folded.split(/\s+/)[0] ?? "";
  return { tokens, core, dim, text: tokens.join(" ") };
}

function bigrams(s: string) {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice similarity on character bigrams (0..1). */
export function diceSimilarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.length === 0 || B.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of B) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      hits++;
      counts.set(g, c - 1);
    }
  }
  return (2 * hits) / (A.length + B.length);
}

/** Minimum score for a candidate to be considered the same medicine. */
export const MATCH_THRESHOLD = 70;

/**
 * Scores how likely `item` (prescription line) and `cand` (catalog entry)
 * designate the same product. 0..100, deterministic.
 */
export function scoreNames(item: NormalizedName, cand: NormalizedName): number {
  if (!item.core || !cand.core) return 0;
  // Different explicit sizes (10x10 vs 40x40) are different products.
  if (item.dim && cand.dim && item.dim !== cand.dim) return 0;

  let score = 0;
  if (item.text === cand.text) score = 100;
  else if (item.core === cand.core && item.core.length >= 4) score = 90;
  else {
    const iw = item.tokens;
    const cw = cand.tokens;
    const allIn = (a: string[], b: string[]) => a.length > 0 && a.every((t) => b.includes(t));
    if (allIn(iw, cw) || allIn(cw, iw)) score = 80;
    else {
      const sim = diceSimilarity(item.core, cand.core);
      if (sim >= 0.72 && Math.min(item.core.length, cand.core.length) >= 5) {
        score = Math.round(55 + sim * 40); // 0.72 → 84 … capped below
        if (score > 88) score = 88;
      }
    }
  }
  if (score === 0) return 0;
  // Penalise catalog rows that carry many extra words (concatenated price-list rows).
  const extra = cand.tokens.length - item.tokens.length;
  if (extra > 2) score -= (extra - 2) * 8;
  return Math.max(0, score);
}

export type CatalogMed = {
  id: string;
  normalized_name: string;
  generic_name?: string | null;
};

export type InventoryLine = {
  pharmacy_id?: string;
  stock_qty: number | null;
  price: number | null;
  medicines: CatalogMed | null;
};

export type RxItemLike = {
  id: string;
  medicine_name_raw: string;
  normalized_medicine_id?: string | null;
};

function bestScore(item: NormalizedName, med: CatalogMed) {
  const s1 = scoreNames(item, normalizeMedName(med.normalized_name));
  const s2 = med.generic_name ? scoreNames(item, normalizeMedName(med.generic_name)) : 0;
  return Math.max(s1, s2);
}

/**
 * Finds the inventory line of ONE pharmacy that best matches a prescription
 * line. Uses the catalog link (`normalized_medicine_id`) first, then the name
 * engine. Ties are broken deterministically (in-stock, shorter name, id).
 */
export function bestInventoryMatch<L extends InventoryLine>(
  item: RxItemLike,
  inventory: L[],
): { line: L; score: number } | null {
  if (item.normalized_medicine_id) {
    const exact = inventory
      .filter((l) => l.medicines?.id === item.normalized_medicine_id)
      .sort((a, b) => (b.stock_qty ?? 0) - (a.stock_qty ?? 0))[0];
    if (exact) return { line: exact, score: 100 };
  }
  const n = normalizeMedName(item.medicine_name_raw);
  let best: { line: L; score: number } | null = null;
  for (const line of inventory) {
    if (!line.medicines) continue;
    const score = bestScore(n, line.medicines);
    if (score < MATCH_THRESHOLD) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        (line.stock_qty ?? 0) > 0 !== (best.line.stock_qty ?? 0) > 0 &&
        (line.stock_qty ?? 0) > 0) ||
      (score === best.score &&
        (line.stock_qty ?? 0) > 0 === (best.line.stock_qty ?? 0) > 0 &&
        (line.medicines.normalized_name.length < best.line.medicines!.normalized_name.length ||
          (line.medicines.normalized_name.length === best.line.medicines!.normalized_name.length &&
            line.medicines.id < best.line.medicines!.id)))
    ) {
      best = { line, score };
    }
  }
  return best;
}

export type ItemAvailability = {
  itemId: string;
  name: string;
  available: boolean;
  price: number | null;
  medicineId: string | null;
};

/** Availability of every prescription line inside one pharmacy's inventory. */
export function matchItemsToInventory<L extends InventoryLine>(
  items: RxItemLike[],
  inventory: L[],
): ItemAvailability[] {
  return items.map((it) => {
    const hit = bestInventoryMatch(it, inventory);
    const available = !!hit && (hit.line.stock_qty ?? 0) > 0;
    return {
      itemId: it.id,
      name: it.medicine_name_raw,
      available,
      price: available ? (hit!.line.price ?? null) : null,
      medicineId: hit?.line.medicines?.id ?? null,
    };
  });
}

/** Best catalog entry for a free-text medicine name (no stock involved). */
export function bestCatalogMatch(name: string, catalog: CatalogMed[]): CatalogMed | null {
  const n = normalizeMedName(name);
  let best: { med: CatalogMed; score: number } | null = null;
  for (const med of catalog) {
    const score = bestScore(n, med);
    if (score < 80) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        (med.normalized_name.length < best.med.normalized_name.length ||
          (med.normalized_name.length === best.med.normalized_name.length && med.id < best.med.id)))
    ) {
      best = { med, score };
    }
  }
  return best?.med ?? null;
}

/** Loads the whole catalog (a few hundred rows). */
export async function loadCatalog(): Promise<CatalogMed[]> {
  const data = await prisma.medicines.findMany({
    select: { id: true, normalized_name: true, generic_name: true },
    orderBy: { normalized_name: "asc" },
    take: 2000,
  });
  return data as CatalogMed[];
}

/**
 * Links every line of a prescription to a catalog medicine once and for all,
 * so later searches are stable regardless of AI wording variations.
 */
export async function linkPrescriptionItemsToCatalog(prescriptionId: string): Promise<number> {
  const items = await prisma.prescription_items.findMany({
    where: { prescription_id: prescriptionId },
    select: { id: true, medicine_name_raw: true },
  });
  if (items.length === 0) return 0;
  const catalog = await loadCatalog();
  let linked = 0;
  for (const it of items) {
    const med = bestCatalogMatch(it.medicine_name_raw, catalog);
    await prisma.prescription_items.update({
      where: { id: it.id },
      data: { normalized_medicine_id: med?.id ?? null },
    });
    if (med) linked++;
  }
  return linked;
}

/** Short, deduplicated catalog name list to help the AI spell names consistently. */
export function catalogHint(catalog: CatalogMed[], max = 400): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const m of catalog) {
    const core = normalizeMedName(m.normalized_name).core;
    if (!core || seen.has(core)) continue;
    seen.add(core);
    names.push(core);
    if (names.length >= max) break;
  }
  return names.join(", ");
}
