#!/bin/bash
# Deploiement additif de SAHA Santé : ne touche qu'a /var/www/saha.
#
# Le script construit la nouvelle version dans un repertoire dePreparation puis
# remplace l'ancien en une seule operation : une coupure de connexion ne peut
# plus laisser l'application a moitie deployee (l'ancienne version ecrase tout
# avant d'extraire la nouvelle).
set -e
APP=/var/www/saha
TAR=/tmp/saha-deploy.tar.gz
STAMP=$(date +%Y%m%d-%H%M%S)
STAGE=/var/www/saha.stage-$STAMP
BAK=/var/www/saha.bak-$STAMP

echo "--- 1. Sauvegarde de l'application courante ---"
cp -a "$APP" "$BAK"
echo "backup : $BAK"

echo "--- 2. Conservation du .env ---"
cp -a "$APP/.env" /tmp/saha.env.keep

echo "--- 3. Sauvegarde du stockage patient (seule source de verite) ---"
# `STORAGE_DIR` est relatif au dossier de l'application : les ordonnances
# patients vivent dans $APP/storage. Elles ne doivent JAMAIS venir du tar de
# deploiement (developpeur), qui n'en contient qu'une copie partielle.
rm -rf "$BAK.storage"
SRC_STORAGE="$APP/storage"
if [ ! -d "$SRC_STORAGE" ]; then
  # Application interrompue entre-temps : on recupere la sauvegarde complete.
  SRC_STORAGE=$(ls -d /var/www/saha.bak-*/storage 2>/dev/null | sort | tail -n 1)
  [ -n "$SRC_STORAGE" ] && echo "  stockage absent de $APP : recuperation depuis $SRC_STORAGE"
fi
if [ -n "$SRC_STORAGE" ] && [ -d "$SRC_STORAGE" ]; then
  cp -a "$SRC_STORAGE" "$BAK.storage"
  echo "  ordonnances preservees : $(find "$BAK.storage" -type f | wc -l)"
else
  echo "  ATTENTION : aucune source de stockage trouvee"
fi

echo "--- 4. Preparation dans $STAGE ---"
rm -rf "$STAGE"
mkdir -p "$STAGE"
tar -xzf "$TAR" -C "$STAGE" --exclude=./storage
cp -a /tmp/saha.env.keep "$STAGE/.env"
rm -rf "$STAGE/storage"
if [ -d "$BAK.storage" ]; then
  cp -a "$BAK.storage" "$STAGE/storage"
fi
echo "  fichiers sources : $(ls -A "$STAGE" | wc -l)"
echo "  ordonnances restaurees : $(find "$STAGE/storage" -type f 2>/dev/null | wc -l)"

echo "--- 5. Dependances ---"
cd "$STAGE"
# `set -o pipefail` avant le premier pipe : sans lui un `npm ci` en echec, masque
# par `| tail`, laissait la preparation continuer sur un repertoire incomplet.
set -o pipefail
npm ci --no-audit --no-fund 2>&1 | tail -4

echo "--- 6. Build ---"
# `| tail` masque le code de sortie de la commande pipée : sans `pipefail`, un
# build raté laissait `set -e` passer et la bascule installait une version
# cassee (502 sur tout le site). Journal complet dans /tmp/build-saha.log.
npm run build > /tmp/build-saha.log 2>&1 || {
  echo "  BUILD EN ECHEC - bascule annulee, l'ancienne version reste en service."
  echo "  Dernieres lignes :"
  grep -v -E '^[[:space:]]+at ' /tmp/build-saha.log | tail -20 | sed 's/^/    /'
  exit 1
}
tail -3 /tmp/build-saha.log | sed 's/^/  /'
echo "  build ok"

echo "--- 7. Migrations ---"
npx prisma migrate deploy 2>&1 | tail -3

echo "--- 8. Controle avant bascule ---"
# Une bascule ne doit jamais installer un bundle incapable de demarrer.
if [ ! -f "$STAGE/.output/server/index.mjs" ]; then
  echo "  bundle absent (.output/server/index.mjs)"
  exit 1
fi
echo "  bundle present"

echo "--- 9. Bascule (instantanee) ---"
cd /
mv "$APP" "/var/www/saha.old-$STAMP"
mv "$STAGE" "$APP"
rm -rf "/var/www/saha.old-$STAMP"
echo "  ancienne version supprimee, nouvelle version en place"

echo "--- 10. Redemarrage ---"
pm2 reload saha
sleep 5
pm2 list | grep saha

echo "--- 11. Controles HTTP ---"
# Un 5xx apres bascule = version cassee en service. Le deploiement le signale
# explicitement (et le journal pm2 est rappelee) au lieu de finir sur un "OK".
FAILED=0
for u in "https://sahasantemali.com/" "https://sahasantemali.com/auth" "https://sahasantemali.com/app" "https://sahasantemali.com/manifest.webmanifest"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$u")
  printf '  %-58s %s\n' "$u" "$code"
  case "$code" in 2*|3*) ;; *) FAILED=1 ;; esac
done
# /auth-callback?mobile=1 repond 307 (normalisation TanStack) puis 200 : on suit.
code=$(curl -sL -o /dev/null -w '%{http_code}' "https://sahasantemali.com/auth-callback?mobile=1")
printf '  %-58s %s (redirect suivi)\n' "https://sahasantemali.com/auth-callback?mobile=1" "$code"
case "$code" in 2*|3*) ;; *) FAILED=1 ;; esac
if [ "$FAILED" -ne 0 ]; then
  echo "  ATTENTION : une URL renvoie une erreur apres bascule."
  echo "  Dernieres lignes de pm2 :"
  pm2 logs saha --lines 25 --nostream 2>&1 | grep -v -E 'Stopping server|Graceful shutdown' | tail -15 | sed 's/^/    /'
fi

echo "--- 12. Ordonnances en place ---"
find "$APP/storage" -type f 2>/dev/null | wc -l | sed 's/^/  fichiers : /'

echo "--- 13. Fin ---"