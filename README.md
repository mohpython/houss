# SAHA Santé

Plateforme de santé pour Bamako (Mali) : le patient photographie son ordonnance,
une IA la lit, la commande part vers la pharmacie partenaire la plus proche qui a
les médicaments, puis il est livré ou retire sa commande en pharmacie.

Le dépôt contient deux parties, qui partagent la même base de données et les
mêmes comptes :

| Dossier | Contenu |
|---|---|
| [`prescription-pal-main/`](prescription-pal-main/) | Site web et serveur (TanStack Start + Prisma + PostgreSQL), espace patient, pharmacie, livreur, praticien et administration, bot WhatsApp, API mobile |
| [`App-mobile/`](App-mobile/) | Application mobile patient (Flutter, Android et iOS), branchée sur l'API `/api/v1` du serveur |

## Démarrage rapide

- Serveur et site : voir [`prescription-pal-main/README.md`](prescription-pal-main/README.md)
- Mise en production sur un VPS : voir [`prescription-pal-main/DEPLOIEMENT.md`](prescription-pal-main/DEPLOIEMENT.md)
- Application mobile : voir [`App-mobile/README.md`](App-mobile/README.md)

## Technique en bref

- **Base de données** : PostgreSQL, schéma et migrations gérés par Prisma.
- **Comptes** : authentification maison (email et mot de passe, code par
  téléphone, Google), sessions par jeton.
- **Fichiers** : les photos d'ordonnances sont stockées sur le serveur et
  servies par des liens signés à durée limitée.
- **Temps réel** : flux SSE (commandes, notifications, position du livreur).
- **IA** : toute API compatible OpenAI (lecture des ordonnances, triage des
  symptômes).

Le projet n'utilise plus ni Supabase ni Lovable : tout est auto-hébergé.
