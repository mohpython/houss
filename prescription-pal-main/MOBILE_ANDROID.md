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

---

# Connexion Google sur l'application mobile (Flutter)

> Cette section concerne l'application **Flutter** (`App-mobile/`), pas
> l'application Capacitor décrite plus haut.

## Flux retenu : le client OAuth « Web » via Custom Tab

Le sélecteur de compte **natif** (Google Play Services) est inutilisable tant que
le client Android n'est pas correctement enregistré dans la console Google Cloud :
toute requête de jeton faite par le paquet `com.sahasantemali.saha_sante` est alors
rejetée par Google, **y compris** les jetons d'accès « simples » (portée `oauth2:…`) :

```
W/Auth: [GetTokenResponseHandler] Server returned error: This android application
is not registered to use OAuth2.0 …
```

Le registre Android étant hors de portée du serveur, la connexion Google mobile
passe donc par le **client Web** (qui fonctionne) :

```
Application mobile
  │ 1. bouton « Continuer avec Google » → Custom Tab
  │    https://sahasantemali.com/api/auth/google/?redirect=%2Fapp&mobile=1
  ▼
Google (consentement, client Web enregistré)
  │ 302 → /api/auth/google/callback  (échange du code, création de session)
  │ state = { r, n, e, m: 1 }        ← HMAC, « m » = mobile
  ▼
302 → /auth-callback?mobile=1#access_token=…&expires_at=…
  │   ← le jeton reste dans le fragment : jamais envoyé au serveur
  ▼
Page « Ouvrir SAHA Santé » (tentative auto, puis bouton)
  │  sahasantemali://auth?access_token=…&expires_at=…
  ▼
Application mobile : applySessionToken() → GET /api/v1/me → écran /app
```

### Côté serveur

| Fichier | Rôle |
| --- | --- |
| `src/server/oauth.server.ts` | `buildGoogleAuthUrl(redirect, mobile)` place `m: 1` dans le state ; `parseState()` le relit et retourne le `nonce` ; `rememberSession()` / `recallSession()` rendent le callback idempotent. |
| `src/routes/api/auth/google/index.ts` | Lit `?mobile=1` et le transmet au state. |
| `src/routes/api/auth/google/callback.ts` | Si `m === 1`, redirige vers `/auth-callback?mobile=1#access_token=…`. |
| `src/routes/auth-callback.tsx` | Version mobile de la page : construit `sahasantemali://auth?…` depuis le fragment et propose le bouton d'ouverture. |
| `public/manifest.webmanifest` | `scope` restreint à `/app` pour que la PWA n'intercepte pas le flux OAuth. |

Le flux **web** (sans `mobile=1`) est inchangé : redirection vers
`/auth-callback#access_token=…`.

> ⚠️ **Pourquoi une page intermédiaire ?** Une redirection automatique (`302`)
> vers un schéma inconnu est **refusée par Chrome** : le navigateur reste sur
> la page web et l'application ne s'ouvre jamais. Chrome n'accepte d'ouvrir une
> application que sur un **geste utilisateur**, d'où le bouton. La tentative
> automatique au chargement est une commodité (certains navigateurs l'acceptent,
> Chrome non).

> ⚠️ **TanStack Router réécrit `?mobile=1` en `?mobile=%221%22`** (la valeur est
> sérialisée en JSON), et `validateSearch` ne reçoit pas toujours l'écriture
> d'origine. Compter sur `useSearch()` seul fait échouer la détection et l'app
> retombe sur la branche web. `detectMobileFlow()` relit donc l'indicateur dans
> `window.location.search` **au montage** (seul moment où il est encore là, car
> l'effet nettoie ensuite l'URL) et ne conserve que les chiffres.

> ⚠️ **L'application Web installée (WebAPK) peut voler la navigation.** Chrome
> résout l'URL `https://sahasantemali.com/api/auth/google/?…` vers la PWA
> installée (scope `/`), et non vers une Custom Tab : l'utilisateur atterrit sur
> `/app` dans la fenêtre autonome et le jeton n'atteint jamais l'application
> native. Le manifeste est donc passé à `"scope": "/app"` : `/api/auth/google/`
> et `/auth-callback` sont hors de la portée de la PWA, et Chrome ouvre une
> vraie Custom Tab. **Une PWA déjà installée garde son ancien `scope` en cache** :
> la désinstaller puis la réinstaller (menu Chrome → « Ajouter à l'écran d'accueil »)
> est nécessaire une fois.

