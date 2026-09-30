/**
 * Harnais d'évaluation de l'extraction d'ordonnances.
 *
 * Rejoue les ordonnances de la référence (`eval/golden.json`) à travers le
 * cœur pur `runPrescriptionVisionAi`, puis note le résultat. Aucun effet de
 * bord : la base n'est ni lue en écriture ni modifiée, aucun audit n'est créé.
 *
 * Ce qu'il mesure :
 *   - la stabilité  : le même document donne-t-il la même sortie qu'avant ?
 *   - les anomalies : quels noms de médicaments ne se raccordent à aucune
 *     pharmacie, quels termes ne sont pas des médicaments, quels doublons ?
 *
 * Ce qu'il ne mesure PAS : la justesse. La référence est un instantané de notre
 * propre comportement, pas une vérité terrain. Un score de 100 % signifie
 * « rien n'a changé », pas « tout est correct ».
 *
 * Options :
 *   --limit N        n'évaluer que les N premiers cas (utile pour un essai)
 *   --no-catalog     passer le catalogue à null : isole l'effet du prompt seul
 *   --out <fichier>  écrire aussi le rapport au format JSON
 *   --concurrency N  appels IA simultanés (défaut 1)
 *   --delay MS       pause entre deux cas (défaut 1500 ; voir aussi la gestion
 *                    de la limite de débit : l'attente « Too Many Requests »
 *                    est automatique et bien plus longue)
 *
 * Exécution :
 *   node_modules\.bin\tsx.cmd --env-file-if-exists=.env scripts/eval/run-eval.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readObject } from "../../src/server/storage.server";
import { runPrescriptionVisionAi } from "../../src/lib/rx-core.server";
import {
  bestCatalogMatch,
  loadCatalog,
  normalizeMedName,
  type CatalogMed,
} from "../../src/lib/medicine-match.server";

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const LIMIT = Number(value("limit") ?? Number.POSITIVE_INFINITY);
const NO_CATALOG = flag("no-catalog");
const OUT = value("out");
const CONCURRENCY = Math.max(1, Number(value("concurrency") ?? 1));
// Pause courte entre cas : la grosse attente (quota epuise) est gere dans
// `callVisionQuotaAware` case par case, pas ici.
const DELAY = Number(value("delay") ?? 1500);

// ---------------------------------------------------------------- anomalies
/**
 * Termes qui désignent un dispositif, un consommable ou un soluté. Ce ne sont
 * pas des médicaments : les proposer à la commande conduit la pharmacie à
 * chercher un produit qui n'existe pas. Heuristique, signalée comme telle.
 */
const NON_MEDICINE = new Set([
  "eau",
  "serum",
  "sale",
  "saline",
  "sg",
  "ringer",
  "glucose",
  "catheter",
  "seringue",
  "aiguille",
  "gaze",
  "compresse",
  "pansement",
  "bandage",
  "gant",
  "masque",
  "coton",
  "alcool",
  "poire",
  "pipette",
  "bandelette",
  "lecteur",
  "appareil",
  "tensiometre",
  "perfusion",
  "perfuseur",
  "tubulure",
  "thermos",
]);

function looksLikeNonMedicine(name: string): string | null {
  const tokens = normalizeMedName(name).tokens;
  for (const t of tokens) if (NON_MEDICINE.has(t)) return t;
  return null;
}

// ---------------------------------------------------------------- comparaison
type GoldenCase = {
  id: string;
  file_path: string;
  file_mime: string;
  persisted_status: string;
  expected: {
    is_prescription: boolean | null;
    prescription_date: string | null;
    confidence: number | null;
    medicines: string[];
  };
};

/** Clé de comparaison : insensible aux accents, à la casse et au pluriel. */
function medKey(name: string): string {
  const n = normalizeMedName(name);
  return n.text || n.core;
}

function setDiff(a: string[], b: string[]) {
  const as = new Set(a);
  const bs = new Set(b);
  return {
    same: [...as].filter((k) => bs.has(k)),
    added: [...as].filter((k) => !bs.has(k)),
    missed: [...bs].filter((k) => !as.has(k)),
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const pct = (n: number, d: number) => (d === 0 ? 1 : n / d);

// ---------------------------------------------------------------- exécution
type CaseReport = {
  id: string;
  file: string;
  error?: string;
  isPrescription: { expected: boolean | null; got: boolean; same: boolean };
  date: { expected: string | null; got: string | null; same: boolean };
  medicines: { expected: string[]; got: string[]; same: string[]; added: string[]; missed: string[] };
  notInCatalog: string[];
  nonMedicines: Array<{ name: string; token: string }>;
  duplicateCores: string[];
};

/**
 * Appelle le cœur pur en absorbant la limite de débit du fournisseur IA.
 *
 * Le quota (Google AI Studio, plan gratuit) se régénère trop lentement pour
 * tenir 14 ordonnances d'affilée : au premier « Too Many Requests », on attend
 * plusieurs minutes puis on réessaie le MÊME cas. Sans cela, un seul passage
 * échoue en masse et ne produit aucune mesure exploitable.
 */
const QUOTA_MAX_ATTEMPTS = 5;
const QUOTA_BASE_WAIT_MS = 240_000; // 4 min, x2 a chaque essai : 4, 8, 12, 16 min

async function callVisionQuotaAware(
  bytes: Buffer,
  mime: string,
  catalog: CatalogMed[] | null,
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await runPrescriptionVisionAi(bytes, mime, catalog);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isQuota = /too many requests|exceeded your current quota|429/i.test(msg);
      if (!isQuota || attempt >= QUOTA_MAX_ATTEMPTS) {
        throw isQuota
          ? new Error(`quota epuise apres ${QUOTA_MAX_ATTEMPTS} tentatives : ${msg.slice(0, 80)}`)
          : e;
      }
      const waitMs = QUOTA_BASE_WAIT_MS * attempt; // 4 min, 8 min, 12 min...
      console.error(`  (quota — tentative ${attempt}/${QUOTA_MAX_ATTEMPTS} dans ${Math.round(waitMs / 1000)} s)`);
      await sleep(waitMs);
    }
  }
}

