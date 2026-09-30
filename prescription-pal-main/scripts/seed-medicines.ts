/**
 * Seed du catalogue `medicines` + stock de la pharmacie démo.
 *
 * - Idempotent : ne crée que les lignes manquantes.
 * - `normalized_name` en minuscules SANS accent : c'est la clé de recherche
 *   du stock (pharmacy-portal / API mobile) et le candidat du matching IA
 *   (dice similarity via normalizeMedName).
 * - Inventaire : ~la moitié du catalogue chez « Pharmacie du Centre »
 *   (ML-PH-DEMO-1), quantités et prix FCFA déterministes.
 *
 * Exécution :
 *   node_modules\.bin\tsx.cmd --env-file-if-exists=.env scripts/seed-medicines.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** [normalized_name, generic_name, strength, form] */
type Med = [string, string | null, string | null, string];

const CATALOG: Med[] = [
  // ---------------------------------------------------------------- antalgiques / AINS
  ["paracetamol", null, "500 mg", "cp"],
  ["paracetamol", null, "1 g", "cp"],
  ["paracetamol", null, "100 mg/5 ml", "sirop"],
  ["paracetamol", null, "125 mg/5 ml", "sirop"],
  ["fanaser", "paracetamol + cafeine", "500/50 mg", "cp"],
  ["ibuprofene", null, "400 mg", "cp"],
  ["ibuprofene", null, "200 mg", "cp"],
  ["ibuprofene", null, "100 mg/5 ml", "sirop"],
  ["ibuprofene", null, "5 %", "gel"],
  ["diclofenac", null, "50 mg", "cp"],
  ["diclofenac", null, "75 mg/3 ml", "inj"],
  ["diclofenac", null, "1 %", "gel"],
  ["aspirine", "acide acetylsalicylique", "500 mg", "cp"],
  ["aspirine", "acide acetylsalicylique", "100 mg", "cp"],
  ["aspirine", "acide acetylsalicylique", "300 mg", "cp"],
  ["tramadol", null, "50 mg", "cp"],
  ["morphine", null, "10 mg", "cp"],
  ["morphine", null, "10 mg/ml", "inj"],
  ["naproxene", null, "250 mg", "cp"],
  ["ketoprofene", null, "100 mg", "cp"],
  ["piroxicam", null, "20 mg", "cp"],
  ["meloxicam", null, "15 mg", "cp"],
  ["nimesulide", null, "100 mg", "cp"],
  ["phloroglucinol", null, "80 mg", "cp"],
  ["poudre antalgique", "paracetamol + cafeine", "300/30 mg", "sachet"],

  // ---------------------------------------------------------------- antipaludiques
  ["coartem", "artemether + lumefantrine", "20/120 mg", "cp"],
  ["coartem", "artemether + lumefantrine", "15/90 mg", "cp"],
  ["artemether lumefantrine", null, "20/120 mg", "cp"],
  ["artemether lumefantrine", null, "15/90 mg", "cp"],
  ["artesunate", null, "50 mg", "cp"],
  ["artesunate", null, "60 mg", "inj"],
  ["artesunate amodiaquine", null, "150/450 mg", "cp"],
  ["amodiaquine", null, "153 mg", "cp"],
  ["sulfadoxine pyrimethamine", null, "500/25 mg", "cp"],
  ["atovaquone proguanil", null, "250/100 mg", "cp"],
  ["quinine", null, "300 mg", "cp"],
  ["quinine", null, "300 mg/2 ml", "inj"],
  ["chloroquine", null, "250 mg", "cp"],
  ["primaquine", null, "15 mg", "cp"],
  ["dihydroartemisinine piperaquine", null, "40/320 mg", "cp"],

  // ---------------------------------------------------------------- antibiotiques
  ["amoxicilline", null, "250 mg", "gél"],
  ["amoxicilline", null, "500 mg", "gél"],
  ["amoxicilline", null, "500 mg", "cp"],
  ["amoxicilline", null, "1 g", "cp"],
  ["amoxicilline", null, "250 mg/5 ml", "sirop"],
  ["amoxicilline", null, "500 mg/5 ml", "sirop"],
  ["augmentin", "amoxicilline + acide clavulanique", "500/125 mg", "cp"],
  ["augmentin", "amoxicilline + acide clavulanique", "1 g/125 mg", "cp"],
  ["amoxicilline acide clavulanique", null, "500/125 mg", "cp"],
  ["amoxicilline acide clavulanique", null, "1 g/125 mg", "cp"],
  ["amoxicilline acide clavulanique", null, "200/28.5 mg/5 ml", "sirop"],
  ["amoxicilline acide clavulanique", null, "400/57 mg/5 ml", "sirop"],
  ["azithromycine", null, "250 mg", "cp"],
  ["azithromycine", null, "500 mg", "cp"],
  ["azithromycine", null, "200 mg/5 ml", "sirop"],
  ["ciprofloxacine", null, "250 mg", "cp"],
  ["ciprofloxacine", null, "500 mg", "cp"],
  ["ciprofloxacine", null, "3 mg/ml", "collyre"],
  ["norfloxacine", null, "400 mg", "cp"],
  ["ofloxacine", null, "200 mg", "cp"],
  ["doxycycline", null, "100 mg", "cp"],
  ["clindamycine", null, "300 mg", "gél"],
  ["clindamycine", null, "600 mg", "inj"],
  ["metronidazole", null, "250 mg", "cp"],
  ["metronidazole", null, "500 mg", "cp"],
  ["metronidazole", null, "200 mg/5 ml", "sirop"],
  ["cotrimoxazole", "trimethoprim + sulfamethoxazole", "400/80 mg", "cp"],
  ["cotrimoxazole", "trimethoprim + sulfamethoxazole", "800/160 mg", "cp"],
  ["cotrimoxazole", "trimethoprim + sulfamethoxazole", "120/24 mg/5 ml", "sirop"],
  ["ceftriaxone", null, "1 g", "inj"],
  ["ceftriaxone", null, "500 mg", "inj"],
  ["cefotaxime", null, "1 g", "inj"],
  ["gentamicine", null, "80 mg/2 ml", "inj"],
  ["erythromycine", null, "250 mg", "cp"],
  ["erythromycine", null, "250 mg/5 ml", "sirop"],
  ["clarithromycine", null, "250 mg", "cp"],
  ["vancomycine", null, "500 mg", "inj"],
  ["tetracycline", null, "500 mg", "cp"],
  ["chloramphenicol", null, "250 mg", "gél"],
  ["chloramphenicol", null, "0.5 %", "collyre"],
  ["nitrofurantoine", null, "50 mg", "cp"],
  ["fosfomycine", null, "3 g", "sachet"],
  ["acyclovir", null, "200 mg", "cp"],
  ["acyclovir", null, "5 %", "creme"],
  ["fluconazole", null, "150 mg", "cp"],
  ["fluconazole", null, "200 mg", "cp"],
  ["itraconazole", null, "100 mg", "gél"],
  ["ketoconazole", null, "200 mg", "cp"],
  ["ketoconazole", null, "2 %", "shampooing"],
  ["griseofulvine", null, "250 mg", "cp"],
  ["terbinafine", null, "250 mg", "cp"],
  ["terbinafine", null, "1 %", "creme"],

  // ---------------------------------------------------------------- gastro-entérologie
  ["omeprazole", null, "20 mg", "gél"],
  ["omeprazole", null, "40 mg", "gél"],
  ["lansoprazole", null, "30 mg", "gél"],
  ["pantoprazole", null, "40 mg", "cp"],
  ["famotidine", null, "20 mg", "cp"],
  ["metoclopramide", null, "10 mg", "cp"],
  ["metoclopramide", null, "10 mg/2 ml", "inj"],
  ["domperidone", null, "10 mg", "cp"],
  ["ondansetron", null, "4 mg", "cp"],
  ["buscopan", "butylscopolamine", "10 mg", "cp"],
  ["sel de rehydratation orale", "sels de rehydratation orale", null, "sachet"],
  ["ors", "sels de rehydratation orale", null, "sachet"],
  ["zinc", null, "20 mg", "cp"],
  ["zinc", null, "10 mg/5 ml", "sirop"],
  ["loperamide", null, "2 mg", "cp"],
  ["charbon active", null, "500 mg", "cp"],
  ["lactulose", null, "667 mg/ml", "sirop"],

  // ---------------------------------------------------------------- cardiovasculaire
  ["amlodipine", null, "5 mg", "cp"],
  ["amlodipine", null, "10 mg", "cp"],
  ["losartan", null, "50 mg", "cp"],
  ["losartan", null, "100 mg", "cp"],
  ["atenolol", null, "50 mg", "cp"],
  ["atenolol", null, "100 mg", "cp"],
  ["metoprolol", null, "50 mg", "cp"],
  ["propranolol", null, "40 mg", "cp"],
  ["hydrochlorothiazide", null, "25 mg", "cp"],
  ["furosemide", null, "40 mg", "cp"],
  ["furosemide", null, "10 mg/ml", "inj"],
  ["spironolactone", null, "25 mg", "cp"],
  ["digoxine", null, "0.25 mg", "cp"],
  ["warfarine", null, "5 mg", "cp"],
  ["clopidogrel", null, "75 mg", "cp"],
  ["simvastatine", null, "20 mg", "cp"],
  ["atorvastatine", null, "20 mg", "cp"],
  ["rosuvastatine", null, "10 mg", "cp"],
  ["ramipril", null, "5 mg", "cp"],
  ["enalapril", null, "10 mg", "cp"],
  ["captopril", null, "25 mg", "cp"],
  ["nifedipine", null, "10 mg", "cp"],
  ["verapamil", null, "80 mg", "cp"],
  ["methyldopa", null, "250 mg", "cp"],
  ["labetalol", null, "100 mg", "cp"],
  ["heparine", "heparine sodique", "5 000 UI", "inj"],
  ["acide acetilsalicylique", null, "75 mg", "cp"],

  // ---------------------------------------------------------------- diabète
  ["metformine", null, "500 mg", "cp"],
  ["metformine", null, "850 mg", "cp"],
  ["glibenclamide", null, "5 mg", "cp"],
  ["gliclazide", null, "80 mg", "cp"],
  ["insuline humaine", null, "100 UI/ml", "inj"],
  ["insuline glargine", null, "100 UI/ml", "inj"],
  ["insuline asparte", null, "100 UI/ml", "inj"],

  // ---------------------------------------------------------------- respiratoire
  ["ventoline", "salbutamol", "100 µg/dose", "inhalateur"],
  ["salbutamol", null, "100 µg/dose", "inhalateur"],
  ["salbutamol", null, "4 mg", "cp"],
  ["salbutamol", null, "2 mg/5 ml", "sirop"],
  ["beclometasone", null, "200 µg/dose", "inhalateur"],
  ["budesonide", null, "100 µg/dose", "inhalateur"],
  ["ambroxol", null, "30 mg/5 ml", "sirop"],
  ["acetilcysteine", null, "600 mg", "sachet"],
  ["theophylline", null, "100 mg", "cp"],

  // ---------------------------------------------------------------- neurologie / psychiatrie
  ["diazepam", null, "5 mg", "cp"],
  ["diazepam", null, "10 mg", "cp"],
  ["lorazepam", null, "2.5 mg", "cp"],
  ["phenobarbital", null, "100 mg", "cp"],
  ["carbamazepine", null, "200 mg", "cp"],
  ["valproate de sodium", null, "500 mg", "cp"],
  ["levetiracetam", null, "500 mg", "cp"],
  ["levetiracetam", null, "250 mg", "cp"],
  ["phenytoine", null, "100 mg", "cp"],
  ["gabapentin", null, "300 mg", "cp"],
  ["amitriptyline", null, "25 mg", "cp"],
  ["fluoxetine", null, "20 mg", "cp"],
  ["sertraline", null, "50 mg", "cp"],
  ["risperidone", null, "2 mg", "cp"],
  ["haloperidol", null, "5 mg", "cp"],
  ["haloperidol", null, "5 mg/ml", "inj"],

  // ---------------------------------------------------------------- allergies / dermatologie
  ["cetirizine", null, "10 mg", "cp"],
  ["loratadine", null, "10 mg", "cp"],
  ["chlorpheniramine", null, "4 mg", "cp"],
  ["dexchlorpheniramine", null, "2 mg", "cp"],
  ["promethazine", null, "25 mg", "cp"],
  ["hydrocortisone", null, "1 %", "creme"],
  ["betamethasone", "dipropionate de betamethasone", "0.1 %", "creme"],
  ["clotrimazole", null, "1 %", "creme"],
  ["miconazole", null, "2 %", "creme"],
  ["neomycine", null, "0.5 %", "pommade"],
  ["bacitracine", null, "500 UI/g", "pommade"],
  ["mupirocine", null, "2 %", "pommade"],
  ["sulfadiazine argentique", null, "1 %", "creme"],
  ["permethrine", null, "5 %", "creme"],

  // ---------------------------------------------------------------- vitamines / minéraux
  ["fer et acide folique", "sulfate ferreux + acide folique", "60 mg + 0.4 mg", "cp"],
  ["acide folique", null, "5 mg", "cp"],
  ["acide folique", null, "0.4 mg", "cp"],
  ["sulfate ferreux", null, "200 mg", "cp"],
  ["vitamine c", "acide ascorbique", "500 mg", "cp"],
  ["vitamine d3", "cholecalciferol", "1 000 UI", "cp"],
  ["calcitriol", null, "0.25 µg", "gél"],
  ["calcium et vitamine d3", null, "500 mg + 400 UI", "cp"],
  ["multivitamines", null, null, "cp"],
  ["vitamines b", null, null, "cp"],
  ["magnesium", null, "400 mg", "cp"],

  // ---------------------------------------------------------------- contraception / hormones
  ["levonorgestrel", null, "0.15 mg", "cp"],
  ["levonorgestrel", null, "1.5 mg", "cp"],
  ["ethinylestradiol levonorgestrel", null, "30 µg + 150 µg", "cp"],
  ["desogestrel", null, "75 µg", "cp"],
  ["medroxyprogesterone", null, "150 mg/ml", "inj"],

  // ---------------------------------------------------------------- antiparasitaires
  ["albendazole", null, "400 mg", "cp"],
  ["mebendazole", null, "100 mg", "cp"],
  ["mebendazole", null, "500 mg", "cp"],
  ["ivermectine", null, "6 mg", "cp"],
  ["praziquantel", null, "600 mg", "cp"],

  // ---------------------------------------------------------------- yeux / ORL
  ["tobramycine", null, "0.3 %", "collyre"],
  ["xylometazoline", null, "0.1 %", "spray"],
  ["oxytetracycline", null, "0.5 %", "pommade"],
  ["dexamethasone", null, "0.1 %", "collyre"],

  // ---------------------------------------------------------------- antiseptiques / solutions
  ["povidone iodine", null, "10 %", "solution"],
  ["chlorhexidine", null, "0.5 %", "solution"],
  ["chlorhexidine", null, "0.05 %", "solution"],
  ["alcool 70", null, "70 %", "solution"],
  ["chlorure de sodium", null, "0.9 %", "solution"],
  ["eau oxygene", null, "10 vol", "solution"],
];

