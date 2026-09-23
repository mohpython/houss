# Bot WhatsApp : même logique que le site

Objectif : un client qui commande sur WhatsApp suit exactement les mêmes étapes que dans l'application, sans avoir à ouvrir le site.

## Ce qui marche déjà

- Menu d'accueil en français / anglais / arabe
- Envoi de la photo d'ordonnance, lecture automatique des médicaments, confirmation
- Commande sans ordonnance (le client écrit les noms)
- Lieu de livraison : position GPS **ou** nom du quartier
- Recherche automatique de la pharmacie et suivi des commandes

## Ce qui manque (à ajouter)

1. **Choix retrait ou livraison**
   Après le lieu, deux boutons : « Je viens chercher » ou « Livraison ».
   En retrait, on ne demande pas d'adresse et il n'y a pas de frais de livraison.

2. **Récapitulatif et confirmation du prix**
   Message clair : pharmacie, distance, liste des médicaments disponibles, prix des produits, frais de livraison, total.
   Boutons « Je confirme » / « Annuler ».

3. **Paiement**
   Après confirmation : instructions de paiement mobile money (mêmes que le site) + lien de paiement en ligne pour ceux qui préfèrent.

4. **Codes de validation en 3 étapes**
   Le code de retrait et le code de réception sont envoyés au client par WhatsApp, comme sur le site, avec un rappel au moment de la remise.

5. **Notifications de suivi automatiques**
   Le client reçoit un message WhatsApp à chaque étape : commande acceptée, prête, livreur en route, livrée.

6. **Avis après livraison**
   Une fois la commande livrée, le bot demande une note de 1 à 5 et un commentaire libre, enregistré comme les avis du site.

7. **Ordonnance suspecte**
   Si la lecture détecte un doute, le bot dit que l'ordonnance part en vérification et prévient le client dès que l'admin valide (au lieu de bloquer sans explication).

## Détails techniques

- `src/lib/whatsapp-bot.server.ts` : nouveaux états `awaiting_fulfillment`, `awaiting_price_confirm`, `awaiting_feedback` ; réutilise `fulfillment.functions.ts`, `checkout`/paiement et `feedback` existants au lieu de dupliquer la logique.
- `src/lib/whatsapp-copy.ts` : nouveaux textes fr / en / ar (récap, paiement, codes, avis).
- Notifications sortantes : brancher les changements de statut de `reservations` / `deliveries` sur l'envoi WhatsApp pour les commandes dont `source = 'whatsapp'`.
- Aucune modification du schéma de base n'est nécessaire, sauf mémoriser l'état de la demande d'avis dans le contexte de session.
