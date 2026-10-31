-- Orange Money WebPay : code marchand par pharmacie + réconciliation des paiements.
--
-- Une seule application Orange (client_id/client_secret SAHA) sert toutes les
-- pharmacies ; `orange_merchant_key` détermine sur quel compte Orange Money
-- chaque pharmacie encaisse directement.

ALTER TABLE "pharmacies" ADD COLUMN "orange_merchant_key" TEXT;

ALTER TABLE "reservations" ADD COLUMN "payment_order_id" TEXT;
ALTER TABLE "reservations" ADD COLUMN "payment_pay_token" TEXT;

CREATE UNIQUE INDEX "reservations_payment_order_id_key" ON "reservations"("payment_order_id");
