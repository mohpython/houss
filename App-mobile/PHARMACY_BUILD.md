# SAHA Pharmacie — application mobile (Android / iOS)

L'application **SAHA Pharmacie** est une variante de l'application mobile
SAHA. Elle partage le même code, le même identifiant et le même Firebase,
mais ouvre directement l'espace professionnel :

| Onglet | Contenu |
|---|---|
| **Pharmacie** | Commandes reçues (accepter / refuser / prête), inventaire et prix |
| **Notifications** | Fil des notifications du compte |
| **Profil** | Informations du compte, langue, thème, déconnexion |

Les écrans patient (accueil grand public, scan d'ordonnance, suivi de
livraison) ne sont pas affichés.

## Android — APK

```powershell
cd App-mobile
flutter build apk --release --flavor pharmacy --dart-define=APP_VARIANT=pharmacy
```

APK produit :

```
build/app/outputs/flutter-apk/app-pharmacy-release.apk
```

Installation sur le téléphone branché en USB :

```powershell
adb install -r build\app\outputs\flutter-apk\app-pharmacy-release.apk
```

> L'APK pharmacie utilise le **même `applicationId`** que l'APK patient
> (`com.sahasantemali.saha_sante`) afin de conserver Firebase, les
> notifications push et les liens profonds. Conséquence : installer l'un
> remplace l'autre sur le même téléphone. C'est attendu.

## iOS — IPA

Le workflow `.github/workflows/ios-unsigned.yml` construit **les deux** IPA
non signés à chaque push touchant `App-mobile/lib` :

- `SAHA-Sante-unsigned.ipa` (patient)
- `SAHA-Pharmacie-unsigned.ipa` (pharmacie)

Télécharger l'artefact `SAHA-Pharmacie-unsigned-ipa` depuis GitHub Actions,
puis le signer avec Sideloadly et un Apple ID gratuit (7 jours). Voir
`IOS_BUILD.md` pour la procédure complète.

> iOS utilise le même Bundle ID (`com.sahasantemali.sahaSante`) : l'IPA
> pharmacie remplace l'IPA patient sur l'iPhone.

## Compte de démonstration

| Email | Mot de passe | Rôle |
|---|---|---|
| `pharmacie@exemple.com` | `MotDePasse123` | `pharmacy_staff` |

Le compte doit posséder le rôle `pharmacy_staff` (ou `admin`). Un compte
patient qui ouvre l'application voit un message « espace réservé aux
comptes pharmacie » avec un bouton de déconnexion.

## Reconstruire la version patient

```powershell
flutter build apk --release --flavor patient
```

Les deux flavors partagent le même `applicationId` ; seul le nom affiché
change (`SAHA Santé` / `SAHA Pharmacie`).
