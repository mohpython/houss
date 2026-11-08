# SAHA Santé — version iOS (IPA)

> **À lire d'abord.** Un **APK** est un paquet Android : il ne peut pas être
> installé sur un iPhone. L'équivalent iOS est un **IPA**. Il se compile sur
> macOS (Xcode) ou dans le cloud, puis se signe avec un compte Apple.
>
> **Deux chemins possibles :**
>
> | | Gratuit (Apple ID simple) | Payant (99 $/an) |
> |---|---|---|
> | Compilation | GitHub Actions (macOS cloud) | GitHub Actions ou Codemagic |
> | Installation | Sideloadly sur Windows | TestFlight / App Store |
> | Durée | 7 jours (à re-signer) | 1 an |
> | Notifications push | ❌ | ✅ |
> | App Store | ❌ | ✅ |
> | Mac nécessaire | Non | Non |
>
> Le projet est déjà préparé pour les deux. Le chemin gratuit est décrit
> ci-dessous ; il permet d'avoir l'app sur un iPhone **aujourd'hui**, sans Mac
> et sans compte payant.

## 1. Identifiants du projet

| Élément | Valeur |
|---|---|
| Bundle ID iOS | `com.sahasantemali.sahaSante` |
| Équipe de signature configurée | `678P8T7FGZ` |
| Version | `1.0.1+2` (définie dans `pubspec.yaml`) |
| Nom affiché | SAHA Santé |
| Icône / splash iOS | Déjà générés dans `ios/Runner/Assets.xcassets` |

⚠️ Le Bundle ID iOS (`com.sahasantemali.sahaSante`) est **différent** du
Bundle ID Android (`com.sahasantemali.saha_sante`). C'est normal, mais
l'application iOS créée dans Firebase doit utiliser **exactement**
`com.sahasantemali.sahaSante`.

## 2. Ce qui est déjà configuré

- [x] Projet Xcode (`ios/Runner.xcworkspace`)
- [x] Icône et écran de démarrage iOS
- [x] Autorisations caméra, photos, localisation (`Info.plist`)
- [x] Lien profond `sahasantemali://auth` (retour de la connexion Google)
- [x] Notifications push : entitlement `Runner.entitlements`, mode
      arrière-plan `remote-notification`, delegate iOS dans `AppDelegate`
- [x] Service Flutter : notifications locales iOS (`Darwin`) et enregistrement
      du jeton avec `platform: "ios"`
- [x] Google Maps : clé lue depuis `GMSApiKey` dans `Info.plist`
- [x] Podfile : plateforme iOS 15.0 (exigée par Firebase 4.15)
- [x] Workflow GitHub Actions : `.github/workflows/ios-unsigned.yml`

## 3. Chemin gratuit — sans Mac, avec un Apple ID simple

### 3.1 Construire l'IPA non signé (GitHub Actions)

Le dépôt `mohpython/houss` est public : les runners macOS de GitHub Actions
sont **gratuits**. Le workflow compile **deux** IPA non signés (patient et
pharmacie) et les publie séparément.

1. Le workflow se lance automatiquement à chaque push sur `main` qui touche
   `App-mobile/ios`, `lib`, `assets` ou `pubspec`. Sinon : GitHub →
   **Actions** → **iOS IPA (non signé, Sideloadly)** → **Run workflow**.
2. Attendre la fin des jobs (10–20 min la première fois : CocoaPods télécharge
   Firebase).
3. En bas du résumé du run, télécharger l'artefact voulu :
   - **`SAHA-Sante-unsigned-ipa`** (application patient) ;
   - **`SAHA-Pharmacie-unsigned-ipa`** (espace pharmacie).
4. Dézipper : on obtient **`SAHA-Sante-unsigned.ipa`** ou
   **`SAHA-Pharmacie-unsigned.ipa`**.

> L'IPA non signé ne s'installe pas directement : c'est normal. Il doit être
> signé par Sideloadly avec l'Apple ID de l'iPhone.

### 3.2 Installer sur l'iPhone avec Sideloadly (Windows)

**Préparation (une seule fois) :**

1. Désinstaller iTunes et iCloud s'ils viennent du **Microsoft Store**
   (versions sandboxées, incompatibles).
2. Installer **iTunes** et **iCloud** depuis <https://www.apple.com/itunes/> et
   <https://www.apple.com/icloud/> (versions web).
3. Télécharger **Sideloadly** sur <https://sideloadly.io> et l'installer.
4. Brancher l'iPhone en USB, le déverrouiller, puis **Faire confiance** à
   l'ordinateur.

**Installation :**

1. Ouvrir Sideloadly : l'iPhone doit apparaître dans **iDevice**.
2. Glisser `SAHA-Sante-unsigned.ipa` dans la zone **IPA**.
3. Saisir l'**Apple ID** (un identifiant gratuit suffit ; un compte dédié est
   préférable).
4. Cliquer **Start**, saisir le mot de passe puis le code de double
   authentification (2FA).
5. Sur l'iPhone : **Réglages → Général → VPN et gestion de l'appareil** →
   sélectionner l'Apple ID → **Faire confiance**.
