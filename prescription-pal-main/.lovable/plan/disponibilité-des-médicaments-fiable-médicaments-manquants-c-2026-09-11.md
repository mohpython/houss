# Disponibilité des médicaments fiable + médicaments manquants commandables ailleurs

## Constat (vérifié)

**1. Résultats qui changent d'un envoi à l'autre**
- La même ordonnance envoyée plusieurs fois donne des noms légèrement différents à chaque lecture IA : « Ceficap 200 » / « Ceficap 200 200 mg », « Hemafer » / « Hemafer cp », « Monofast » / « Monfast ».
- La comparaison avec le stock des pharmacies est une simple recherche de texte « contient » (`nm.includes(q) || q.includes(nm)`), dupliquée à 5 endroits (recherche de pharmacies, routage automatique, création de réservation). Un « cp » ou un « mg » en plus, ou une lettre manquante, suffit à faire passer un médicament de « disponible » à « manquant ».
- Le catalogue contient des lignes parasites issues des listes de prix (ex. « betadine solution compresse 40x40 fil a peau gants… », « curam tracedol comprimé 40 x 40 boule de… ») qui matchent n'importe quoi selon l'ordre des lignes.
- Résultat : la disponibilité affichée dépend de la formulation exacte de l'IA, pas du vrai stock.

**2. Médicaments manquants**
- Aujourd'hui la réservation part à la pharmacie qui a le plus de médicaments, et les manquants ne sont affichés qu'en liste de noms (« non disponibles ») sur la page de paiement et le suivi. Le patient ne sait pas où les trouver ni comment les commander.

## Ce qui sera fait

### A. Un seul moteur de correspondance, stable
- Créer une fonction unique de correspondance médicament ↔ stock (côté serveur), utilisée partout (recherche, routage auto, réservation, OTC, WhatsApp).
- Normalisation avant comparaison : minuscules, sans accents, retrait des dosages (200 mg, 3g, 1000…), des formes (cp, comprimé, gélule, sirop, inj, b/10…) et de la ponctuation.
- Correspondance en 3 niveaux, déterministe : (1) nom exact normalisé, (2) même « mot principal » (Ceficap, Hemafer, Monofast…), (3) similarité de texte tolérante aux fautes (Monfast ≈ Monofast) avec un seuil strict ; en cas de plusieurs candidats, on prend toujours le nom le plus court/le plus proche, jamais « le premier trouvé ».
- Au moment de l'extraction, chaque ligne d'ordonnance est rattachée une fois pour toutes à un médicament du catalogue (`normalized_medicine_id`). Les recherches suivantes utilisent ce rattachement : même ordonnance → toujours même résultat.
- L'IA reçoit la liste des noms du catalogue comme aide à la lecture pour écrire les noms de façon cohérente.

### B. Nettoyage du catalogue
- Outil admin (Admin → Stock) pour repérer et fusionner/supprimer les lignes parasites (noms trop longs contenant plusieurs produits).
- Script de nettoyage initial des lignes évidentes.

### C. Médicaments manquants : proposer où les commander
- Lors du routage automatique, pour chaque médicament manquant, le système cherche les autres pharmacies partenaires (même loin) qui l'ont en stock, avec distance et prix, et enregistre ces alternatives avec la réservation.
- Page de paiement et suivi : section « Médicaments non disponibles dans cette pharmacie » avec, pour chacun, les pharmacies qui l'ont (nom, distance, prix, téléphone, itinéraire Maps).
- Bouton « Commander ces médicaments là-bas » : crée une 2e réservation pour les manquants dans la pharmacie choisie, avec le même choix livraison / retrait sur place et le même lieu de livraison (GPS ou quartier) — le patient peut aussi choisir un autre quartier pour cette 2e commande.
- Si aucun partenaire n'a le médicament : message clair « À acheter en pharmacie de ville ».
- Même information envoyée dans le bot WhatsApp (liste des manquants + pharmacie la plus proche qui les a).

## Détails techniques
- Nouveau `src/lib/medicine-match.server.ts` : `normalizeMedName()`, `matchItemsToInventory(items, inventory)` ; remplace les 5 blocs `includes()` dans `pharmacy.functions.ts` et `routing-core.server.ts`.
- Similarité : fonction SQL utilisant `pg_trgm` déjà installé (`similarity()`), ou équivalent en TypeScript (Dice/trigram) pour rester sans migration lourde.
- `rx-core.server.ts` : après extraction, remplir `prescription_items.normalized_medicine_id` via le moteur ; prompt enrichi avec les noms du catalogue.
- `routing-core.server.ts` : `missing_items` enrichi `{ itemId, name, alternatives: [{ pharmacyId, name, distanceKm, price, phone }] }` (colonne JSON existante, pas de migration).
- `createReservation` : accepter une liste d'items partielle (déjà le cas) + `parentReservationId` optionnel pour lier la 2e commande.
- UI : `checkout.tsx`, `track.tsx`, `reservations/$id/index.tsx` ; traductions FR/EN/AR.
- Admin : page stock — liste des médicaments suspects (nom > 40 caractères ou contenant plusieurs produits) avec actions fusionner / supprimer.
