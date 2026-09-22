# SAHA Santé — Build & publier l'app Android

L'app web est emballée avec **Capacitor** : le projet Android natif ouvre le site hébergé sur votre VPS (`server.url` dans `capacitor.config.ts`). Le site doit donc être en ligne (voir `DEPLOIEMENT.md`) avant de tester l'app mobile.

## Prérequis (sur votre ordinateur)

- **Node.js 22+** et npm.
- **Android Studio** (dernière version stable) — https://developer.android.com/studio.
- **JDK 17** (installé automatiquement par Android Studio).
- **Compte Google Play Console** — 25 USD une fois — https://play.google.com/console.

## 1. Récupérer le code en local

```bash
git clone <votre-repo>
cd <votre-repo>
npm install
```

## 2. Générer le projet Android (une seule fois)

```bash
npm run cap:prepare
npx cap add android
npx cap sync android
```

(`cap:prepare` crée le dossier `dist/` minimal exigé par Capacitor : le contenu réel vient du serveur.)

Cela crée un dossier `android/` — ne pas le supprimer.

## 3. Lancer l'app sur un téléphone / émulateur

Branchez un téléphone Android (mode développeur + débogage USB activés) ou démarrez un émulateur dans Android Studio, puis :

```bash
npx cap run android
```

L'app charge directement `https://sahasantemali.com` (voir `server.url` dans `capacitor.config.ts`) : chaque mise à jour déployée sur le VPS est visible **sans rebuild natif**. Pour tester un autre serveur, changez temporairement cette URL.

## 4. Préparer la version Play Store

Vérifiez que `server.url` dans `capacitor.config.ts` pointe bien vers votre domaine de production (HTTPS), puis :

```bash
npm run cap:prepare
npx cap sync android
```

⚠️ Ne commentez pas `url` : l'application a besoin du serveur (rendu, API, connexion). Sans lui, elle afficherait une page vide.

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

La page existe déjà : `https://sahasantemali.com/privacy` (fichier `src/routes/privacy.tsx`).

## 9. Connexion Google dans l'app Android

Google interdit sa page de connexion dans une WebView intégrée (erreur `disallowed_useragent`). Dans l'app Android, les utilisateurs se connectent donc par **email / mot de passe** ou **téléphone** (si `OTP_CHANNEL` est configuré sur le serveur). La connexion Google reste disponible dans le navigateur (site web).

Pour l'activer aussi dans l'app, il faudra ajouter un plugin natif (ex. `@capgo/capacitor-social-login`) qui renvoie un jeton Google au serveur — non inclus pour l'instant.

## 10. Mises à jour futures

Les changements du site sont visibles dans l'app dès leur déploiement sur le VPS (`bash deploy/deploy.sh`), sans nouvelle version Play Store.

Une nouvelle version Play Store n'est nécessaire que si vous modifiez la partie native (plugins Capacitor, icône, permissions, `capacitor.config.ts`) :

```bash
git pull
npm install
npm run cap:prepare
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
