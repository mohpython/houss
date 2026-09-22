# Déployer SAHA Santé sur un VPS Hostinger

Ce guide part d'un VPS Hostinger neuf sous **Ubuntu 24.04** (ou 22.04). Il faut compter environ 30 minutes.

Une fois installé, le serveur fait tourner :

```
Internet ──HTTPS──> Nginx (80/443) ──> Node.js (PM2, port 3000) ──> PostgreSQL
                                          │
                                          └─> /var/www/saha/storage (photos d'ordonnances)
```

Tout est hébergé sur le VPS, sans Supabase ni Lovable :

- **Base de données** : PostgreSQL, gérée avec Prisma.
- **Comptes** : email et mot de passe, code par téléphone, connexion Google.
- **Fichiers** : stockés sur le disque du VPS.
- **Temps réel** : flux SSE.
- **Tâches planifiées** : rappels de rendez-vous.

---

## 1. Préparer le VPS et le domaine

1. Dans le **hPanel Hostinger**, ouvrez VPS, puis *Système d'exploitation*, et choisissez **Ubuntu 24.04** (sans panneau).
2. Notez l'**adresse IP** du VPS.
3. Chez votre registrar DNS (Hostinger → Domaines → DNS), créez deux enregistrements :
   - `A` : `@` → IP du VPS
   - `A` : `www` → IP du VPS
4. Connectez-vous au VPS :
   ```bash
   ssh root@IP_DU_VPS
   ```
5. (Recommandé) Créez un utilisateur non-root :
   ```bash
   adduser saha && usermod -aG sudo saha && su - saha
   ```

## 2. Installer les logiciels (une seule fois)

Copiez le code sur le VPS. Avec un dépôt Git :

```bash
sudo mkdir -p /var/www/saha && sudo chown $USER:$USER /var/www/saha
git clone <URL_DE_VOTRE_DEPOT> /var/www/saha
```

Sans Git, depuis votre ordinateur :

```bash
rsync -av --exclude node_modules --exclude .output ./ saha@IP_DU_VPS:/var/www/saha/
```

Lancez ensuite l'installation. Remplacez le domaine par le vôtre :

```bash
cd /var/www/saha
sudo bash deploy/setup-vps.sh sahasantemali.com
```

Le script installe Node.js 22, PM2, PostgreSQL, Nginx, Certbot et le pare-feu. Il crée aussi la base `saha`, dont le mot de passe est enregistré dans `/root/saha-db-password.txt`.

## 3. Configurer l'application

```bash
cd /var/www/saha
cp .env.example .env
sudo cat /root/saha-db-password.txt      # mot de passe de la base
openssl rand -base64 48                  # à copier dans APP_SECRET
nano .env
```

Variables **obligatoires** :

