/**
 * Construit la référence d'évaluation (`eval/golden.json`) à partir des
 * ordonnances déjà traitées en base.
 *
 * ⚠️ Ce n'est PAS une vérité terrain. C'est une **référence de régression** :
 * elle fige ce que l'IA produisait à une date donnée. Servir à répondre à deux
 * questions très différentes :
 *
 *   1. « Mon changement a-t-il modifié le comportement ? » → on compare deux
 *      exécutions du harnais entre elles.
 *   2. « Quels noms de médicaments sortent du lot ? » → le rapport liste les
 *      noms absents du catalogue, les non-médicaments et les doublons.
 *
 * La correction réelle d'une ordonnance se fait par relecture humaine
 * (`review_status` dans l'espace admin) : c'est là que la vérité se construit.
 *
 * Le fichier n'est pas versionné (il contient des données de patients) ; il se
 * régénère sur le serveur.
 *
 * Exécution :
 *   node_modules\.bin\tsx.cmd --env-file-if-exists=.env scripts/eval/build-golden.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Raw = {
  is_prescription?: boolean;
  prescription_date?: string | null;
  confidence?: number;
  authenticity_score?: number;
  medicines?: Array<{ name?: string }>;
};

async function main() {
  const rows = await prisma.prescriptions.findMany({
    // Pour un champ Json nullable, « non nul » s'écrit `not: DbNull` : passer
    // `NOT: { ai_raw: null }` fait échouer la requête.
    where: { ai_raw: { not: Prisma.DbNull } },
    select: {
      id: true,
      file_path: true,
      file_mime: true,
      status: true,
      ai_raw: true,
      prescription_items: { select: { medicine_name_raw: true } },
    },
    orderBy: { created_at: "asc" },
  });

  const medicinesCount = await prisma.medicines.count();
  const cases = rows
    .map((r) => {
      const raw = (r.ai_raw ?? {}) as Raw;
      const aiNames = (raw.medicines ?? [])
        .map((m) => (m?.name ?? "").trim())
        .filter((n) => n.length > 0);
      return {
        id: r.id,
        file_path: r.file_path,
        file_mime: r.file_mime,
        persisted_status: r.status,
        expected: {
          is_prescription: raw.is_prescription ?? null,
          prescription_date: raw.prescription_date ?? null,
          confidence: raw.confidence ?? null,
          medicines: aiNames,
        },
        persisted_medicines: r.prescription_items.map((i) => i.medicine_name_raw),
      };
    })
    .filter((c) => c.expected.medicines.length > 0 || c.expected.is_prescription !== null);

  const doc = {
    generated_at: new Date().toISOString(),
    catalog_size: medicinesCount,
    warning:
      "Reference de REGRESSION, pas une verite terrain. Corriger une ordonnance se fait " +
      "par relecture humaine (review_status) avant de figer une nouvelle reference.",
    cases,
  };

  const out = path.resolve("eval/golden.json");
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc, null, 2), "utf8");

  const withMeds = cases.filter((c) => c.expected.medicines.length > 0).length;
  console.log(`Reference ecrite : ${out}`);
  console.log(`  cas                : ${cases.length}`);
  console.log(`  avec medicaments   : ${withMeds}`);
  console.log(`  taille catalogue   : ${medicinesCount}`);
}

main()
  .catch((e) => {
    console.error("Echec :", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