/** Prix FCFA crédibles par forme (arrondis à 50). */
const PRICE_BY_FORM: Record<string, number[]> = {
  cp: [250, 500, 750, 1000, 1250, 1500, 1750, 2000],
  "gél": [500, 750, 1000, 1500, 2000, 2500],
  sirop: [1000, 1500, 2000, 2500, 3000, 3500],
  inj: [1000, 1500, 2000, 3000, 4000, 5000],
  sachet: [200, 250, 300, 400, 500],
  creme: [1000, 1500, 2000, 2500, 3000],
  pommade: [1000, 1500, 2000, 2500],
  gel: [1000, 1500, 2000, 2500, 3000],
  suppo: [500, 750, 1000, 1500],
  collyre: [1500, 2000, 2500, 3000, 4000],
  spray: [1500, 2000, 3000, 4000],
  inhalateur: [2000, 3000, 4000, 5000],
  solution: [500, 1000, 1500, 2500],
  shampooing: [1000, 1500, 2000],
};
const DEFAULT_PRICES = [500, 1000, 1500];

/** Valeur déterministe (stable d'une exécution à l'autre). */
function seeded(seed: number): number {
  let x = (seed + 1) * 2654435761;
  x = Math.imul(x ^ (x >>> 15), 2246822519);
  x = Math.imul(x ^ (x >>> 13), 3266489917);
  return (x ^ (x >>> 16)) >>> 0;
}

