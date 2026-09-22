#!/usr/bin/env bash
# =============================================================================
# Sauvegarde quotidienne : base PostgreSQL + fichiers d'ordonnances.
# Conserve 14 jours. À planifier avec cron (crontab -e) :
#
#   30 2 * * * bash /var/www/saha/deploy/backup.sh >> /var/log/saha-backup.log 2>&1
#
# Pensez aussi à copier /var/backups/saha hors du VPS (autre serveur, stockage
# objet…) : une sauvegarde sur la même machine ne protège pas d'une panne disque.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
# Lit une variable du fichier .env sans l'exécuter (valeurs avec espaces/JSON).
envget() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true; }
DATABASE_URL="$(envget DATABASE_URL)"
STORAGE_DIR="$(envget STORAGE_DIR)"; STORAGE_DIR="${STORAGE_DIR:-$(pwd)/storage}"

DEST="${BACKUP_DIR:-/var/backups/saha}"
STAMP="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$DEST"

DB_URL="${DATABASE_URL%%\?*}"
pg_dump "$DB_URL" --format=custom --no-owner --file "$DEST/db_$STAMP.dump"
tar -czf "$DEST/storage_$STAMP.tar.gz" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"

find "$DEST" -type f -mtime +14 -delete
echo "$(date -Is) sauvegarde OK : $DEST/db_$STAMP.dump"

# Restauration :
#   pg_restore --clean --no-owner -d "$DATABASE_URL" /var/backups/saha/db_XXXX.dump
#   tar -xzf /var/backups/saha/storage_XXXX.tar.gz -C /var/www/saha
