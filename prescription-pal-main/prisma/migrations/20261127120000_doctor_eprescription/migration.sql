-- E-ordonnance médecin : profil établissement, ordonnances, lignes, audit, modèles.

-- CreateEnum
CREATE TYPE "doctor_rx_status" AS ENUM ('draft', 'signed', 'sent', 'viewed', 'cancelled', 'amended');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "address" TEXT,
ADD COLUMN     "date_of_birth" DATE,
ADD COLUMN     "sex" TEXT;

-- AlterTable
ALTER TABLE "practitioners" ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "approved_by" UUID,
ADD COLUMN     "establishment_address" TEXT,
ADD COLUMN     "establishment_email" TEXT,
ADD COLUMN     "establishment_name" TEXT,
ADD COLUMN     "establishment_phone" TEXT,
ADD COLUMN     "signature_note" TEXT;

-- CreateTable
CREATE TABLE "doctor_prescriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" TEXT NOT NULL,
    "doctor_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "prescription_id" UUID,
    "status" "doctor_rx_status" NOT NULL DEFAULT 'draft',
    "consultation_date" DATE NOT NULL,
    "diagnosis" TEXT,
    "reason" TEXT,
    "observations" TEXT,
    "advice" TEXT,
    "patient_name" TEXT NOT NULL,
    "patient_phone" TEXT,
    "patient_email" TEXT,
    "patient_birth_date" DATE,
    "patient_sex" TEXT,
    "establishment_name" TEXT NOT NULL,
    "establishment_address" TEXT,
    "establishment_phone" TEXT,
    "doctor_name" TEXT NOT NULL,
    "doctor_specialty" TEXT,
    "doctor_license" TEXT,
    "identity_verified" BOOLEAN NOT NULL DEFAULT false,
    "identity_verified_at" TIMESTAMPTZ(6),
    "signed_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "viewed_at" TIMESTAMPTZ(6),
    "signature_hash" TEXT,
    "verification_token" TEXT NOT NULL,
    "pdf_path" TEXT,
    "pdf_sha256" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "amended_from_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_prescription_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "doctor_prescription_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "medicine_name" TEXT NOT NULL,
    "dosage" TEXT,
    "form" TEXT,
    "quantity" TEXT,
    "posology" TEXT,
    "frequency" TEXT,
    "duration" TEXT,
    "route" TEXT,
    "instructions" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_prescription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_prescription_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "doctor_prescription_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_prescription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_rx_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "doctor_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "diagnosis" TEXT,
    "advice" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_rx_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "doctor_prescriptions_number_key" ON "doctor_prescriptions"("number");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_prescriptions_prescription_id_key" ON "doctor_prescriptions"("prescription_id");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_prescriptions_verification_token_key" ON "doctor_prescriptions"("verification_token");

-- CreateIndex
CREATE INDEX "doctor_prescriptions_doctor_id_created_at_idx" ON "doctor_prescriptions"("doctor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "doctor_prescriptions_patient_id_created_at_idx" ON "doctor_prescriptions"("patient_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "doctor_prescriptions_status_idx" ON "doctor_prescriptions"("status");

-- CreateIndex
CREATE INDEX "doctor_prescription_items_doctor_prescription_id_position_idx" ON "doctor_prescription_items"("doctor_prescription_id", "position");

-- CreateIndex
CREATE INDEX "doctor_prescription_events_doctor_prescription_id_created_a_idx" ON "doctor_prescription_events"("doctor_prescription_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "doctor_rx_templates_doctor_id_idx" ON "doctor_rx_templates"("doctor_id");

-- AddForeignKey
ALTER TABLE "doctor_prescriptions" ADD CONSTRAINT "doctor_prescriptions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_prescriptions" ADD CONSTRAINT "doctor_prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_prescriptions" ADD CONSTRAINT "doctor_prescriptions_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_prescription_items" ADD CONSTRAINT "doctor_prescription_items_doctor_prescription_id_fkey" FOREIGN KEY ("doctor_prescription_id") REFERENCES "doctor_prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_prescription_events" ADD CONSTRAINT "doctor_prescription_events_doctor_prescription_id_fkey" FOREIGN KEY ("doctor_prescription_id") REFERENCES "doctor_prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_prescription_events" ADD CONSTRAINT "doctor_prescription_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_rx_templates" ADD CONSTRAINT "doctor_rx_templates_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "practitioners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
