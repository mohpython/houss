-- Apprentissage de l'extraction : chaque correction humaine (admin, patient,
-- pharmacien) est mémorisée sous forme « libellé lu par l'IA -> nom exact ».
-- L'extraction suivante réutilise ces corrections (exactes ou très proches),
-- ce qui évite de répéter les mêmes erreurs de lecture.

CREATE TABLE "ai_medicine_corrections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "raw_name" TEXT NOT NULL,
  "corrected_name" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'admin',
  "hits" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_medicine_corrections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_medicine_corrections_raw_name_corrected_name_key"
  ON "ai_medicine_corrections"("raw_name", "corrected_name");

CREATE INDEX "ai_medicine_corrections_raw_name_idx"
  ON "ai_medicine_corrections"("raw_name");
