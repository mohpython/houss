# Guide de portage Supabase → Prisma (référence interne)

Ce projet (TanStack Start + React) utilisait Supabase (base Postgres avec RLS,
Auth, Storage, Realtime, triggers). Il est migré vers **Prisma + PostgreSQL
auto-hébergé** sur un VPS. Les fondations sont déjà écrites ; il reste à porter
chaque fichier qui utilise encore `supabase`.

## Fondations disponibles (ne pas modifier sans raison)

| Besoin | Module |
|---|---|
| Client Prisma (avec hooks = anciens triggers) | `src/server/db.server.ts` → `prisma` |
| Client Prisma brut (sans hooks) | `src/server/prisma-base.server.ts` → `basePrisma` (réservé aux hooks/auth) |
| Middleware auth serveur | `src/integrations/auth/middleware.ts` → `requireAuth` (context: `userId`, `accessToken`), `optionalAuth` |
| Contrôles d'accès (ex-RLS) | `src/server/authz.server.ts` → `hasRole`, `isAdmin`, `assertAdmin`, `isPharmacyMember`, `assertPharmacyMemberOrAdmin`, `userPharmacyIds`, `getCourierForUser`, `isUserCourier`, `getPractitionerForUser`, `isUserPractitioner`, `reservationAccess`, `loadReservationForUser`, `canReadPrescription`, `ForbiddenError`, `NotFoundError` |
| Comptes / rôles | `src/server/auth.server.ts` → `createAccount`, `addRole`, `getRoles`, `toAuthUser`, `normalizeEmail`, `hashPassword` |
| Notifications in-app (+push +temps réel) | `src/server/lifecycle.server.ts` → `notify(userId, type, data, title?, body?)` |
| Sérialisation JSON des résultats | `src/server/serialize.ts` → `toPlain(value)`, `toDateOnly(str)` (import statique autorisé partout) |
| Fichiers | `src/server/storage.server.ts` → `createSignedUrl(bucket, key, sec)`, `createAbsoluteSignedUrl`, `readObject`, `saveObject`, `removeObjects`, `mimeFromKey`, `extFromMime` |
| Upload navigateur | `src/integrations/storage/client.ts` → `uploadPrescriptionFile(file)` → `{ path, mime }` |
| IA | `src/server/ai.server.ts` → `visionModel()`, `textModel()` |
| Temps réel navigateur | `src/integrations/realtime/client.ts` → `subscribeRealtime(specs, cb, { onResync? })` renvoie la fonction de désabonnement |
| Auth navigateur | `src/integrations/auth/client.ts` → `auth.getUser()`, `auth.getSession()`, `auth.signOut()`, `auth.onAuthStateChange()` |

Le schéma est dans `prisma/schema.prisma`. L'ancien SQL complet (RLS, triggers)
est dans `docs/legacy-supabase/migrations/` — s'y référer pour connaître les règles d'accès.

## Règles de portage

1. **Imports serveur dynamiques** dans les fichiers `*.functions.ts` et les routes
   (ils sont aussi embarqués côté navigateur) :
   ```ts
   const { prisma } = await import("@/server/db.server");
   const { assertAdmin } = await import("@/server/authz.server");
   ```
   Seuls les imports `type` et `@/server/serialize` peuvent être statiques.
   Dans les fichiers `*.server.ts`, les imports statiques sont permis.

2. **Middleware** : remplacer `requireSupabaseAuth` (de
   `@/integrations/supabase/auth-middleware`) par `requireAuth` (de
   `@/integrations/auth/middleware`). `context.supabase` n'existe plus ;
   utiliser `prisma` + `context.userId`.

3. **Plus de RLS** : chaque server function doit vérifier elle-même les droits,
   en reproduisant la politique RLS de l'ancienne table (voir migrations SQL et
   `authz.server.ts`). Un appel qui passait par `context.supabase` (client RLS)
   doit être filtré explicitement ; un appel qui passait par `supabaseAdmin`
   (service role) contournait la RLS — garder alors les vérifications métier
   déjà présentes dans le code.

