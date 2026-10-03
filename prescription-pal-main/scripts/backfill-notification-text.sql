-- Notifications créées SANS texte (bug de rendu : bulle vide dans l'application).
--
-- Cause : `notify()` enregistrait `title = ''` et `body = ''` pour tous les
-- types lancés par le cycle de vie des commandes (new_reservation, delivered,
-- courier_assigned…). Correctif appliqué dans `lifecycle.server.ts` : le texte
-- générique du type (`src/lib/push-messages.ts`) complète désormais le champ
-- manquant.
--
-- Ce script répare l'existant. Idempotent : ne touche que les lignes dont le
-- titre OU le corps est vide, et ne remplace que le champ vide.

WITH copy (type, title, body) AS (
  VALUES
    ('new_reservation',     'Nouvelle commande',  'Une ordonnance vient d''être envoyée à votre pharmacie.'),
    ('reservation_created', 'Commande envoyée',   'Votre commande a été transmise à la pharmacie.'),
    ('reservation_accepted','Commande acceptée',  'La pharmacie a accepté votre commande.'),
    ('reservation_rejected','Commande refusée',   'La pharmacie n''a pas pu traiter votre commande.'),
    ('reservation_ready',   'Commande prête',     'Votre commande est prête en pharmacie.'),
    ('courier_assigned',    'Livreur assigné',    'Un livreur prend en charge votre commande.'),
    ('new_delivery',        'Nouvelle course',    'Une livraison vous a été attribuée.'),
    ('courier_picked_up',   'Colis récupéré',     'Le livreur a récupéré votre commande.'),
    ('delivered',           'Commande livrée',    'Votre commande a été livrée. Bonne santé !')
)
UPDATE notifications n
SET title = CASE WHEN n.title = '' THEN c.title ELSE n.title END,
    body  = CASE WHEN n.body  = '' THEN c.body  ELSE n.body  END
FROM copy c
WHERE n.type = c.type
  AND (n.title = '' OR n.body = '');

-- Types sans texte générique : on pose au moins l'expéditeur, sinon la bulle
-- n'affiche rien du tout.
UPDATE notifications
SET title = 'SAHA Santé'
WHERE title = '';

-- Contrôle attendu : 0.
SELECT count(*) FILTER (WHERE title = '' OR body = '') AS encore_vides,
       count(*) AS total
FROM notifications;