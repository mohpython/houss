import 'package:flutter/cupertino.dart' show CupertinoLocalizations;
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/router/app_router.dart';
import 'package:saha_sante/core/theme/app_theme.dart';

/// Repli sur l'anglais pour les langues absentes de `flutter_localizations`
/// (le bambara `bm` en est un) : sans cela `MaterialLocalizations.of()` lève
/// une exception et tout composant Material (feuilles, dialogues…) plante.
class _FallbackMaterialLocalizations extends LocalizationsDelegate<MaterialLocalizations> {
  const _FallbackMaterialLocalizations();

  @override
  bool isSupported(Locale locale) => true;

  @override
  Future<MaterialLocalizations> load(Locale locale) =>
      GlobalMaterialLocalizations.delegate.load(const Locale('en'));

  @override
  bool shouldReload(_FallbackMaterialLocalizations old) => false;
}

class _FallbackWidgetsLocalizations extends LocalizationsDelegate<WidgetsLocalizations> {
  const _FallbackWidgetsLocalizations();

  @override
  bool isSupported(Locale locale) => true;

  @override
  Future<WidgetsLocalizations> load(Locale locale) =>
      GlobalWidgetsLocalizations.delegate.load(const Locale('en'));

  @override
  bool shouldReload(_FallbackWidgetsLocalizations old) => false;
}

class _FallbackCupertinoLocalizations
    extends LocalizationsDelegate<CupertinoLocalizations> {
  const _FallbackCupertinoLocalizations();

  @override
  bool isSupported(Locale locale) => true;

  @override
  Future<CupertinoLocalizations> load(Locale locale) =>
      GlobalCupertinoLocalizations.delegate.load(const Locale('en'));

  @override
  bool shouldReload(_FallbackCupertinoLocalizations old) => false;
}

class SahaSanteApp extends StatelessWidget {
  const SahaSanteApp({super.key});

  @override
  Widget build(BuildContext context) {
    // L'ensemble de l'arbre est reconstruit quand la langue change
    // (le sélecteur de langue est disponible partout).
    return ListenableBuilder(
      listenable: AppLocale.instance,
      builder: (context, _) {
        return MaterialApp.router(
          title: 'SAHA Santé',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.darkTheme,
          locale: AppLocale.instance.locale,
          supportedLocales: const [
            Locale('fr', 'FR'),
            Locale('en'),
            Locale('ar'),
            Locale('bm'),
          ],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
            // Doit rester APRÈS les delegates officiels (il ne les remplace
            // que pour les locales qu'ils ne prennent pas en charge).
            _FallbackMaterialLocalizations(),
            _FallbackWidgetsLocalizations(),
            _FallbackCupertinoLocalizations(),
          ],
          routerConfig: AppRouter.router,
        );
      },
    );
  }
}