-- Commissions SAHA : 5% sur les médicaments, taux configurable par pharmacie,
-- suivi des reversements.

ALTER TABLE "pharmacies" ADD COLUMN "commission_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.05;

ALTER TABLE "reservations"
  ADD COLUMN "commission_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
  ADD COLUMN "commission_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "platform_payout_id" UUID;

CREATE TABLE "platform_commission_payouts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pharmacy_id" UUID NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "orders_count" INTEGER NOT NULL DEFAULT 0,
  "created_by" UUID,
  "note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "platform_commission_payouts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "platform_commission_payouts"
  ADD CONSTRAINT "platform_commission_payouts_pharmacy_id_fkey"
  FOREIGN KEY ("pharmacy_id") REFERENCES "pharmacies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_platform_payout_id_fkey"
  FOREIGN KEY ("platform_payout_id") REFERENCES "platform_commission_payouts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "platform_commission_payouts_pharmacy_id_created_at_idx"
  ON "platform_commission_payouts"("pharmacy_id", "created_at" DESC);
CREATE INDEX "reservations_platform_payout_id_idx" ON "reservations"("platform_payout_id");

-- Rétroactif : 5% sur les médicaments des commandes existantes.
UPDATE "reservations"
SET "commission_rate" = 0.05,
    "commission_amount" = ROUND("items_total" * 0.05);