async function evaluateCase(
  c: GoldenCase,
  catalog: CatalogMed[] | null,
): Promise<CaseReport> {
  const base: CaseReport = {
    id: c.id,
    file: c.file_path,
    isPrescription: { expected: c.expected.is_prescription, got: false, same: false },
    date: { expected: c.expected.prescription_date, got: null, same: false },
    medicines: { expected: c.expected.medicines, got: [], same: [], added: [], missed: [] },
    notInCatalog: [],
    nonMedicines: [],
    duplicateCores: [],
  };

  let bytes: Buffer;
  try {
    bytes = await readObject("prescriptions", c.file_path);
  } catch {
    base.error = "fichier introuvable dans le stockage";
    return base;
  }

  const out = await callVisionQuotaAware(bytes, c.file_mime, catalog);
  const got = out.medicines.map((m) => m.name.trim()).filter((n) => n.length > 0);

  base.isPrescription = {
    expected: c.expected.is_prescription,
    got: out.is_prescription,
    same: c.expected.is_prescription === out.is_prescription,
  };
  base.date = {
    expected: c.expected.prescription_date,
    got: out.prescription_date,
    same: (out.prescription_date ?? null) === (c.expected.prescription_date ?? null),
  };

  const d = setDiff(got.map(medKey), c.expected.medicines.map(medKey));
  const byKey = new Map<string, string>();
  for (const n of got) byKey.set(medKey(n), n);
  for (const n of c.expected.medicines) byKey.set(medKey(n), n);
  base.medicines = {
    expected: c.expected.medicines,
    got,
    same: d.same.map((k) => byKey.get(k) ?? k),
    added: d.added.map((k) => byKey.get(k) ?? k),
    missed: d.missed.map((k) => byKey.get(k) ?? k),
  };

  if (catalog) {
    for (const n of got) if (!bestCatalogMatch(n, catalog)) base.notInCatalog.push(n);
  }
  for (const n of got) {
    const tok = looksLikeNonMedicine(n);
    if (tok) base.nonMedicines.push({ name: n, token: tok });
  }
  const seen = new Map<string, number>();
  for (const n of got) {
    const core = normalizeMedName(n).core;
    if (!core) continue;
    seen.set(core, (seen.get(core) ?? 0) + 1);
  }
  base.duplicateCores = [...seen.entries()].filter(([, c2]) => c2 > 1).map(([k]) => k);

  return base;
}

