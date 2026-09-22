#!/usr/bin/env bash
# =============================================================================
# Installation initiale d'un VPS Hostinger (Ubuntu 22.04 / 24.04) pour SAHA Santé.
# À lancer UNE fois, en root :
#
#   sudo bash deploy/setup-vps.sh sahasantemali.com
#
# Installe : Node.js 22, PM2, PostgreSQL, Nginx, Certbot, pare-feu UFW.
# Crée : la base « saha » + son utilisateur, le dossier /var/www/saha,
#        la configuration Nginx du domaine.
# =============================================================================
set -euo pipefail

DOMAIN="${1:-}"
APP_DIR="/var/www/saha"
DB_NAME="saha"
DB_USER="saha"

if [ "$(id -u)" -ne 0 ]; then echo "Lancez ce script avec sudo."; exit 1; fi
if [ -z "$DOMAIN" ]; then echo "Usage : sudo bash deploy/setup-vps.sh mondomaine.com"; exit 1; fi

export DEBIAN_FRONTEND=noninteractive

echo "==> Paquets système"
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git ca-certificates gnupg build-essential ufw nginx \
  postgresql postgresql-contrib certbot python3-certbot-nginx openssl

echo "==> Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v
npm install -g pm2@latest

echo "==> PostgreSQL : base et utilisateur"
systemctl enable --now postgresql
if ! sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='$DB_USER'" | grep -q 1; then
  DB_PASS="$(openssl rand -hex 24)"
  sudo -u postgres psql -c "create role $DB_USER login password '$DB_PASS';"
  sudo -u postgres psql -c "create database $DB_NAME owner $DB_USER;"
  echo "$DB_PASS" > /root/saha-db-password.txt
  chmod 600 /root/saha-db-password.txt
  echo "   Mot de passe de la base enregistré dans /root/saha-db-password.txt"
else
  echo "   L'utilisateur $DB_USER existe déjà (inchangé)."
fi

echo "==> Dossiers de l'application"
mkdir -p "$APP_DIR" "$APP_DIR/storage" /var/backups/saha
DEPLOY_USER="${SUDO_USER:-root}"
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR" /var/backups/saha

echo "==> Nginx"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
sed "s/DOMAINE/$DOMAIN/g" "$SCRIPT_DIR/nginx/saha.conf" > /etc/nginx/sites-available/saha
ln -sf /etc/nginx/sites-available/saha /etc/nginx/sites-enabled/saha
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Pare-feu"
ufw allow OpenSSH
ufw allow "Nginx Full"
ufw --force enable

echo "==> Démarrage automatique de PM2 au boot"
pm2 startup systemd -u "$DEPLOY_USER" --hp "$(getent passwd "$DEPLOY_USER" | cut -d: -f6)" >/dev/null || true

cat <<EOF

✔ Serveur prêt.

Étapes suivantes (voir DEPLOIEMENT.md) :
  1. Copier le code dans $APP_DIR  (git clone ... $APP_DIR  ou  rsync)
  2. cp .env.example .env  puis compléter (DATABASE_URL avec le mot de passe de
     /root/saha-db-password.txt, APP_URL=https://$DOMAIN, APP_SECRET, AI_API_KEY…)
  3. bash deploy/deploy.sh
  4. HTTPS : sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN
  5. Compte admin : npm run admin:create -- vous@exemple.com "MotDePasse"
EOF
