#!/usr/bin/env bash
# =============================================================================
# Déploiement / mise à jour de l'application sur le VPS.
# À lancer depuis le dossier de l'application (ex. /var/www/saha) :
#
#   bash deploy/deploy.sh
#
# 1. récupère la dernière version (si dépôt git)   4. applique les migrations
# 2. installe les dépendances                       5. (re)démarre avec PM2
# 3. construit l'application
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
# Lit une variable du fichier .env sans l'exécuter (valeurs avec espaces/JSON).
envget() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true; }

if [ ! -f .env ]; then
  echo "✖ Fichier .env manquant : cp .env.example .env puis complétez-le."
  exit 1
fi

if [ -d .git ]; then
  echo "==> git pull"
  git pull --ff-only
fi

echo "==> Dépendances"
npm ci --no-audit --no-fund

echo "==> Build (Vite intègre ici les variables VITE_* du .env)"
npm run build

echo "==> Migrations de la base"
npx prisma migrate deploy

echo "==> Données de référence (spécialités, quartiers)"
npm run db:seed

echo "==> Démarrage"
if pm2 describe saha >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

sleep 3
PORT="$(envget PORT)"; PORT="${PORT:-3000}"
if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/"; then
  echo "✔ Application en ligne sur le port ${PORT}"
else
  echo "⚠ L'application ne répond pas encore : pm2 logs saha"
fi
