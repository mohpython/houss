import 'package:flutter/material.dart';
import 'package:saha_sante/core/theme/app_colors.dart';

class AppTheme {
  AppTheme._();

  static ThemeData _base(Brightness brightness) {
    final isLight = brightness == Brightness.light;
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: AppColors.background,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: AppColors.primary,
        onPrimary: AppColors.onPrimary,
        // `accent` est un vert soutenu dans les deux themes : le texte pose dessus
        // est blanc, pas `onPrimary` (qui est vert tres sombre en mode clair).
        secondary: AppColors.accent,
        onSecondary: Colors.white,
        surface: AppColors.surface,
        onSurface: AppColors.textPrimary,
        error: AppColors.danger,
        onError: Colors.white,
        outline: AppColors.border,
      ),
      textTheme: TextTheme(
        headlineLarge: TextStyle(
          fontSize: 40,
          fontWeight: FontWeight.bold,
          color: AppColors.textPrimary,
          height: 1.1,
        ),
        headlineMedium: TextStyle(
          fontSize: 32,
          fontWeight: FontWeight.bold,
          color: AppColors.textPrimary,
          height: 1.1,
        ),
        headlineSmall: TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.bold,
          color: AppColors.textPrimary,
        ),
        titleLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: AppColors.textPrimary,
        ),
        titleMedium: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
          color: AppColors.textPrimary,
        ),
        bodyLarge: TextStyle(fontSize: 16, color: AppColors.textSecondary),
        bodyMedium: TextStyle(fontSize: 14, color: AppColors.textSecondary),
        bodySmall: TextStyle(fontSize: 12, color: AppColors.textMuted),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceLight,
        hintStyle: TextStyle(color: AppColors.textMuted),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: AppColors.primary),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          foregroundColor: AppColors.onPrimary,
          backgroundColor: AppColors.primary,
          minimumSize: const Size(double.infinity, 56),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(28),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.textPrimary,
          side: BorderSide(color: AppColors.border),
          minimumSize: const Size(double.infinity, 56),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(28),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: AppColors.surface,
        selectedItemColor: AppColors.primaryDeep,
        unselectedItemColor: AppColors.textMuted,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.primaryDeep,
        contentTextStyle: TextStyle(color: isLight ? Colors.white : AppColors.textPrimary),
      ),
    );
  }

  /// Construit un theme a partir des couleurs **actuelles** d'AppColors.
  ///
  /// [AppColors.light] doit avoir ete positionne avant l'appel (cf. app.dart),
  /// sinon le theme serait construit avec la palette du theme oppose.
  static ThemeData build() =>
      _base(AppColors.light ? Brightness.light : Brightness.dark);

  /// Decorations partagees par les ecrans.
  ///
  /// Ce sont des accesseurs et non des champs `static final` : un champ serait
  /// evalue une seule fois au chargement de la classe et ne suivrait donc pas
  /// un changement de theme. En accesseur, les ~30 `AppTheme.glassCard` deja
  /// presents dans les ecrans n'ont pas besoin d'etre modifies.
  static BoxDecoration get gradientButton => BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: LinearGradient(
          colors: [AppColors.primary, AppColors.primaryDeep],
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
      );

  static BoxDecoration get glassCard => BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.border),
      );

  /// Halo de fond des ecrans. Le decor violet d'origine (0xFF1E1B4B) etait
  /// incoherent avec le vert de la marque : c'est desormais un voile du vert
  /// courant, tres discret en mode sombre.
  static BoxDecoration get subtleGradient => BoxDecoration(
        gradient: RadialGradient(
          colors: [
            AppColors.light
                ? AppColors.primary.withValues(alpha: 0.10)
                : AppColors.primaryDeep.withValues(alpha: 0.35),
            AppColors.background,
          ],
          radius: 1.2,
          center: Alignment.topRight,
        ),
      );
}