4. **Noms identiques** : modèles et champs Prisma = tables et colonnes SQL
   (snake_case). Les relations portent le nom des anciens « embeds » PostgREST :
   - `reservations` → `pharmacies`, `couriers`, `neighborhoods`, `prescriptions`, `reservation_items`, `courier_positions`, `feedback`, `patient` (users)
   - `reservation_items` → `reservations`, `prescription_items`
   - `prescription_items` → `prescriptions`, `medicines`, `reservation_items`
   - `prescriptions` → `prescription_items`, `reservations`, `patient`
   - `inventory` → `pharmacies`, `medicines`
   - `pharmacies` → `pharmacy_staff`, `inventory`, `reservations`, `feedback`, `owner`
   - `pharmacy_staff` → `pharmacies`, `user`
   - `appointments` → `practitioners`, `patient`
   - `practitioners` → `practitioner_specialties`, `appointments`, `user`
   - `couriers` → `reservations`, `courier_positions`, `user`
   - `users` → `profile` (profiles), `user_roles`, …
   Ainsi `select("id, pharmacies(name)")` devient
   `select: { id: true, pharmacies: { select: { name: true } } }` et le résultat
   a exactement la même forme qu'avant.

5. **Toujours renvoyer `toPlain(résultat)`** depuis une server function qui
   renvoie des lignes de la base : les `Date` deviennent des chaînes ISO (et
   `prescription_date` → `"YYYY-MM-DD"`), comme avec Supabase. Le front manipule
   des chaînes.

6. **Écritures** :
   - Les champs `DateTime` acceptent `new Date()` ou une chaîne ISO complète.
   - `prescription_date` (colonne DATE) : utiliser `toDateOnly("2026-09-10")`.
   - Les champs `Json` : caster en `Prisma.InputJsonValue` (import type depuis `@prisma/client`) ou `as never` si nécessaire.
   - `updated_at` est automatique (`@updatedAt`), inutile de le fixer.
   - Ne **pas** écrire dans `reservations`, `appointments`, `notifications` à
     l'intérieur de `prisma.$transaction` (les hooks de notification seraient perdus).
   - Les notifications, codes de retrait, `is_expired`, gardes d'exclusivité des
     rôles et diffusion temps réel sont gérés automatiquement par `prisma`
     (ne pas les dupliquer).

