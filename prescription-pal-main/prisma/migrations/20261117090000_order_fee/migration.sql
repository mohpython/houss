-- Frais de commande : 100 FCFA prélevés sur chaque commande (livraison ou retrait).
ALTER TABLE "reservations" ADD COLUMN "order_fee" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Les commandes pas encore payées intègrent les frais dans leur total :
-- le patient les règlera au moment du paiement.
UPDATE "reservations"
SET "order_fee" = 100, "total_amount" = "total_amount" + 100
WHERE "payment_status" IN ('unpaid', 'pending_verification');
