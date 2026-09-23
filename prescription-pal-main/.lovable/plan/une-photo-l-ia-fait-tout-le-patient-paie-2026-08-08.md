# Une photo → l'IA fait tout → le patient paie

Objectif : le patient envoie l'ordonnance, l'IA extrait, choisit la pharmacie la plus proche ayant 100 % des médicaments, et le patient voit un seul écran : médicaments disponibles + prix, puis il paie.

## Nouveau parcours

```text
[Photo / Upload]
   -> IA extrait les médicaments
   -> Recherche de la pharmacie la plus proche avec 100% du stock
   -> [Écran unique] pharmacie + liste des médicaments + prix ligne + total
   -> [Payer] Orange Money / Moov
   -> Réservation envoyée à la pharmacie + livreur assigné -> suivi
```

Aujourd'hui la réservation est créée immédiatement après le scan. Elle deviendra
un devis affiché au patient : elle n'est envoyée à la pharmacie qu'après paiement.

## Écran récapitulatif (le seul que le patient voit)

- Nom de la pharmacie, distance, temps estimé.
- Liste des médicaments avec une pastille verte « disponible » et le prix unitaire.
- Total médicaments + frais de livraison + total à payer.
- Un seul bouton : **Payer**.
- Si aucune pharmacie n'a tout : écran de secours existant (choix manuel).

## Paiement mobile money

Le prix vient des prix saisis par la pharmacie dans son inventaire (`inventory.price`),
plus des frais de livraison.

Deux étapes :

1. **Maintenant, sans compte marchand** : écran de paiement Orange Money / Moov
   affichant le montant et le numéro marchand, avec saisie de la référence de
   transaction par le patient. La commande passe en « paiement en vérification »
   et la pharmacie/l'admin confirme la réception. Le parcours est complet et
   utilisable dès aujourd'hui.
2. **Plus tard, automatique** : quand vous aurez un compte marchand Orange Money
   (ou un agrégateur type CinetPay / PayDunya pour le Mali), je branche l'API :
   le patient valide sur son téléphone, un webhook confirme le paiement et la
   commande part toute seule. Il me faudra les identifiants marchands.

## Détails techniques

- Migration : ajout sur `reservations` de `items_total`, `delivery_fee`,
  `total_amount`, `payment_status` (`unpaid` | `pending_verification` | `paid` | `failed`),
  `payment_method`, `payment_reference`, `paid_at`. Ajout de `unit_price` sur
  `reservation_items`. GRANT + policies mises à jour (patient : lecture, mise à
  jour de sa propre référence ; pharmacie/admin : validation du paiement).
- `src/lib/routing-core.server.ts` : `autoRouteCore` lit `inventory.price` pour
  chaque médicament matché, calcule les totaux et les enregistre sur la
  réservation ; la réservation est créée en `payment_status = 'unpaid'` et
  n'est pas encore notifiée à la pharmacie.
- Le trigger de notification pharmacie ne se déclenche qu'au passage en
  `paid` / `pending_verification`.
- `assignCourier` n'est appelé qu'après paiement.
- `src/routes/_authenticated/app/scan.tsx` : après l'auto-routage, redirection
  vers le nouvel écran récapitulatif au lieu du suivi.
- Nouvelle route `src/routes/_authenticated/app/reservations/$id/checkout.tsx` :
  récap + bouton Payer + saisie de la référence mobile money.
- Nouvelle server fn `confirmMobileMoneyPayment` (patient : dépose la référence)
  et `verifyPayment` (pharmacie/admin : valide, déclenche l'envoi et le livreur).
- Traductions fr / en / ar pour les libellés de prix et de paiement.