7. **Anciennes règles de mise à jour** (triggers `enforce_reservation_update_columns`
   et `enforce_appointment_update_columns`, dans la migration
   `20260905151609_...sql`) : quand le navigateur modifiait directement une
   commande ou un rendez-vous, la nouvelle server function doit appliquer ces
   mêmes règles (champs autorisés selon patient / pharmacie / livreur /
   praticien, patient ne peut qu'annuler, frais de livraison 0 ou 1000, etc.).

8. **Correspondances supabase-js → Prisma** :
   - `.eq(c, v)` → `where: { c: v }` ; `.neq` → `{ not: v }` ; `.in(c, arr)` → `{ in: arr }`
   - `.is(c, null)` → `c: null` ; `.not(c, "is", null)` → `c: { not: null }`
   - `.ilike(c, "%x%")` → `{ contains: x, mode: "insensitive" }`
   - `.gte/.lte/.gt/.lt` → `{ gte: … }` etc.
   - `.or("a.eq.1,b.eq.2")` → `OR: [...]`
   - `.order(c, { ascending: false })` → `orderBy: { c: "desc" }`
   - `.limit(n)` → `take: n` ; `.range(a, b)` → `skip: a, take: b - a + 1`
   - `.single()` → `findUnique`/`findFirst` + erreur si null ; `.maybeSingle()` → `findFirst` (null possible)
   - `select("*", { count: "exact", head: true })` → `prisma.x.count({ where })`
   - `.upsert(row, { onConflict: "a,b" })` → `prisma.x.upsert({ where: { a_b: {…} }, create, update })`
   - `.insert([...])` → `createMany({ data: [...] })` (ou `create` si l'id est nécessaire)
   - `.delete().eq(...)` → `deleteMany({ where })`
   - supabase ne levait pas d'exception (`{ error }`) ; Prisma lève. Garder les
     messages d'erreur en français existants.
   - `supabaseAdmin.auth.admin.getUserById(id)` → `prisma.users.findUnique({ where: { id }, select: { email: true, phone: true, created_at: true, email_verified_at: true, last_sign_in_at: true } })`
   - `supabaseAdmin.auth.admin.listUsers()` → `prisma.users.findMany(...)`
   - `supabaseAdmin.auth.admin.createUser(...)` → `createAccount(...)` de `auth.server.ts`
   - `supabase.storage.from("prescriptions").createSignedUrl(path, sec)` → `createSignedUrl("prescriptions", path, sec)` (synchrone, URL relative)
   - `supabase.rpc("has_role", …)` → `hasRole(userId, role)`

9. **Code navigateur (routes `.tsx`, composants, hooks)** : plus aucun accès
   direct à la base. Chaque `supabase.from(...)` doit devenir un appel à une
   server function (existante ou nouvelle, créée dans un fichier `*.functions.ts`
   que vous possédez), appelée via `useServerFn(fn)` ou directement `fn({ data })`.
   - `supabase.auth.getUser()` → `auth.getUser()` ; l'utilisateur courant est
     aussi dans `Route.useRouteContext().user` sous `/_authenticated` (`{ id, email, phone, user_metadata }`).
   - `supabase.channel(...).on("postgres_changes", {event, table, filter: "col=eq.val"}, cb).subscribe()` →
     ```ts
     useEffect(() => subscribeRealtime(
       [{ table: "reservations", event: "*", filter: { patient_id: user.id } }],
       () => load(),
       { onResync: () => load() },
     ), [user.id]);
     ```
     Le payload `new` des événements `reservations` ne contient que :
     `id, patient_id, pharmacy_id, courier_id, status, delivery_status,
     payment_status, fulfillment_method, updated_at` ; `courier_positions` :
     `id, courier_id, reservation_id, lat, lng, recorded_at` ; `couriers` :
     `id, user_id, status, is_online, current_lat, current_lng, last_position_at` ;
     `pharmacies` : `id, status, owner_user_id, updated_at` ; `appointments` :
     `id, patient_id, practitioner_id, status, scheduled_at, proposed_at, updated_at` ;
     `notifications` : ligne complète.
   - Ne pas modifier l'apparence ni les textes de l'UI.

10. **Signatures des modules cœur (après portage)** — le paramètre client
    Supabase disparaît partout :
    - `rx-core.server.ts` : `extractPrescriptionCore(actorUserId, prescriptionId)`, `classifySeverity(...)` inchangé, types `ExtractResult`, `ReviewSeverity` inchangés
    - `medicine-match.server.ts` : `loadCatalog()`, `catalogHint(catalog)`, `linkPrescriptionItemsToCatalog(prescriptionId)`, `matchItemsToInventory(items, inv)` (pur), type `InventoryLine` inchangé
    - `routing-core.server.ts` : `resolveDeliveryTarget(input)`, `autoRouteCore(input)`, `assignCourierCore(reservationId, actorUserId)`, `haversineKm`, `DELIVERY_FEE` inchangés
    - `health-core.server.ts` : `triageSymptoms(specialties, symptoms, language)`, `findPractitionersCore(opts)`
    - `otc-core.server.ts` : mêmes fonctions sans le paramètre client

11. **Vérification** : `npx tsc --noEmit 2>&1 | grep -E "<vos fichiers>"` doit
    être vide pour vos fichiers (les autres fichiers peuvent encore avoir des
    erreurs pendant le portage parallèle). Aucune référence à `supabase`,
    `lovable` ou `LOVABLE_API_KEY` ne doit rester dans vos fichiers.
