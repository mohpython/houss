import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Theme choisi par l'utilisateur (memorise sur l'appareil).
enum SahaThemeMode {
  system('system'),
  light('light'),
  dark('dark');

  const SahaThemeMode(this.code);

  final String code;
}

/// Theme courant de l'application.
///
/// Observe aussi la luminosite du systeme quand le mode est [SahaThemeMode.system] :
/// sans cela, passer le telephone en mode nuit ne rebascule pas l'ecran tant que
/// l'utilisateur n'a pas touche un autre reglage.
class AppThemeMode extends ChangeNotifier with WidgetsBindingObserver {
  AppThemeMode._() {
    WidgetsBinding.instance.addObserver(this);
  }

  static final AppThemeMode instance = AppThemeMode._();
  static const _prefsKey = 'saha.theme';

  SahaThemeMode _mode = SahaThemeMode.system;
  SahaThemeMode get mode => _mode;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_prefsKey);
    _mode = SahaThemeMode.values.firstWhere(
      (m) => m.code == saved,
      orElse: () => SahaThemeMode.system,
    );
    notifyListeners();
  }

  Future<void> setMode(SahaThemeMode mode) async {
    if (_mode == mode) return;
    _mode = mode;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, mode.code);
  }

  @override
  void didChangePlatformBrightness() {
    if (_mode == SahaThemeMode.system) notifyListeners();
  }

  ThemeMode get themeMode => switch (_mode) {
        SahaThemeMode.light => ThemeMode.light,
        SahaThemeMode.dark => ThemeMode.dark,
        SahaThemeMode.system => ThemeMode.system,
      };

  /// Luminosite reellement appliquee. Les couleurs de `AppColors` s'alignent
  /// dessus : c'est la seule source de verite pour les 300+ appels.
  bool get isLight {
    if (_mode == SahaThemeMode.light) return true;
    if (_mode == SahaThemeMode.dark) return false;
    final view = WidgetsBinding.instance.platformDispatcher.views.firstOrNull;
    final brightness = view?.platformDispatcher.platformBrightness ??
        WidgetsBinding.instance.platformDispatcher.platformBrightness;
    return brightness == Brightness.light;
  }
}