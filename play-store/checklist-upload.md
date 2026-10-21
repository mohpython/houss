# Checklist publication Play Store — SAHA Santé

> Les livrables sont dans `houss\play-store\` :
> - `saha-sante-1.0.0.aab` → le fichier à téléverser
> - `fiche-play-fr.md` / `fiche-play-en.md` → textes prêts à coller
> - `assets\icon-512x512.png` / `assets\feature-graphic-1024x500.jpg` → visuels

---

## 1. Créer l'app dans la Play Console

1. Aller sur **play.google.com/console** (compte développeur déjà actif).
2. **Créer une application** :
   - Nom : `SAHA Santé`
   - Langue par défaut : français
   - Type d'application : Application
   - **Gratuite** (pas de prix)
   - Déclaration : « Application gratuite à télécharger » → **Oui**
3. Accepter le contrat de distribution (section "Politiques" → "Contrat de distribution pour développeurs" → Accepter).

---

## 2. Play App Signing (signature de l'app)

1. Menu **Configurer l'application** → **Signature de l'application**.
2. Adhérer à **Play App Signing** (obligatoire pour les nouvelles apps) :
   - Choisir « **Téléverser une clé de téléversement** » (upload key).
   - Téléverser le certificat de la clé de téléversement : `assets\upload_certificate.pem`
     (généré depuis notre keystore — c'est le certificat **public**, sans secret, fourni ici).
   - Google génère lui-même la clé de **signature** de l'app (App Signing Key). Nous gardons
     précieusement `saha-upload.jks` + son mot de passe (clé de téléversement, jamais partagée).
3. Après l'upload, Play Console affiche le **SHA-1 de la clé Play App Signing**
   (Configurer → Signature de l'application) → à ajouter dans Firebase (§4).

---

## 3. Téléverser la version (AAB)

1. Menu **Version** → **Pistes de test** → **Test interne** (ou Production directement).
2. **Créer une nouvelle version** → **Téléverser un fichier** → choisir `saha-sante-1.0.0.aab`.
3. Notes de version (what's new) : copier depuis la fiche.
4. Sauvegarder + **Lancer le contrôle des versions** → corriger les avertissements éventuels (il peut demander des déclarations – voir §5, §6).
5. Mettre la version en **test interne** d'abord (testeurs requis : 1–2 emails), vérifier l'installation sur le téléphone Samsung, puis **Promouvoir en production**.

---

## 4. Firebase — Google Sign-In (CRITIQUE)

La connexion Google de l'app Android vérifie le SHA-1 du certificat de signature. Deux SHA-1 à enregistrer :

1. **Clé de téléversement** (la nôtre) — utile pour les tests avec notre APK signé :
   - `28:9E:B9:D9:DE:12:91:7A:24:3C:6F:78:9E:59:54:D6:BB:C1:12:EF`
2. **Clé Play App Signing** (celle de Google, visible dans Play Console après upload §2) :
   - à copier depuis Play Console → Configurer → Signature de l'application → SHA-1

Ajout dans Firebase :
- console.firebase.google.com → projet SAHA Santé (project `991636499809`) → **Paramètres du projet** → **Vos applications** → app Android `com.sahasantemali.saha_sante` → **Ajouter une empreinte** → coller le SHA-1 → Enregistrer.

> ⚠️ Sans ça, « Se connecter avec Google » échoue dans la version publiée.

---

## 5. Fiche Play Store

Coller depuis `fiche-play-fr.md` / `fiche-play-en.md` :
- Nom, titre court, description courte, description complète, what's new
- **Icône** : `assets/icon-512x512.png`
- **Feature graphic** : `assets/feature-graphic-1024x500.jpg`
- **Captures d'écran** : 2 à 8, écran téléphone.
  - À prendre sur le Samsung connecté (adb) — vérifier d'utiliser un compte de démo, **pas de vraies ordonnances de patients**.
- Catégorie : **Médical**
- Email de contact : **à compléter**
- Politique de confidentialité : `https://sahasantemali.com/privacy` (déjà en ligne ✓)

---

## 6. Déclarations

### Data safety (Sécurité des données) — menu « Données des utilisateurs »
| Donnée | Collectée ? | But |
|---|---|---|
| Santé et forme (prescriptions/médicaments) | Oui (à l'exécution) | Fonctionnalité principale |
| Photos / fichiers (ordonnance, PDF) | Oui (à l'exécution) | Fonctionnalité principale |
| Localisation (approximative / précise) | Oui (à l'exécution) | Pharmacie la plus proche + livraison |
| Informations de compte (nom, email, téléphone) | Oui | Compte utilisateur |
| Notifications push | Non collectées (transport) | Suivi de commande |
| Vente à des tiers | **Non** | — |
| Publicités | **Non** | — |

### Content rating (classement PEGI)
- Répondre au questionnaire (thème santé → pas de contenu sensible). Résultat attendu : **PEGI 3 / tous publics**.

### App access
- Tout est accessible sans authentification → « Accès complet ».

### Cibles et audiences
- Audience générale ; app santé → vérifier les réponses désirées (pas pour mineurs ciblés).

---

## 7. Vérifications finales avant production

- [ ] Google Sign-In testé dans la version du test interne
- [ ] Livraison/commande testées (pas uniquement la page d'accueil)
- [x] FAB WhatsApp : numéro configuré (**+223 71 25 77 60**) dans l'APK, le site et l'AAB — le bouton est visible.
- [ ] Version 1.0.0 (versionCode 1) → les futures mises à jour doivent incrémenter le versionCode (pubspec `version:`)

---

## Rappels sécurité

- 🔐 **Ne jamais partager/publicr** : `android/app/saha-upload.jks` ni `android/key.properties` (mot de passe de la clé de téléversement).
- 🔐 Garder le mot de passe de la clé dans un gestionnaire de mots de passe — toute mise à jour future de l'app en dépend.
- 📦 Pour une mise à jour : `flutter build appbundle --release` (signe automatiquement) → uploader le nouvel AAB avec versionCode +1.