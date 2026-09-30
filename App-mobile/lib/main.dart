import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:saha_sante/app.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/services/auth_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // En production, les erreurs d'interface ne s'affichent pas : on les écrit
  // dans logcat (tag `flutter`) pour rester diagnosticable sur un téléphone.
  final defaultOnError = FlutterError.onError;
  FlutterError.onError = (FlutterErrorDetails details) {
    defaultOnError?.call(details);
    debugPrint('ERREUR_FLUTTER: ${details.exception}');
    debugPrint('STACK: ${details.stack}');
  };

  // Dates et heures en français (DateFormat(..., 'fr_FR')).
  await initializeDateFormatting('fr_FR');
  // Restaure la langue choisie.
  await AppLocale.instance.load();

  // Lien profond OAuth Google : l'app peut être lancée directement par
  // `sahasantemali://auth?access_token=…` (retour du navigateur web).
  final appLinks = AppLinks();
  final initial = await appLinks.getInitialLink();
  if (initial == null || !await AuthService.instance.handleAuthUri(initial)) {
    // Restaure la session enregistrée avant d'afficher le premier écran.
    await AuthService.instance.restore();
  }
  // Pendant que l'app tourne : le navire web renvoie aussi des liens profonds.
  appLinks.uriLinkStream.listen((uri) {
    AuthService.instance.handleAuthUri(uri);
  });

  runApp(const SahaSanteApp());
}