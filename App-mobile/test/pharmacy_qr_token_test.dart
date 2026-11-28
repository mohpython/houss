import 'package:flutter_test/flutter_test.dart';
import 'package:saha_sante/features/pharmacy/pharmacy_qr_token.dart';

void main() {
  const token = 'eyJhbGciOiJIUzI1NiJ9.abc_DEF-123';

  group('extractSahaQrToken', () {
    test('extrait le jeton d une URL de verification', () {
      expect(
        extractSahaQrToken(
          'https://sahasantemali.com/medecin/verifier/$token',
        ),
        token,
      );
    });

    test('accepte un jeton brut avec espaces peripheriques', () {
      expect(extractSahaQrToken('  $token\n'), token);
    });

    test('ignore la query string', () {
      expect(
        extractSahaQrToken(
          'https://sahasantemali.com/medecin/verifier/$token?source=qr',
        ),
        token,
      );
    });

    test('rejette une entre vide ou une URL sans le chemin attendu', () {
      expect(extractSahaQrToken('   '), isNull);
      expect(
        extractSahaQrToken('https://sahasantemali.com/autre/$token'),
        isNull,
      );
    });

    test('rejette un jeton trop long ou trop court', () {
      expect(extractSahaQrToken('a' * 121), isNull);
      expect(extractSahaQrToken('short'), isNull);
    });
  });
}