> ⚠️ **Chrome demande parfois le callback deux fois** (double navigation) alors
> que le `code` Google est à usage unique : la seconde requête échouait en 400 et
> l'utilisateur retombait sur la page d'erreur. `recallSession(nonce)` mémorise la
> session 2 minutes et la restitue au second appel, une seule fois.

### Côté application

- `android/app/src/main/AndroidManifest.xml` : `intent-filter` sur le schéma
  `sahasantemali` / hôte `auth` (action VIEW + catégorie BROWSABLE).
- `lib/main.dart` : écoute `AppLinks` (lien au démarrage **et** pendant que
  l'app tourne).
- `lib/core/services/auth_service.dart` : `handleAuthUri()` puis
  `applySessionToken()` (récupère le profil via `/me`).

## Revenir au sélecteur de compte natif

Quand le client Android sera de nouveau accepté par la console Google Cloud,
remplacer le `launchUrl(...)` des écrans `login_screen.dart` / `register_screen.dart`
par :

```dart
final google = GoogleSignIn(serverClientId: <client_id_WEB>);
final account = await google.signIn();
final idToken = account.authentication.idToken;   // null → apiClient → /auth/google
```

et renommer l'identifiant `sahasantemali://auth` si un autre schéma est souhaité.

## Connexion par téléphone (code OTP)

Routes ajoutées à `src/server/api-v1.server.ts` :

| Route | Effet |
| --- | --- |
| `POST /api/v1/auth/otp/send` | Envoie un code de 6 chiffres (10 min, 3 essais). |
| `POST /api/v1/auth/otp/verify` | Vérifie le code, **crée le compte au premier code valide** puis ouvre la session. |

Le canal d'envoi est piloté par `OTP_CHANNEL` :

- `twilio` / `whatsapp` → envoi réel (identifiants requis) ;
- `log` → **écrit le code dans les logs du serveur**, refusé en production
  (`otpChannelAvailable()` renvoie `false` → HTTP 503).

Sans canal configuré, l'application affiche « La connexion par téléphone n'est pas
activée. » — c'est le comportement attendu, pas une panne.

## Langues

L'application Flutter embarque quatre langues (`lib/core/l10n/app_locale.dart`) :
français, anglais, arabe (RTL) et bambara. Le choix est persisté (SharedPreferences)
et modifiable depuis l'accueil, la connexion et le profil.

### Deux pièges à connaître

1. **Le bambara n'existe pas dans `flutter_localizations`.** Sans delegate de
   repli, `MaterialLocalizations.of(context)` renvoie `null` et *tout* composant
   Material plante dès que la locale vaut `bm` (feuilles modales, dialogues,
   `SnackBar`…). `lib/app.dart` ajoute donc trois delegates
   (`_FallbackMaterialLocalizations`, `_FallbackWidgetsLocalizations`,
   `_FallbackCupertinoLocalizations`) qui chargent l'anglais pour les locales non
   couvertes, placés **après** les delegates officiels. Les libellés d'interface
   Material (boutons par exemple) restent alors en anglais en bambara — c'est
   normal et sans conséquence.
2. **Un écran déjà monté reste figé dans l'ancienne langue.** Changer la locale
   reconstruit `MaterialApp`, mais pas le contenu des routes déjà créées : le
   routeur (`refreshListenable`) ne suffit pas. Chaque écran doit donc appeler
   `L10n.bind(context);` **au début de son `build()`**, ce qui enregistre la
   dépendance à la locale. `L10n.t()` ne peut pas le faire lui-même : il est
   aussi appelé depuis des callbacks (SnackBar, dialogues), hors phase de build.

> ⚠️ En release, les erreurs d'interface ne s'affichent pas. `lib/main.dart`
> installe un `FlutterError.onError` qui écrit le message et la pile dans logcat
> (filtre `flutter`, marqueurs `ERREUR_FLUTTER:` / `STACK:`) — c'est le moyen le
> plus rapide de diagnostiquer un écran vide sur un téléphone.
