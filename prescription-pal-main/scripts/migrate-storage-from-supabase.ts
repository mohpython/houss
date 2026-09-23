/**
 * Télécharge les fichiers du bucket Supabase « prescriptions » vers le disque
 * du VPS (STORAGE_DIR/prescriptions/...), en conservant les mêmes chemins que
 * ceux enregistrés dans `prescriptions.file_path`.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<clé service_role> \
 *   npx tsx scripts/migrate-storage-from-supabase.ts
 *
 * Relançable : les fichiers déjà présents sont ignorés.
 */
import { PrismaClient } from "@prisma/client";
import { objectExists, saveObject } from "../src/server/storage.server";

const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Définissez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const prisma = new PrismaClient();

async function download(path: string): Promise<Uint8Array> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${url}/storage/v1/object/prescriptions/${encoded}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key! },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function main() {
  const rows = await prisma.prescriptions.findMany({ select: { file_path: true } });
  const paths = [...new Set(rows.map((r) => r.file_path).filter(Boolean))];
  console.log(`${paths.length} fichier(s) référencé(s)`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const p of paths) {
    try {
      if (await objectExists("prescriptions", p)) {
        skipped++;
        continue;
      }
      await saveObject("prescriptions", p, await download(p));
      ok++;
      if (ok % 50 === 0) console.log(`  … ${ok} téléchargés`);
    } catch (err) {
      failed++;
      console.warn(`✖ ${p} : ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`✔ ${ok} téléchargé(s), ${skipped} déjà présent(s), ${failed} échec(s)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