async function main() {
  const pharmacy = await prisma.pharmacies.findFirst({
    where: { license_number: "ML-PH-DEMO-1" },
    select: { id: true, name: true },
  });
  if (!pharmacy) {
    throw new Error("Pharmacie démo introuvable (license_number = ML-PH-DEMO-1).");
  }

  // --- 1. Catalogue : uniquement les lignes manquantes ----------------------
  const existing = await prisma.medicines.findMany({
    select: { normalized_name: true, strength: true },
  });
  const have = new Set(existing.map((m) => `${m.normalized_name}|${m.strength ?? ""}`));
  const missing = CATALOG.filter(([name, , strength]) => !have.has(`${name}|${strength ?? ""}`));
  if (missing.length > 0) {
    await prisma.medicines.createMany({
      data: missing.map(([normalized_name, generic_name, strength, form]) => ({
        normalized_name,
        generic_name,
        strength,
        form,
      })),
    });
  }

  // --- 2. Ids du catalogue --------------------------------------------------
  const all = await prisma.medicines.findMany({
    select: { id: true, normalized_name: true, strength: true },
  });
  const idByKey = new Map(all.map((m) => [`${m.normalized_name}|${m.strength ?? ""}`, m.id]));

  // --- 3. Stock pharmacie démo : la moitié du catalogue ---------------------
  const owned = new Set(
    (
      await prisma.inventory.findMany({
        where: { pharmacy_id: pharmacy.id },
        select: { medicine_id: true },
      })
    ).map((r) => r.medicine_id),
  );

  const rows: Array<{
    pharmacy_id: string;
    medicine_id: string;
    stock_qty: number;
    price: number;
  }> = [];
  CATALOG.forEach(([name, , strength, form], i) => {
    if (i % 2 !== 0) return; // un ligne sur deux pour un inventaire fourni mais plausible
    const id = idByKey.get(`${name}|${strength ?? ""}`);
    if (!id || owned.has(id)) return;

    const h = seeded(i);
    const r = h % 100;
    const stock = r < 8 ? 0 : r < 18 ? 1 + (h % 5) : 6 + (h % 115);
    const prices = PRICE_BY_FORM[form] ?? DEFAULT_PRICES;
    const price = prices[h % prices.length];
    rows.push({ pharmacy_id: pharmacy.id, medicine_id: id, stock_qty: stock, price });
  });
  if (rows.length > 0) {
    await prisma.inventory.createMany({ data: rows, skipDuplicates: true });
  }

  // --- 4. Bilan -------------------------------------------------------------
  const meds = await prisma.medicines.count();
  const inv = await prisma.inventory.count({ where: { pharmacy_id: pharmacy.id } });
  const ruptures = await prisma.inventory.count({
    where: { pharmacy_id: pharmacy.id, stock_qty: 0 },
  });
  const bas = await prisma.inventory.count({
    where: { pharmacy_id: pharmacy.id, stock_qty: { gt: 0, lte: 5 } },
  });
  console.log(`Catalogue : ${meds} médicaments (${missing.length} ajoutés).`);
  console.log(`Stock de « ${pharmacy.name} » : ${inv} lignes (${ruptures} ruptures, ${bas} en stock bas).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