6. iOS 16 et plus : **Réglages → Confidentialité et sécurité → Mode
   développeur** → activer → redémarrer l'iPhone.

**Limites de l'Apple ID gratuit (règles Apple, pas de l'app) :**

- l'app expire après **7 jours** : rebrancher l'iPhone et relancer Sideloadly
  avec le même IPA et le même Apple ID ;
- **3 apps** sideloadées maximum sur l'iPhone ;
- **10 App IDs** maximum par période de 7 jours ;
- **pas de notifications push**, pas d'achats intégrés, pas de TestFlight ni
  d'App Store ;
- si Sideloadly signale que le Bundle ID est déjà pris : **Advanced Options**
  → **Change Bundle ID** (par exemple `com.sahasantemali.sahaSante2`).

### 3.3 Ce qui fonctionne quand même

L'app démarre sans Firebase iOS (le code est protégé) :

- connexion, scan d'ordonnance, commande, suivi, rendez-vous ;
- caméra, photos, GPS ;
- paiement Orange Money via le navigateur ;
- carte Google : uniquement dans l'espace admin (clé iOS dédiée
  recommandée, voir § 6).

Seules les **notifications push iOS** restent inactives. Elles nécessitent un
compte Apple Developer payant, une clé APNs et le fichier Firebase iOS.

## 4. Chemin payant — TestFlight et App Store

Prérequis : **Apple Developer Program** (99 $/an). Aucun Mac n'est nécessaire
si vous utilisez GitHub Actions ou Codemagic.

1. Créer l'application iOS dans Firebase avec le Bundle ID
   `com.sahasantemali.sahaSante` et télécharger `GoogleService-Info.plist`
   (section 5).
2. Créer une clé APNs `.p8` et l'importer dans Firebase → Cloud Messaging
   (section 5.2).
3. Créer l'app dans **App Store Connect** avec le même Bundle ID.
4. Ajouter l'intégration App Store Connect dans Codemagic (ou utiliser
   Xcode sur un Mac) et lancer `codemagic.yaml` → workflow **SAHA Santé iOS**.
5. L'IPA signé part vers **TestFlight** ; inviter les testeurs.
6. Publier sur l'App Store après validation.

Alternative cloud : **Mac loué à l'heure** (MacinCloud, MacStadium, Scaleway
Mac), puis suivre la section 7.

## 5. Firebase iOS et notifications push

### 5.1 `GoogleService-Info.plist`

1. <https://console.firebase.google.com> → projet **sahasante**.
2. Paramètres du projet → **Ajouter une application** → **iOS**.
3. Bundle ID : `com.sahasantemali.sahaSante`.
4. Télécharger `GoogleService-Info.plist`.
5. Dans Xcode : glisser le fichier dans le dossier **Runner** (pas à la racine
   du projet), cocher **Copy items if needed** et la cible **Runner**.
6. Vérifier que le fichier apparaît dans **Build Phases → Copy Bundle
   Resources** (ou dans le groupe Runner).

Sans ce fichier, l'app démarre mais **aucune notification push iOS** ne
fonctionne (le code Firebase est volontairement protégé).

### 5.2 Clé APNs `.p8`

1. <https://developer.apple.com/account> → **Certificates, Identifiers &
   Profiles** → **Keys** → créer une clé **Apple Push Notifications service
   (APNs)**.
