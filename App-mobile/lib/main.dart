import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:saha_sante/app.dart';
import 'package:saha_sante/core/services/auth_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Dates et heures en français (DateFormat(..., 'fr_FR')).
  await initializeDateFormatting('fr_FR');
  // Restaure la session enregistrée avant d'afficher le premier écran.
  await AuthService.instance.restore();
  runApp(const SahaSanteApp());
}
