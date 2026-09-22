#!/usr/bin/env bash
# =============================================================================
# Copie des DONNÉES de l'ancienne base Supabase vers la nouvelle base Prisma.
#
# Prérequis :
#   - la nouvelle base est créée et migrée :  npx prisma migrate deploy
#   - elle est VIDE (ne pas lancer npm run db:seed avant)
#   - psql / pg_dump en version >= celle de Supabase (apt install postgresql-client-17)
#
# Usage :
#   export SUPABASE_DB_URL="postgresql://postgres.<ref>:<mot-de-passe>@aws-0-<region>.pooler.supabase.com:5432/postgres"
#   export DATABASE_URL="postgresql://saha:<mdp>@localhost:5432/saha"
#   bash scripts/migrate-from-supabase.sh
#
# (Supabase → Project Settings → Database → Connection string → « Session pooler » ou « Direct »)
#
# Les comptes (auth.users) sont copiés dans la table `users` avec leur mot de
# passe (hash bcrypt) : les utilisateurs se reconnectent avec le même mot de passe.
# =============================================================================
set -euo pipefail

: "${SUPABASE_DB_URL:?Définissez SUPABASE_DB_URL (connexion à la base Supabase)}"
: "${DATABASE_URL:?Définissez DATABASE_URL (nouvelle base)}"

# Prisma ajoute parfois ?schema=public : psql ne le comprend pas.
TARGET_URL="${DATABASE_URL%%\?*}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "→ Vérification que la base cible est vide…"
COUNT=$(psql "$TARGET_URL" -Atc "select count(*) from users")
if [ "$COUNT" != "0" ]; then
  echo "✖ La table users de la base cible contient déjà $COUNT ligne(s). Abandon."
  exit 1
fi

echo "→ Export des comptes (auth.users)…"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c "\copy (
  select u.id,
         nullif(lower(u.email), '') as email,
         case when coalesce(u.phone, '') = '' then null
              when u.phone like '+%' then u.phone
              else '+' || u.phone end as phone,
         nullif(u.encrypted_password, '') as password_hash,
         (select i.provider_id from auth.identities i
            where i.user_id = u.id and i.provider = 'google' limit 1) as google_sub,
         u.email_confirmed_at as email_verified_at,
         u.phone_confirmed_at as phone_verified_at,
         coalesce(u.raw_user_meta_data, '{}'::jsonb) as raw_user_meta_data,
         u.last_sign_in_at,
         u.created_at,
         coalesce(u.updated_at, u.created_at) as updated_at
  from auth.users u
  where u.deleted_at is null
) to '$WORK/users.csv' with csv header"

echo "→ Import des comptes…"
psql "$TARGET_URL" -v ON_ERROR_STOP=1 -c "\copy users (id, email, phone, password_hash, google_sub, email_verified_at, phone_verified_at, raw_user_meta_data, last_sign_in_at, created_at, updated_at) from '$WORK/users.csv' with csv header"

# Ordre respectant les clés étrangères.
TABLES=(
  profiles user_roles
  pharmacies pharmacy_staff medicines inventory
  prescriptions prescription_items
  neighborhoods couriers reservations reservation_items courier_positions
  practitioner_specialties practitioners appointments
  notifications device_tokens audit_logs feedback
  whatsapp_sessions whatsapp_events whatsapp_templates
)

for t in "${TABLES[@]}"; do
  echo "→ $t"
  pg_dump "$SUPABASE_DB_URL" --data-only --no-owner --no-privileges \
    --table="public.$t" > "$WORK/$t.sql"
  # Retire les réglages propres à Supabase qui n'existent pas sur la cible.
  sed -i.bak -e '/^SET transaction_timeout/d' "$WORK/$t.sql"
  psql "$TARGET_URL" -v ON_ERROR_STOP=1 -q -f "$WORK/$t.sql"
done

echo "→ Vérification…"
psql "$TARGET_URL" -c "select
  (select count(*) from users) as users,
  (select count(*) from pharmacies) as pharmacies,
  (select count(*) from prescriptions) as prescriptions,
  (select count(*) from reservations) as reservations,
  (select count(*) from appointments) as appointments"

echo "✔ Données copiées. Étape suivante : copier les fichiers d'ordonnances :"
echo "   npx tsx scripts/migrate-storage-from-supabase.ts"
