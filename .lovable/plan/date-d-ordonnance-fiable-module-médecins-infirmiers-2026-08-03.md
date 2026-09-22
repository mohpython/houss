# Date d'ordonnance fiable + module Médecins & Infirmiers

Deux chantiers, dans cet ordre : d'abord la date de l'ordonnance (authenticité), ensuite le module santé (docteurs / infirmiers, rendez-vous, piqûres).

## Partie 1 — La date de l'ordonnance (priorité)

Aujourd'hui l'IA renvoie la date en texte libre (« 12/03/2026 », « 12 mars 2026 », arabe…) et on l'écrit directement dans une colonne date : quand le format ne correspond pas, l'écriture échoue en silence et la date reste vide. Elle n'est donc ni fiable ni utilisée pour juger l'authenticité.

À faire :

- Demander à l'IA la date **au format ISO (AAAA-MM-JJ)** en plus du texte brut lu sur le document, et lui faire signaler si aucune date n'est visible.
- Normaliser côté serveur : accepter JJ/MM/AAAA, JJ-MM-AAAA, mois écrits en français/anglais/arabe, années sur 2 chiffres. Si rien n'est exploitable, on enregistre « date illisible » au lieu d'écrire une valeur vide sans le dire.
- Contrôles d'authenticité liés à la date :
  - date dans le futur → ordonnance suspecte, refusée
  - absence totale de date → score d'authenticité réduit et avertissement
  - ordonnance de plus de **3 mois** → marquée « expirée » : elle reste visible mais ne peut pas être envoyée automatiquement à une pharmacie
- Affichage : la date apparaît clairement sur la page de détail (patient), avec un badge « Valide », « Expirée » ou « Date manquante », et la même information est visible côté pharmacie à côté de la photo.
- Le patient peut corriger la date manuellement si l'IA s'est trompée (la correction est tracée).
- la date peut etre a toute les formats

## Partie 2 — Médecins & Infirmiers

Vous (admin) créez et validez les praticiens, comme pour les pharmacies : nom, spécialité, téléphone, adresse/position, horaires, e-mail de rattachement du compte. Un compte = un rôle professionnel unique (docteur OU infirmier OU pharmacie OU livreur), comme la règle déjà en place.

### Côté patient

- Nouvelle entrée « Santé / Consultation » depuis l'accueil.
- Le patient décrit son problème (paludisme, tension, diabète, fièvre, blessure, vaccination, piqûre…) via une liste de motifs + un champ libre.
- L'IA analyse le motif et propose le type de praticien adapté (généraliste, cardiologue, infirmier à domicile, etc.).
- On affiche les praticiens correspondants **les plus proches** (même calcul de distance que pour les pharmacies), avec spécialité, distance et disponibilité.
- Le patient demande un rendez-vous : date/heure souhaitée, à domicile ou au cabinet.
- Suivi du rendez-vous avec les mêmes étapes visibles que pour les commandes : demandé → accepté → confirmé → terminé (ou annulé/refusé).

### Côté praticien (docteur / infirmier)

- Tableau de bord : demandes entrantes, accepter / refuser / proposer un autre créneau, agenda du jour.
- Fiche patient du rendez-vous : motif, historique des ordonnances du patient (avec accord), notes de consultation.
- Un médecin peut clôturer une consultation en enregistrant un compte-rendu ; il peut renvoyer le patient vers le scan d'ordonnance.
- Un infirmier voit l'adresse du patient et l'itinéraire (mêmes cartes que les livreurs) pour les soins à domicile.

### Côté admin

- Page « Praticiens » : ajouter, valider, suspendre ; suivi des rendez-vous.

### Notifications

Les notifications existantes (web + push, FR/EN/AR) sont étendues : nouvelle demande de rendez-vous pour le praticien, acceptation/refus et rappel pour le patient.

## Détails techniques

- Base de données : nouvelle table `practitioners` (type docteur/infirmier, spécialité, statut, position, `claim_email`, horaires) + `appointments` (patient, praticien, motif, symptômes, mode domicile/cabinet, créneau, statut, notes) + `practitioner_specialties` de référence. RLS scopée : patient voit ses rendez-vous, praticien voit les siens, admin tout ; GRANT explicites ; déclencheur de notification comme pour `reservations`.
- Rôles : ajout de `doctor` et `nurse` à l'enum `app_role`, avec extension des garde-fous d'exclusivité existants.
- `prescriptions` : ajout de `prescription_date_raw` (texte lu), `date_source` (ia/manuel) et `is_expired`. Normalisation dans `rx-core.server.ts` (partagée web + bot WhatsApp).
- Le triage IA du motif et la recherche de praticien par distance suivent le modèle de `routing-core.server.ts` (server functions, pas d'edge functions).
- Routes : `/app/health` (motif + résultats), `/app/appointments`, `/app/appointments/$id`, `/app/practitioner/*`, `/app/admin/practitioners`.
- Le bot WhatsApp n'est pas modifié dans cette étape (option pour plus tard).