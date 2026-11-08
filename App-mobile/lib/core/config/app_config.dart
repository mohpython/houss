/// Configuration de l'application mobile.
///
/// L'URL du serveur peut être changée au moment de la compilation :
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
///   flutter build apk --dart-define=API_BASE_URL=https://sahasantemali.com
///
/// (10.0.2.2 = « localhost » de la machine, vu depuis l'émulateur Android.)
class AppConfig {
  AppConfig._();

  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://sahasantemali.com',
  );

  static String get apiUrl => '$baseUrl/api/v1';

  /// Variante compilée de l'application :
  ///   - `patient`  (défaut) : application grand public SAHA Santé ;
  ///   - `pharmacy`          : application dédiée aux pharmacies.
  ///
  ///   flutter build apk --flavor pharmacy --dart-define=APP_VARIANT=pharmacy
  static const String variant = String.fromEnvironment(
    'APP_VARIANT',
    defaultValue: 'patient',
  );

  /// true dans la version « SAHA Pharmacie ».
  static bool get isPharmacy => variant == 'pharmacy';

  /// Nom affiché dans l'application. Le nom du lanceur Android est défini
  /// par le flavor (`@string/app_name`) et celui d'iOS par Info.plist.
  static String get appName => isPharmacy ? 'SAHA Pharmacie' : 'SAHA Santé';

  /// Frais de livraison (FCFA) — identiques au site.
  static const int deliveryFee = 1000;

  /// Numéro WhatsApp officiel du bot SAHA Santé, format international sans « + ».
  /// Vide = bouton flottant WhatsApp masqué (même comportement que le site).
  static const String whatsappNumber = '22371257760';

  /// Lien `wa.me` avec le message d'accueil pré-rempli (vide si non configuré).
  static String waMeUrl(String text) {
    final n = whatsappNumber.replaceAll(RegExp(r'\D'), '');
    if (n.isEmpty) return '';
    return 'https://wa.me/$n?text=${Uri.encodeComponent(text)}';
  }

  /// Numéros marchands pour le paiement mobile money.
  static const Map<String, String> merchantNumbers = {
    'orange_money': '+223 70 00 00 00',
    'moov_money': '+223 60 00 00 00',
  };
}
