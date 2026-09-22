# Espace Médecin / Infirmier : demandes, rappels et suivi des patients

## Constat actuel
- Les rôles `doctor` et `nurse` existent déjà et l'admin peut lier un praticien à un compte (e-mail).
- Quand un patient demande un service dans la partie Hôpital, une ligne `appointments` est créée et le médecin reçoit déjà une notification (cloche + push).
- Mais il n'existe **aucune interface médecin** : le praticien ne voit pas ses demandes, ne peut ni accepter, ni proposer une date, ni écrire un compte-rendu. Le patient, lui, ne voit qu'une liste en lecture seule.
- Aucun rappel automatique n'existe (ni avant le rendez-vous, ni pour les demandes sans réponse).

## Ce qui sera construit

### 1. Tableau de bord Praticien (`/app/praticien`)
Onglet « Praticien » dans la navigation (comme Pharmacie / Livreur), visible uniquement pour les comptes `doctor` / `nurse`. Design simple et gros boutons, même esprit que les dashboards Pharmacie et Livreur.
- **Compteurs** : Nouvelles demandes · Aujourd'hui · À venir · Terminées.
- **Rappels** en haut de page : rendez-vous du jour, prochains rendez-vous (48 h), demandes en attente depuis plus de 2 h, visites à domicile avec bouton « Itinéraire ».
- **Demandes reçues** : pour chaque demande, symptômes, triage IA, téléphone (bouton Appeler / WhatsApp), adresse si visite à domicile. Actions : **Accepter** (avec date/heure), **Proposer une autre date**, **Refuser** (motif).
- **Agenda** : liste par jour des rendez-vous acceptés.
- **Disponibilité** : interrupteur « Je suis disponible » (déjà en base, aucune UI aujourd'hui).

### 2. Traiter un patient (`/app/praticien/rdv/$id`)
Fiche patient d'une consultation : historique des rendez-vous précédents du même patient avec ce praticien, notes privées du praticien, **compte-rendu** visible par le patient, bouton **Terminer la consultation**. Si le praticien prescrit des médicaments, il peut saisir la liste : le patient reçoit une notification « Ordonnance disponible » qui l'amène directement à la commande en pharmacie (réutilise le flux existant).

### 3. Côté patient (page Mes rendez-vous améliorée)
- Voir la date proposée et **Accepter / Refuser** une nouvelle date.
- Annuler une demande tant qu'elle n'est pas terminée.
- Lire le compte-rendu une fois la consultation terminée.
- Notifications (cloche + push) déjà en place, textes rendus lisibles (« Dr Diarra a accepté votre rendez-vous le 6 sept. à 10h ») au lieu du statut brut.

### 4. Rappels automatiques
- **Patient et praticien** : rappel la veille et 1 h avant le rendez-vous (cloche + push, et WhatsApp si le compte est lié au bot).
- **Praticien** : rappel toutes les 2 h tant qu'une demande reste sans réponse ; alerte admin si aucune réponse après 24 h.
- Les rappels envoyés sont mémorisés pour ne jamais être envoyés en double.

### 5. Admin
Dans Admin → Praticiens : voir le nombre de demandes en attente par praticien et le délai moyen de réponse, pour repérer les médecins qui ne répondent pas.

## Détails techniques
- **Base** : ajout des colonnes `appointments.rejection_reason`, `completed_at`, `prescribed_items jsonb`, `reminders_sent jsonb` ; nouvelle table `appointment_reminders` non nécessaire (jsonb suffit). Politiques RLS déjà en place (patient / praticien / admin) ; ajout d'un GRANT si nouvelle table. Trigger de notification existant enrichi pour des textes lisibles et un lien vers la bonne page selon le rôle.
- **Server functions** (`src/lib/practitioner.functions.ts`) : `getMyPractitionerDashboard`, `respondToAppointment` (accept / reschedule / reject), `completeAppointment` (notes, report, prescribed_items), `toggleAvailability`, `patientRespondToProposal`, `cancelAppointment`. Toutes protégées par `requireSupabaseAuth` et vérification que le praticien appartient bien au compte (`private.is_user_practitioner`).
- **Rappels** : route `src/routes/api/public/cron/appointment-reminders.ts` protégée par un secret (`CRON_SECRET`, généré), appelée toutes les 15 min par `pg_cron` + `pg_net`. Elle insère les notifications (le dispatch push existant les envoie) et appelle l'envoi WhatsApp si le patient a une session bot.
- **Routes UI** : `_authenticated/app/praticien/index.tsx`, `_authenticated/app/praticien/rdv/$id.tsx` ; mise à jour de `src/routes/_authenticated.tsx` (onglet + menu) et de `appointments/index.tsx` côté patient.
- **Push** : nouveaux types dans `push-messages.ts` (`appointment_requested`, `appointment_accepted`, `appointment_rescheduled`, `appointment_rejected`, `appointment_completed`, `appointment_reminder`) avec liens profonds vers la bonne page.
- **i18n** : textes FR / EN / AR pour toutes les nouvelles pages et notifications.
