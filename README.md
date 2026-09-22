# SAHA Santé

Plateforme de santé pour Bamako (Mali). Le patient photographie son ordonnance, une IA la lit, puis la commande part vers la pharmacie partenaire la plus proche qui a les médicaments. Le patient paie par Orange Money ou Moov Money, puis il est livré ou retire sa commande en pharmacie.

L'application comprend aussi :

- la prise de rendez-vous avec des médecins et des infirmiers (triage des symptômes par IA) ;
- un bot WhatsApp ;
- des notifications push ;
- un back-office administrateur.

## Architecture

| Couche | Technologie |
|---|---|
| Front + serveur | [TanStack Start](https://tanstack.com/start) (React 19, SSR), build Node.js (Nitro `node-server`) |
| Base de données | PostgreSQL + [Prisma](https://www.prisma.io) (`prisma/schema.prisma`) |
| Comptes | Authentification maison : email/mot de passe, code SMS ou WhatsApp, Google OAuth (`src/server/auth.server.ts`) |
| Fichiers | Disque local, URL signées (`src/server/storage.server.ts`) |
| Temps réel | Server-Sent Events (`/api/realtime`) |
| Tâches planifiées | Dans le processus Node (`src/server/scheduler.server.ts`) |
| IA | Toute API compatible OpenAI : OpenRouter, Google AI Studio… (`src/server/ai.server.ts`) |
| Mobile | Capacitor (Android), qui affiche le site en ligne |

Organisation du code :

```
prisma/            schéma, migrations, seed (spécialités, quartiers)
src/server/        modules serveur : Prisma, auth, droits d'accès, stockage, temps réel, hooks métier
src/lib/           server functions (*.functions.ts) appelées par les pages
src/routes/        pages et routes API (api/realtime, api/storage, api/auth/google, webhook WhatsApp)
src/integrations/  clients navigateur : auth, temps réel, upload
deploy/            installation du VPS, déploiement, sauvegardes, Nginx
scripts/           création d'un admin, import des données Supabase
```

Les règles métier qui étaient autrefois des triggers PostgreSQL sont branchées automatiquement sur le client Prisma (`src/server/db.server.ts` et `lifecycle.server.ts`) : notifications, codes de retrait, péremption des ordonnances, exclusivité des rôles, diffusion temps réel. Les contrôles d'accès (ex-RLS) se trouvent dans `src/server/authz.server.ts` et `src/lib/reservation-rules.server.ts`.

## Développement local

Prérequis : Node.js 22 et Docker (pour PostgreSQL).

```bash
docker run -d --name saha-db -e POSTGRES_USER=saha -e POSTGRES_PASSWORD=saha \
  -e POSTGRES_DB=saha -p 5432:5432 postgres:16-alpine

cp .env.example .env
# Dans .env :
#   DATABASE_URL=postgresql://saha:saha@localhost:5432/saha?schema=public
#   APP_URL=http://localhost:3000
#   OTP_CHANNEL=log   (les codes de connexion s'affichent dans le terminal)
#   AI_API_KEY=...    (indispensable pour scanner une ordonnance)

npm install
npx prisma migrate dev
SEED_DEMO=1 npm run db:seed      # + praticiens de démonstration
npm run admin:create -- admin@exemple.com "MotDePasse123"
npm run dev                      # http://localhost:3000
```

Commandes utiles :

| Commande | Effet |
|---|---|
| `npm run typecheck` | Vérification TypeScript |
| `npm run build && npm start` | Build de production et démarrage |
| `npx prisma studio` | Explorer la base |
| `npx prisma migrate dev --name xxx` | Créer une migration après avoir modifié `schema.prisma` |

## Mise en production

Voir **[DEPLOIEMENT.md](DEPLOIEMENT.md)** (VPS Hostinger : installation, HTTPS, import des données Supabase, sauvegardes).

Application Android : voir **[MOBILE_ANDROID.md](MOBILE_ANDROID.md)**.
