# Bot WhatsApp SAHA Santé + bouton flottant

## Ce qu'on construit

Un vrai bot WhatsApp : le patient envoie la photo de son ordonnance dans WhatsApp, l'IA extrait les médicaments, la pharmacie qui a tout le stock reçoit la commande, un livreur est assigné — exactement la même logique que l'app web, mais pilotée par la conversation.

Sur le site, un **bouton flottant vert** (en bas à droite, sur toutes les pages) ouvre la conversation WhatsApp avec le bot, avec un message pré-rempli « Bonjour, je veux envoyer une ordonnance ».

## Choix recommandés

**Fournisseur : Meta WhatsApp Cloud API** (et non Twilio).
- Boutons interactifs natifs (« Envoyer une ordonnance », « Suivre ma commande ») comme sur tes captures — Twilio ne les gère pas aussi bien.
- Gratuit jusqu'à 1 000 conversations service/mois, puis quelques centimes.
- Le numéro OTP Twilio existant reste inchangé : le bot utilise un numéro Business dédié.

**Compte patient : lier par numéro, créer si absent.**
Le numéro WhatsApp est cherché dans les profils existants. S'il correspond, la commande est rattachée au compte (le patient retrouve tout dans l'app). Sinon, un compte patient léger est créé automatiquement à partir du numéro — sans mot de passe ; le patient peut ensuite se connecter par OTP sur le même numéro et retrouver son historique. Zéro friction dans WhatsApp.

## Parcours du bot

```text
Patient ouvre WhatsApp (bouton flottant ou scan QR)
  -> Menu : Envoyer une ordonnance | Suivre ma commande | Parler à un humain
  -> Envoie la photo
  -> "Analyse en cours..." (IA vérifie l'authenticité + extrait les médicaments)
  -> Liste des médicaments trouvés -> Confirmer / Corriger
  -> Demande de position (bouton "Partager ma localisation" WhatsApp)
  -> Recherche pharmacie ayant 100% du stock -> réservation créée
  -> La pharmacie reçoit la commande (app + notification push, déjà en place)
  -> Messages automatiques au patient : acceptée / prête / livreur en route / livrée
  -> "Suivre ma commande" renvoie le statut + lien de suivi carte
```

Chaque étape réutilise la logique existante — rien n'est réécrit en double.

## Ce qu'il faut de ta part

1. Un compte **Meta for Developers** + une app WhatsApp Business (gratuit).
2. Un numéro de téléphone dédié au bot (non utilisé par WhatsApp perso).
3. Vérification de l'entreprise Meta (Business Verification) pour dépasser le mode test.
4. Me fournir : `WHATSAPP_ACCESS_TOKEN` (token permanent), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` (que je peux générer).

Je te guide écran par écran. En mode test (avant vérification), le bot fonctionne déjà avec jusqu'à 5 numéros de test.

## Plan technique

### 1. Base de données
- `whatsapp_sessions` : `wa_phone` (unique), `user_id`, `state` (menu / attente_photo / attente_confirmation / attente_position), `context` jsonb (prescription_id en cours, items), `last_message_at`.
- `whatsapp_messages` : journal brut des messages entrants/sortants (`wa_message_id` unique pour l'idempotence des retries Meta).
- Colonne `source` sur `prescriptions` et `reservations` : `app` | `whatsapp`.
- RLS : tables réservées au service (aucun accès anon/authenticated), lecture admin uniquement.

### 2. Webhook entrant
- `src/routes/api/public/whatsapp/webhook.ts`
  - `GET` : handshake de vérification Meta (`hub.verify_token`).
  - `POST` : vérification de la signature `X-Hub-Signature-256` (HMAC SHA-256 sur le corps brut) avant tout traitement, déduplication par `wa_message_id`, puis routage vers la machine à états.
- Réponse 200 immédiate, traitement ensuite (Meta réessaie sinon).

### 3. Machine à états du bot
- `src/lib/whatsapp.server.ts` : envoi des messages (texte, boutons interactifs, listes), téléchargement des médias (`/{media-id}` → URL → binaire).
- `src/lib/whatsapp-bot.server.ts` : logique par état.
  - Photo reçue → upload dans le bucket `prescriptions` → insertion `prescriptions` → appel de la logique d'extraction existante (`extractPrescription`, contrôle d'authenticité inclus).
  - Confirmation → réutilise la recherche de pharmacie et `autoRouteReservation` (100 % du stock, sinon message « aucune pharmacie ne dispose de tout, voici les alternatives »).
  - Localisation → message `location` WhatsApp, ou saisie texte d'adresse en repli.
- `src/lib/whatsapp-templates.ts` : tous les textes du bot en **fr / en / ar**, langue détectée à la première interaction (choix proposé au menu).

### 4. Notifications sortantes
- Extension du dispatcher push existant : si le destinataire a un numéro WhatsApp lié et que sa commande vient de WhatsApp, la notification part aussi en message WhatsApp (statut accepté / prêt / en livraison / livré).
- Hors fenêtre de 24 h, envoi via un **template approuvé** Meta (je prépare les 4 templates à soumettre).

### 5. Bouton flottant sur le web
- `src/components/WhatsAppFab.tsx` : bulle verte fixe en bas à droite, animation d'apparition douce, tooltip « Commander via WhatsApp », lien `wa.me/<numéro>?text=...`. Positionnement adapté au RTL arabe et à la barre de navigation mobile.
- Monté dans `src/routes/__root.tsx` pour être visible partout, masqué sur `/auth`.

### 6. Sécurité
- Token Meta et secret de signature stockés côté serveur uniquement.
- Signature du webhook vérifiée systématiquement ; aucune donnée médicale renvoyée à un numéro non lié à la commande.
- Les photos d'ordonnance restent dans le bucket privé ; jamais renvoyées dans WhatsApp.
- Limite anti-abus : nombre d'ordonnances par numéro et par heure.

## À noter
- Le bot ne remplace pas l'app : il crée les mêmes données, donc pharmacie, livreur et admin travaillent dans les écrans existants sans changement.
- Coût : ~0 en dessous de 1 000 conversations/mois, puis environ 0,03–0,08 $ par conversation au Mali.
