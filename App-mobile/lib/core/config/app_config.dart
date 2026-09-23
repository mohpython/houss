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

  /// Frais de livraison (FCFA) — identiques au site.
  static const int deliveryFee = 1000;

  /// Numéros marchands pour le paiement mobile money.
  static const Map<String, String> merchantNumbers = {
    'orange_money': '+223 70 00 00 00',
    'moov_money': '+223 60 00 00 00',
  };
}