2. Télécharger le fichier `.p8` (une seule fois), noter le **Key ID** et le
   **Team ID** (`678P8T7FGZ` si c'est votre équipe).
3. Firebase Console → **Paramètres du projet** → **Cloud Messaging** →
   application iOS → **Apple app configuration** → importer la clé `.p8`
   avec le Key ID et le Team ID.

Sans cette clé, Firebase accepte les jetons iOS mais **ne peut pas délivrer
les notifications** à l'iPhone.

## 6. Google Maps iOS — clé API

1. <https://console.cloud.google.com> → projet **sahasante** → APIs et
   services → Bibliothèque → activer **Maps SDK for iOS**.
2. Identifiants → Créer une clé API → restreindre à **Maps SDK for iOS** et
   au Bundle ID `com.sahasantemali.sahaSante`.
3. Remplacer la valeur de `GMSApiKey` dans `ios/Runner/Info.plist` par cette
   clé.

La clé actuellement présente est celle d'Android ; elle peut être refusée par
iOS. La carte Google n'est utilisée que dans l'espace admin, mais une clé iOS
valide est nécessaire pour éviter un écran vide/crash.

## 7. Compiler sur un Mac (méthode classique)

Prérequis : macOS 13+, Xcode 15+, CocoaPods, Flutter 3.47.5. L'app cible
**iOS 15.0 minimum** (iPhone 6s et plus récents).

```bash
cd "App-mobile"

# 1. Dépendances Flutter
flutter pub get

# 2. Dépendances iOS
cd ios
pod install
cd ..

# 3. Ouvrir Xcode
open ios/Runner.xcworkspace
```

Dans Xcode :

1. Sélectionner le projet **Runner** → cible **Runner**.
2. Onglet **Signing & Capabilities** :
   - Team : sélectionner votre équipe (ou `678P8T7FGZ`) ;
   - vérifier le Bundle Identifier `com.sahasantemali.sahaSante` ;
   - ajouter **Push Notifications** ;
   - ajouter **Background Modes** → cocher **Remote notifications**.
3. Vérifier que `GoogleService-Info.plist` est bien dans la cible Runner.
4. Brancher l'iPhone (ou choisir un simulateur) et lancer **Run** pour tester.

Pour produire l'IPA :

```bash
flutter build ipa --release
```

Le fichier est généré dans :

```
build/ios/ipa/*.ipa
```

### Publication TestFlight / App Store

1. Créer l'application dans **App Store Connect** avec le Bundle ID
   `com.sahasantemali.sahaSante`.
2. Dans Xcode : **Product → Archive**, puis **Distribute App → App Store
   Connect**.
3. Ou envoyer l'IPA avec **Transporter**.
4. Attendre le traitement, puis inviter les testeurs via **TestFlight**.

## 8. Compiler sans Mac — Codemagic (compte payant)

Le fichier `codemagic.yaml` est fourni à la racine de `App-mobile`. Il faut :

1. Un dépôt GitHub / GitLab / Bitbucket (déjà : `mohpython/houss`).
2. Un compte sur <https://codemagic.io> connecté au dépôt.
3. Dans Codemagic → **Teams → Integrations** : ajouter l'intégration
   **App Store Connect** (clé API Apple) ou un certificat de distribution +
   profil de provisionnement.
4. Lancer le workflow **SAHA Santé iOS**.
5. Récupérer l'IPA dans les artefacts, ou laisser Codemagic l'envoyer à
   TestFlight.

## 9. Test immédiat sans installation

En attendant l'IPA, le site <https://sahasantemali.com> fonctionne dans Safari
sur iPhone. **Partager → Sur l'écran d'accueil** crée une icône comme une app,
sans passer par l'App Store. C'est utile pour montrer le service, mais ce
n'est pas l'application native (pas de scan caméra natif ni de push).

## 10. Après le build — checklist App Store

- [ ] Politique de confidentialité accessible (obligatoire, données de santé)
- [ ] URL d'assistance
- [ ] Captures d'écran iPhone 6,9" (obligatoire) et 6,5"
- [ ] Icône 1024×1024 sans transparence (déjà générée)
- [ ] Description, mots-clés, catégorie (Medical / Health & Fitness)
- [ ] Déclaration **App Privacy** : données de santé, localisation, identifiants
- [ ] Suppression de compte dans l'app (obligatoire pour les apps avec compte)
- [ ] Mention « ne remplace pas une consultation médicale » si applicable
- [ ] Tester sur un iPhone réel : caméra, photos, GPS, notifications, paiement

## 11. Dépannage

| Erreur | Cause / solution |
|---|---|
| `No such module 'FirebaseCore'` | `pod install` pas lancé, ou `GoogleService-Info.plist` absent |
| `No such module 'GoogleMaps'` | `pod install` pas lancé |
| `Signing for "Runner" requires a development team` | Choisir l'équipe dans Xcode |
| `Provisioning profile doesn't include aps-environment` | Activer Push Notifications dans le compte Apple / le profil |
| Notifications iOS muettes | Vérifier l'entitlement, le fichier Firebase iOS et l'autorisation dans Réglages |
| Carte Google vide | Clé `GMSApiKey` absente ou non autorisée pour iOS |
| `Building for iOS is only supported on macOS` | Normal sous Windows : utiliser GitHub Actions ou un Mac |
| Sideloadly ne voit pas l'iPhone | iTunes/iCloud version web (pas Microsoft Store), câble USB, « Faire confiance » |
| « Untrusted Developer » | Réglages → Général → VPN et gestion de l'appareil → Faire confiance |
| L'app expire après 7 jours | Limite Apple ID gratuit : re-signer avec Sideloadly |
| « Unable to install » dans Sideloadly | Activer le mode développeur (iOS 16+), vérifier la version d'iOS (15+) |
| Bundle ID déjà utilisé | Sideloadly → Advanced Options → Change Bundle ID |

## 12. Commandes utiles

```bash
flutter doctor -v
flutter devices
flutter build ios --release --no-codesign   # vérification sans signature (Mac)
flutter build ipa --release                 # IPA signé (Mac + compte Apple)
```

## 13. État actuel

- Projet iOS : **prêt côté code et configuration**
- Build cloud gratuit : **workflow GitHub Actions prêt**
- Installation gratuite : **Sideloadly** (Apple ID simple, 7 jours)
- Firebase iOS : **fichier à télécharger** (nécessaire aux push)
- Clé APNs : **à créer** (nécessaire aux push)
- Google Maps iOS : **clé à créer** (carte admin uniquement)
- Signature payante : **Apple Developer Program 99 $/an** pour TestFlight,
  App Store et push
- IPA : **généré dans le cloud**, puis signé localement avec Sideloadly
