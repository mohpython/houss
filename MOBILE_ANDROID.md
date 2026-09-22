# SAHA Santé — Build & publier l'app Android

L'app web actuelle est emballée avec **Capacitor**. Le code React ne change pas — Capacitor crée un projet Android natif qui charge SAHA Santé.

## Prérequis (sur votre ordinateur)

- **Node.js 20+** et **bun** (ou npm).
- **Android Studio** (dernière version stable) — https://developer.android.com/studio.
- **JDK 17** (installé automatiquement par Android Studio).
- **Compte Google Play Console** — 25 USD une fois — https://play.google.com/console.

## 1. Récupérer le code en local

Cliquez **GitHub → Connect to GitHub** dans Lovable, puis :

```bash
git clone <votre-repo>
cd <votre-repo>
bun install
```

## 2. Générer le projet Android (une seule fois)

```bash
bun run build
npx cap add android
npx cap sync android
```

Cela crée un dossier `android/` — ne pas le supprimer.

## 3. Lancer l'app sur un téléphone / émulateur

Branchez un téléphone Android (mode développeur + débogage USB activés) ou démarrez un émulateur dans Android Studio, puis :

```bash
npx cap run android
```

Pendant le dev, l'app charge directement depuis `https://sahapharm.lovable.app` (voir `server.url` dans `capacitor.config.ts`) — chaque modif Lovable est visible **sans rebuild natif**.

## 4. Préparer la version Play Store

Avant de builder pour production, **commentez la ligne `url`** dans `capacitor.config.ts` :

```ts
server: {
  androidScheme: "https",
  // url: "https://sahapharm.lovable.app",  // ← commenté pour la build store
  cleartext: false,
},
```

Puis :

```bash
bun run build
npx cap sync android
```

## 5. Générer la clé de signature (une seule fois, à SAUVEGARDER)

Dans Android Studio : **Build → Generate Signed Bundle / APK → Android App Bundle → Create new keystore**.

- Choisissez un mot de passe fort.
- **Sauvegardez le fichier `.jks` + mot de passe dans un endroit sûr (gestionnaire de mots de passe + backup cloud chiffré).**
- ⚠️ **Si vous perdez ce fichier, vous ne pourrez plus JAMAIS mettre à jour l'app sur le Play Store.**

## 6. Builder l'AAB signé

Toujours dans Android Studio : **Build → Generate Signed Bundle → Android App Bundle → release**.

Le fichier `.aab` sort dans `android/app/release/`.

## 7. Publier sur le Play Store

1. Allez sur https://play.google.com/console → **Créer une application**.
2. Remplissez : nom (`SAHA Santé`), langue par défaut (français), type (app), gratuite.
3. Onglet **Fiche du magasin** : description courte + longue, icône 512×512, 2+ captures d'écran téléphone, image bannière 1024×500.
4. Onglet **Confidentialité** : lien vers votre politique de confidentialité (voir §8).
5. Onglet **Contenu de l'app** : questionnaire (audience, permissions caméra/localisation).
6. Onglet **Production → Créer une nouvelle version** → uploadez le `.aab` → envoyez pour examen.
7. Délai de review Google : **1 à 7 jours** pour la première publication.

## 8. Politique de confidentialité (OBLIGATOIRE)

Google refusera l'app sans URL publique de politique de confidentialité, car SAHA Santé utilise :
- **Caméra** (scan d'ordonnance)
- **Localisation** (pharmacies proches, livraison)
- **Données de santé** (ordonnances)

Options : héberger une page sur votre site, ou demander à Lovable d'ajouter `/privacy` dans l'app.

## 9. Google Sign-In dans l'app Android

Google Sign-In depuis une WebView Android nécessite d'enregistrer l'empreinte SHA-1 de votre keystore côté Supabase (Lovable Cloud) et Google Cloud Console.

Récupérer la SHA-1 :

```bash
keytool -list -v -keystore <votre-keystore>.jks -alias <votre-alias>
```

Copiez la ligne `SHA1:` et ajoutez-la dans :
- **Google Cloud Console** → APIs & Services → Credentials → votre OAuth client Android.
- **Lovable Cloud** (backend) → Auth → Providers → Google → URIs autorisées.

Si Google Sign-In échoue au premier lancement natif, c'est presque toujours cette étape qui manque.

## 10. Mises à jour futures

À chaque changement web dans Lovable :

```bash
git pull
bun install
bun run build
npx cap sync android
# rebuild AAB signé dans Android Studio, upload nouvelle version sur Play Console
```

**Important** : incrémentez `versionCode` (entier) et `versionName` (string) dans `android/app/build.gradle` à chaque nouvel upload, sinon le Play Store refuse.

## Permissions déjà déclarées

Capacitor + les plugins ajoutés déclarent automatiquement dans `AndroidManifest.xml` :
- `INTERNET`, `ACCESS_NETWORK_STATE`
- `CAMERA`, `READ_MEDIA_IMAGES`
- `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`
- `POST_NOTIFICATIONS`

Vous pouvez vérifier / éditer dans `android/app/src/main/AndroidManifest.xml`.
