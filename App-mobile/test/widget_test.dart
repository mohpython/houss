import 'package:flutter_test/flutter_test.dart';
import 'package:saha_sante/app.dart';

void main() {
  testWidgets('App renders onboarding', (WidgetTester tester) async {
    await tester.pumpWidget(const SahaSanteApp());
    expect(find.text('SAHA Santé'), findsOneWidget);
  });
}
