# SAHA Santé — application mobile (Flutter)

Application patient pour Android et iOS : scan d'ordonnance, commande en
pharmacie, suivi de livraison, rendez-vous médicaux.

Elle est branchée sur le backend du site (`prescription-pal-main`) via l'API
REST `"/api/v1"` : mêmes comptes, mêmes données, mêmes règles.

## Configuration du serveur

L'adresse du serveur est fixée à la compilation :

```bash
# Production (valeur par défaut)
flutter run

# Émulateur Android vers un serveur lancé sur votre Mac/PC
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000

# Téléphone réel sur le même Wi-Fi
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:3000
```

La valeur par défaut (`https://sahasantemali.com`) est définie dans
`lib/core/config/app_config.dart`.

## Démarrage

```bash
flutter pub get
flutter run
```

Connexion : email et mot de passe (les mêmes que sur le site). La connexion par
SMS et Google arrivera ensuite ; le serveur les gère déjà.

## Structure

```
lib/core/config/      adresse du serveur et constantes
lib/core/api/         client HTTP (jeton, erreurs en français)
lib/core/services/    auth_service (session), api_service (toutes les requêtes), location_service (GPS)
lib/core/models/      modèles + lecture du JSON de l'API
lib/core/router/      navigation go_router (redirection si non connecté)
lib/features/         écrans
assets/branding/      logo, icône et écran de démarrage
```

## Icône et écran de démarrage

Les deux sont générés à partir de `assets/branding/` :

```bash
dart run flutter_launcher_icons        # icône Android + iOS
dart run flutter_native_splash:create  # écran de démarrage
```

Pour changer le visuel, remplacez `assets/branding/icon.png` (1024×1024),
`icon_foreground.png` (Android, zone de sécurité) et `splash.png`, puis
relancez ces deux commandes.

## Tests

```bash
# Démarrer d'abord le serveur (voir prescription-pal-main/README.md)
flutter test --dart-define=API_BASE_URL=http://127.0.0.1:3100
```

`test/api_integration_test.dart` vérifie l'inscription, la connexion, le
catalogue, une commande complète, le triage IA et la déconnexion. Si aucun
serveur n'est joignable, les tests s'ignorent d'eux-mêmes.

## Publication

Voir `../prescription-pal-main/MOBILE_ANDROID.md` pour la signature et la
publication sur le Play Store (ce document décrit l'emballage Capacitor du
site ; pour cette application Flutter, les étapes clé de signature et de
publication sont les mêmes).