async function main() {
  const goldenPath = path.resolve("eval/golden.json");
  let doc: { catalog_size: number; cases: GoldenCase[] };
  try {
    doc = JSON.parse(readFileSync(goldenPath, "utf8"));
  } catch {
    console.error(
      `Reference introuvable (${goldenPath}).\n` +
        `Generez-la d'abord : npm run eval:golden`,
    );
    process.exitCode = 1;
    return;
  }

  const catalog = NO_CATALOG ? null : await loadCatalog();
  const cases = doc.cases.slice(0, LIMIT);

  console.log("=".repeat(78));
  console.log("SAHA — evaluation de l'extraction d'ordonnances");
  console.log("=".repeat(78));
  console.log(`  cas        : ${cases.length}`);
  console.log(`  catalogue  : ${catalog ? `${catalog.length} entrees` : "desactive (--no-catalog)"}`);
  console.log(`  note       : score de stabilite, pas de justesse (cf. eval/README.md)`);
  console.log("");

  const reports: CaseReport[] = [];
  for (let i = 0; i < cases.length; i += CONCURRENCY) {
    const batch = cases.slice(i, i + CONCURRENCY);
    const done = await Promise.all(
      batch.map(async (c): Promise<CaseReport> => {
        try {
          return await evaluateCase(c, catalog);
        } catch (e) {
          // Limite de débit, coupure reseau, schema invalide : on note le cas
          // en echec et on continue, plutot que de perdre tout le passage.
          const msg = e instanceof Error ? e.message : String(e);
          return {
            id: c.id,
            file: c.file_path,
            error: msg.replace(/\s+/g, " ").slice(0, 120),
            isPrescription: { expected: null, got: false, same: false },
            date: { expected: null, got: null, same: false },
            medicines: { expected: c.expected.medicines, got: [], same: [], added: [], missed: [] },
            notInCatalog: [],
            nonMedicines: [],
            duplicateCores: [],
          };
        }
      }),
    );
    reports.push(...done);
    const n = Math.min(i + CONCURRENCY, cases.length);
    process.stdout.write(`  ... ${n}/${cases.length} cas traites\r`);
    if (i + CONCURRENCY < cases.length && DELAY > 0) {
      await new Promise((r) => setTimeout(r, DELAY));
    }
  }
  process.stdout.write(" ".repeat(40) + "\n\n");

  // ---------------------------------------------------------------- tableau
  const row = (label: string, v: string) => `  ${label.padEnd(9)}${v}`;
  console.log(row("cas", "fichier / verdict"));
  console.log("  " + "-".repeat(74));
  reports.forEach((r, i) => {
    const head = `#${String(i + 1).padEnd(3)} ${r.id.slice(0, 8)}`;
    if (r.error) {
      console.log(`  ${head} ERREUR — ${r.error}`);
      return;
    }
    const nExp = r.medicines.expected.length;
    const nGot = r.medicines.got.length;
    const same = r.medicines.same.length;
    const flags: string[] = [];
    if (!r.isPrescription.same) flags.push("verdict≠");
    if (!r.date.same) flags.push("date≠");
    if (r.notInCatalog.length) flags.push(`${r.notInCatalog.length} hors-catalogue`);
    if (r.nonMedicines.length) flags.push("non-medicament");
    if (r.duplicateCores.length) flags.push("doublon");
    console.log(
      `  ${head} ${String(nGot).padStart(2)} med. | inchange ${same}/${nExp}` +
        `  | +${r.medicines.added.length} -${r.medicines.missed.length}` +
        `  ${flags.length ? " | " + flags.join(", ") : ""}`,
    );
  });

  // ---------------------------------------------------------------- anomalies
  const anomalies: string[] = [];
  for (const [i, r] of reports.entries()) {
    if (r.error) continue;
    for (const n of r.notInCatalog)
      anomalies.push(`#${i + 1}  hors catalogue : "${n}" (aucune pharmacie ne pourra le servir)`);
    for (const n of r.nonMedicines)
      anomalies.push(`#${i + 1}  non-medicament : "${n.name}" (mot-clé « ${n.token} »)`);
    for (const c of r.duplicateCores)
      anomalies.push(`#${i + 1}  doublon : « ${c} » apparait sur plusieurs lignes`);
  }
  if (anomalies.length) {
    console.log("\nAnomalies");
    console.log("  " + "-".repeat(74));
    for (const a of anomalies) console.log(`  ${a}`);
  } else {
    console.log("\nAucune anomalie detectee.");
  }

  // ---------------------------------------------------------------- bilan
  const ok = reports.filter((r) => !r.error);
  const totalSame = ok.reduce((a, r) => a + r.medicines.same.length, 0);
  const totalGot = ok.reduce((a, r) => a + r.medicines.got.length, 0);
  const totalExp = ok.reduce((a, r) => a + r.medicines.expected.length, 0);
  const totalMissed = ok.reduce((a, r) => a + r.medicines.missed.length, 0);
  const totalAdded = ok.reduce((a, r) => a + r.medicines.added.length, 0);
  const linked = ok.reduce((a, r) => a + (r.medicines.got.length - r.notInCatalog.length), 0);
  const verdictOk = ok.filter((r) => r.isPrescription.same).length;
  const dateOk = ok.filter((r) => r.date.same).length;

  console.log("\nBilan");
  console.log("  " + "-".repeat(74));
  console.log(`  cas traites              : ${ok.length}/${reports.length}`);
  console.log(`  verdict identique        : ${verdictOk}/${ok.length}`);
  console.log(`  date identique           : ${dateOk}/${ok.length}`);
  console.log(`  medicaments inchanges    : ${totalSame} / ${totalExp} attendus (${Math.round(pct(totalSame, totalExp) * 100)} % de rappel)`);
  console.log(`  precision (rien en trop)  : ${Math.round(pct(totalSame, totalGot) * 100)} %`);
  console.log(`  ajoutes / manques        : +${totalAdded} / -${totalMissed}`);
  console.log(`  raccorde au catalogue    : ${linked}/${totalGot} (${Math.round(pct(linked, totalGot) * 100)} %)`);
  console.log(`  anomalies                : ${anomalies.length}`);

  if (OUT) {
    const outPath = path.resolve(OUT);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(
      outPath,
      JSON.stringify({ ran_at: new Date().toISOString(), catalog: !!catalog, reports }, null, 2),
      "utf8",
    );
    console.log(`\nRapport JSON : ${outPath}`);
  }
}

main().catch((e) => {
  console.error("Echec :", e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
