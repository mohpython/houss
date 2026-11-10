-- Orange Money WebPay : réconciliation fiable des notifications.
--
-- Le webhook Orange n'envoie QUE { status, notif_token, txnid } : il n'y a
-- pas d'order_id dans le payload. Le notif_token retourné à l'initiation
-- est donc la seule clé permettant de retrouver la commande concernée.
-- On le mémorise pour retrouver la commande à partir de la notification.

ALTER TABLE "reservations" ADD COLUMN "payment_notif_token" TEXT;

CREATE UNIQUE INDEX "reservations_payment_notif_token_key" ON "reservations"("payment_notif_token");
