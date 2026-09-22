# Livraison dans un autre quartier (Bamako)

Permettre au patient de choisir un **quartier de livraison** différent de sa position actuelle. La recherche de pharmacie, les frais et le suivi livreur utilisent alors ce quartier.

Concerne : le scan d'ordonnance **et** l'achat sans ordonnance (OTC) dans l'app. Le bot WhatsApp n'est pas modifié.

## Ce que verra le patient

1. Après le scan (ou après avoir identifié le médicament OTC), une étape **"Où livrer ?"** apparaît, avant la recherche automatique de pharmacie :
   - **Ma position actuelle** (GPS, comme aujourd'hui)
   - **Un autre quartier** : liste déroulante des quartiers de Bamako (Daoudabougou, Hamdallaye ACI, Badalabougou, Kalaban Coura, Magnambougou, Sotuba, Lafiabougou, Sébénikoro, Niamakoro, Faladié, Banankabougou, Hippodrome, Missira, Djélibougou, Boulkassoumbougou, Sabalibougou, Yirimadio, Baco Djicoroni, Torokorobougou, Quinzambougou, Médina Coura, Bamako Coura, Bolibana, Kalaban Coro, Sirakoro Meguetana, Titibougou, Sogoniko, Dravéla, ACI 2000, Golf…) avec un champ de recherche.
   - Un champ **"Précision"** facultatif (rue, repère, nom de la personne qui réceptionne) enregistré dans l'adresse de livraison.
2. La pharmacie choisie automatiquement est celle la plus proche **du quartier de livraison** (pas du patient).
3. Sur la page de paiement, l'adresse affichée devient "Quartier : Daoudabougou — précision". Le livreur suit l'itinéraire jusqu'aux coordonnées du quartier.
4. Sur la page "Pharmacies proches" (choix manuel), même sélecteur : "Ma position" ou "Quartier".

## Côté administration

- Nouvelle page **Admin → Quartiers** : liste, ajout, modification (nom, latitude, longitude, actif/inactif) des quartiers. Les quartiers sont pré-remplis avec ~30 quartiers de Bamako et leurs coordonnées.

## Détails techniques

**Base de données**
- Nouvelle table `public.neighborhoods` : `id`, `name`, `city` (défaut "Bamako"), `lat`, `lng`, `is_active`, `created_at`, `updated_at` + trigger `update_updated_at_column`.
- GRANT SELECT à `authenticated` ; GRANT ALL à `service_role`. RLS : lecture par tout utilisateur connecté (actifs uniquement), écriture réservée à `private.has_role(auth.uid(),'admin')`.
- Table `reservations` : ajout de `neighborhood_id uuid` (nullable, FK) et `delivery_mode text` (`gps` | `neighborhood`).
- Données initiales (~30 quartiers de Bamako avec coordonnées approximatives) insérées dans la même migration.

**Serveur**
- `src/lib/neighborhoods.functions.ts` : `listNeighborhoods` (lecture), `upsertNeighborhood` / `toggleNeighborhood` (admin, vérification du rôle).
- `routing-core.server.ts` (`AutoRouteInput`) : nouveaux champs optionnels `neighborhoodId`, `deliveryMode` ; enregistrés sur la réservation.
- `delivery.functions.ts` (`autoRouteReservation`) et `otc.functions.ts` : acceptent `neighborhoodId` ; si présent, le serveur lit lat/lng du quartier (source de vérité côté serveur) et construit `patient_address = "Quartier X — précision"`.
- `pharmacy.functions.ts` (`createReservation`, `findNearbyPharmaciesPlaces`) : même prise en charge du quartier.

**Interface**
- Nouveau composant `src/components/DeliveryLocationPicker.tsx` (réutilisable) : deux onglets GPS / Quartier, combobox de quartiers, champ précision. Textes traduits fr/en/ar.
- `scan.tsx` : nouvelle phase "Où livrer ?" entre l'extraction et le routage ; `continueToRouting` reçoit le lieu choisi.
- Page OTC : même sélecteur avant la commande.
- `prescriptions/$id/pharmacies.tsx` : le sélecteur remplace le bouton "Ma position" seul.
- `checkout.tsx` et `track.tsx` : affichage du quartier ; le suivi carte utilise déjà `patient_lat/lng`, donc aucun changement de logique.
- `admin/neighborhoods.tsx` + tuile dans l'accueil admin.
