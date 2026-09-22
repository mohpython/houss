# Parcours patient « 1 photo, tout le reste en auto »

Objectif : le patient n'a qu'une seule action — photographier ou téléverser son ordonnance. L'IA fait l'extraction, choisit la pharmacie, crée la réservation et déclenche le livreur. Les écrans d'édition ne s'affichent qu'en cas de problème.

## Nouveau flux

```text
[Scanner]  -> une seule grande action : Photo / Fichier
   |
   v
[Écran Auto] barre de progression en 4 étapes, sans intervention :
   1. Lecture de l'ordonnance (IA)
   2. Vérification d'authenticité + date
   3. Recherche d'une pharmacie ayant 100% des médicaments
   4. Réservation créée + livreur assigné
   |
   +-- succès  -> redirection vers le suivi en direct
   +-- échec   -> écran de secours ciblé (voir ci-dessous)
```

La géolocalisation est demandée dès l'ouverture du scanner (avant l'analyse), pour ne pas interrompre le patient au milieu du processus.

## Écrans de secours (seulement si nécessaire)

- Document rejeté / illisible : message clair + bouton « Reprendre la photo ».
- Date absente ou périmée : mini-carte demandant uniquement de confirmer la date.
- Confiance IA faible (<85%) : liste des médicaments à confirmer en un tap « Tout confirmer ».
- Aucune pharmacie avec 100% du stock : page actuelle de choix manuel des pharmacies.

Ces pages existent déjà ; elles deviennent conditionnelles au lieu d'être des étapes obligatoires.

## Interface épurée, style Google

Principe : un écran = une action. Des icônes, très peu de texte.

- Accueil patient : fond vide, logo, puis un seul gros bouton rond caméra au centre. En dessous, une rangée de 3 à 4 icônes seulement (historique, commandes, consultation, profil) avec un mot maximum sous chaque icône.
- Barre de navigation basse à icônes uniquement (libellés en `aria-label` pour l'accessibilité), avec le bouton scan surélevé au centre.
- Suppression des paragraphes explicatifs, encadrés d'aide et sous-titres sur les écrans du parcours principal ; ils restent seulement dans les écrans de secours et l'aide.
- Statuts affichés par pictogrammes + couleur (analyse, pharmacie, préparation, livraison) plutôt que par phrases.
- Cartes de commande réduites à : icône d'état, nom de la pharmacie, heure. Le détail s'ouvre au tap.
- Sélecteurs de langue et de thème réduits à des icônes dans l'en-tête.

## Détails techniques


- `src/routes/_authenticated/app/scan.tsx` : après l'upload et l'insertion de l'ordonnance, enchaîner automatiquement `extractPrescription` puis `autoRouteReservation` dans un même écran d'état, au lieu de rediriger vers la page de détail.
- Nouveau composant d'étapes (`AutoFlowProgress`) affichant les 4 phases avec état en cours / terminé / erreur.
- Décision de branchement après extraction, côté client, à partir des champs déjà renvoyés : `dateStatus`, `confidence`, `count`.
- `autoRouteReservation` et `assignCourier` restent inchangés côté serveur ; on réutilise `src/lib/delivery.functions.ts`.
- La page détail d'ordonnance reste accessible depuis l'historique (édition, correction de date) mais sort du chemin nominal.
- Accueil patient : refonte minimaliste (bouton caméra central + rangée d'icônes), suppression des tuiles textuelles.
- Nouvelle barre de navigation basse à icônes (`BottomNav`) partagée par les écrans patient.
- Traductions fr / en / ar ajoutées pour les nouveaux libellés (mots courts et `aria-label`).

## Suggestions complémentaires (à valider, non incluses par défaut)

1. Reprise automatique : si l'analyse échoue à cause du réseau, relancer une fois sans action du patient.
2. Bouton « Refaire ma dernière ordonnance » sur l'accueil (renouvellement en un tap).
3. Adresse de livraison mémorisée dans le profil pour éviter la saisie à chaque commande.
4. Recadrage / amélioration automatique de la photo avant envoi à l'IA (meilleure lecture, moins de rejets).
5. Notification push à chaque changement d'étape (pharmacie a accepté, prêt, livreur en route) — l'infrastructure FCM est déjà en place.
6. Mode « pharmacie partielle » optionnel : proposer la meilleure pharmacie couvrant par ex. 80% et signaler les médicaments manquants, au lieu de tout rejeter.