| Variable | Valeur |
|---|---|
| `APP_URL` | `https://sahasantemali.com` |
| `APP_SECRET` | la chaîne générée par `openssl rand -base64 48` |
| `DATABASE_URL` | `postgresql://saha:MOT_DE_PASSE@localhost:5432/saha?schema=public` |
| `STORAGE_DIR` | `/var/www/saha/storage` |
| `AI_API_KEY` | votre clé OpenRouter (https://openrouter.ai/keys) ou Google AI Studio (voir les commentaires du fichier) |

Variables **facultatives**. Chaque fonction ne s'active que si ses variables sont renseignées :

- **Connexion Google** : `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`. Dans la console Google Cloud, déclarez l'URI de redirection `https://VOTRE_DOMAINE/api/auth/google/callback`.
- **Connexion par téléphone** : `OTP_CHANNEL=twilio` avec les `TWILIO_*`, ou `OTP_CHANNEL=whatsapp` avec un modèle WhatsApp de catégorie « Authentification ».
- **Mot de passe oublié** : `SMTP_*`. Chez Hostinger, créez une adresse email puis utilisez `smtp.hostinger.com`, port `465`.
- **Cartes** : `GOOGLE_MAPS_API_KEY` (serveur) et `VITE_GOOGLE_MAPS_BROWSER_KEY` (navigateur, à restreindre à votre domaine).
- **WhatsApp** : `WHATSAPP_*`. Chez Meta, le webhook est `https://VOTRE_DOMAINE/api/public/whatsapp/webhook`.
- **Notifications push** : `FIREBASE_*`. `FIREBASE_SERVICE_ACCOUNT_JSON` doit tenir sur une seule ligne.

> Les variables `VITE_*` sont intégrées au site au moment du build. Après toute modification, relancez `bash deploy/deploy.sh`.

## 4. Construire et démarrer

```bash
bash deploy/deploy.sh
```

Le script enchaîne les étapes suivantes :

1. installation des dépendances ;
2. build ;
3. création des tables avec `prisma migrate deploy` ;
4. données de référence : spécialités et quartiers de Bamako ;
5. démarrage avec PM2.

## 5. Activer HTTPS

```bash
sudo certbot --nginx -d sahasantemali.com -d www.sahasantemali.com
```

Certbot renouvelle ensuite le certificat automatiquement.

## 6. Créer le compte administrateur

```bash
npm run admin:create -- vous@exemple.com "UnMotDePasseSolide"
```

Connectez-vous ensuite sur `https://VOTRE_DOMAINE/auth`. Le menu **Admin** apparaît.

## 7. Récupérer les données de l'ancienne version (Supabase)

À faire **avant** la première utilisation, sur une base vide. Si vous avez déjà lancé `deploy.sh`, le seed a rempli les spécialités et les quartiers : videz d'abord ces deux tables (`psql "$DATABASE_URL" -c "truncate practitioner_specialties, neighborhoods cascade"`), sinon l'import s'arrêtera sur des doublons.

1. Dans Supabase, ouvrez *Project Settings*, puis *Database*, puis *Connection string*, et copiez l'URI (mode « Session »).
2. Installez un client PostgreSQL récent : `sudo apt install postgresql-client-17`. S'il est introuvable, ajoutez d'abord le dépôt apt.postgresql.org.
3. Lancez :
   ```bash
   export SUPABASE_DB_URL="postgresql://postgres.xxxx:MOTDEPASSE@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"
   export DATABASE_URL="$(grep ^DATABASE_URL= .env | cut -d= -f2-)"
   npm run db:import-supabase
   ```
   Les comptes sont copiés avec leur mot de passe : les utilisateurs se reconnectent comme avant.
4. Copiez les photos d'ordonnances avec la clé `service_role`, visible dans Supabase sous *Settings*, puis *API* :
   ```bash
   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... npm run storage:import-supabase
   ```
5. Relancez `pm2 reload saha`.

## 8. Sauvegardes (à ne pas oublier)

```bash
crontab -e
# ajouter la ligne :
30 2 * * * bash /var/www/saha/deploy/backup.sh >> /var/log/saha-backup.log 2>&1
```

Chaque nuit, une copie de la base et des ordonnances est enregistrée dans `/var/backups/saha`, avec 14 jours d'historique. Copiez régulièrement ce dossier **hors du VPS**. Vous pouvez aussi activer les sauvegardes automatiques du VPS dans le hPanel.

## 9. Mettre à jour le site

```bash
cd /var/www/saha
bash deploy/deploy.sh     # git pull + build + migrations + redémarrage
```

## Commandes utiles

| Action | Commande |
|---|---|
| Voir les journaux | `pm2 logs saha` |
| Redémarrer | `pm2 reload saha` |
| État | `pm2 status` |
| Explorer la base | `npx prisma studio` (puis tunnel SSH `ssh -L 5555:localhost:5555 ...`) |
| Tester Nginx | `sudo nginx -t && sudo systemctl reload nginx` |

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `502 Bad Gateway` | L'application ne tourne pas : lancez `pm2 logs saha`. |
| Les notifications n'arrivent pas en direct | Nginx doit utiliser `deploy/nginx/saha.conf` (bloc `/api/realtime` avec `proxy_buffering off`). |
| « AI_API_KEY manquant » lors d'un scan | `AI_API_KEY` n'est pas renseignée dans `.env`. Complétez-la puis lancez `pm2 reload saha --update-env`. |
| Photo trop lourde refusée | La limite est de 15 Mo côté application et de 20 Mo dans Nginx (`client_max_body_size`). |
| Connexion Google : `redirect_uri_mismatch` | L'URI déclarée chez Google doit être exactement `APP_URL` suivie de `/api/auth/google/callback`. |
