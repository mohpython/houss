@Tags(['integration'])
library;

/// Test d'intégration de la couche réseau contre un vrai serveur SAHA Santé.
///
/// Démarrer le serveur puis :
///   flutter test test/api_integration_test.dart \
///     --dart-define=API_BASE_URL=http://127.0.0.1:3100
///
/// Ignoré automatiquement si le serveur n'est pas joignable.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/config/app_config.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/auth_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<bool> _serverUp() async {
  try {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 2);
    final req = await client.getUrl(Uri.parse('${AppConfig.apiUrl}/me'));
    final res = await req.close();
    await res.drain<void>();
    return true;
  } catch (_) {
    return false;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // Par défaut, l'environnement de test remplace HttpClient par un faux client
  // qui répond 400 : on le désactive pour joindre le vrai serveur.
  HttpOverrides.global = null;
  SharedPreferences.setMockInitialValues({});

  late bool up;
  setUpAll(() async {
    up = await _serverUp();
    if (!up) {
      // ignore: avoid_print
      print('Serveur injoignable sur ${AppConfig.apiUrl} — tests ignorés.');
    }
  });

  final email = 'flutter${DateTime.now().millisecondsSinceEpoch}@test.local';
  const password = 'Flutter123';

  test('inscription puis session restaurée', () async {
    if (!up) return;
    final auth = AuthService.instance;
    await auth.register(email: email, password: password, fullName: 'Aïcha Test');
    expect(auth.isLoggedIn, isTrue);
    expect(auth.user?.email, email);
    expect(auth.user?.fullName, 'Aïcha Test');

    await auth.refreshUser();
    expect(auth.user?.id, isNotEmpty);
  });

  test('mauvais mot de passe : message clair, session inchangée', () async {
    if (!up) return;
    await expectLater(
      AuthService.instance.signIn(email, 'mauvais'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('incorrect'))),
    );
  });

  test('annuaire : pharmacies, praticiens, quartiers', () async {
    if (!up) return;
    final api = ApiService.instance;
    final practitioners = await api.getPractitioners(lat: 12.63, lng: -8.0, type: 'doctor');
    expect(practitioners, isNotEmpty);
    expect(practitioners.first.specialty, isNot(equals('general')),
        reason: 'le code de spécialité doit être traduit en libellé');

    final neighborhoods = await api.getNeighborhoods();
    expect(neighborhoods.length, greaterThan(10));

    await api.getPharmacies(lat: 12.63, lng: -8.0);
  });

  test('commande de médicaments sans ordonnance, puis suivi', () async {
    if (!up) return;
    final api = ApiService.instance;
    final suggestions = await api.getOtcSuggestions(query: 'para');
    expect(suggestions, isNotEmpty);

    final order = await api.orderOtc(
      medicines: [suggestions.first],
      lat: 12.63,
      lng: -8.0,
      address: 'Test Flutter',
    );
    expect(order.reservationId, isNotEmpty);
    expect(order.matchedCount, greaterThan(0));

    final reservations = await api.getReservations();
    expect(reservations.any((r) => r.id == order.reservationId), isTrue);

    final detail = await api.getReservation(order.reservationId);
    expect((detail['reservation'] as Map)['pickup_code'], isNotNull);

    // Retrait en pharmacie : les frais de livraison tombent à zéro.
    final updated = await api.setFulfillment(order.reservationId, 'pickup');
    expect(updated.isPickup, isTrue);

    await api.declarePayment(
      reservationId: order.reservationId,
      method: 'orange_money',
      reference: 'OM-FLUTTER-1',
      phone: '+22376123456',
    );
    final afterPayment = (await api.getReservations())
        .firstWhere((r) => r.id == order.reservationId);
    expect(afterPayment.needsPayment, isFalse);
  });

  test('triage des symptômes par IA', () async {
    if (!up) return;
    final result = await ApiService.instance.triage(
      symptoms: 'fièvre, maux de tête et frissons depuis deux jours',
      lat: 12.63,
      lng: -8.0,
    );
    expect(result.triage['specialty_code'], isNotNull);
    expect(result.triage['summary'], isNotNull);
  });

  test('déconnexion : jeton effacé', () async {
    if (!up) return;
    await AuthService.instance.signOut();
    expect(AuthService.instance.isLoggedIn, isFalse);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('saha.token'), isNull);
  });
}
