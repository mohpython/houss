import 'package:flutter/material.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme_mode.dart';

/// Sélecteur de thème partagé (profil).
///
/// Même forme que [showLanguageSheet] pour que les deux réglages se tiennent
/// de la même façon dans l'écran profil.
Future<void> showThemeSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (sheetContext) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(
                L10n.t(context, 'theme'),
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(height: 12),
            ...SahaThemeMode.values.map((mode) {
              final selected = AppThemeMode.instance.mode == mode;
              return ListTile(
                leading: Icon(
                  switch (mode) {
                    SahaThemeMode.system => Icons.brightness_auto,
                    SahaThemeMode.light => Icons.light_mode,
                    SahaThemeMode.dark => Icons.dark_mode,
                  },
                  color: selected ? AppColors.primary : AppColors.textSecondary,
                ),
                title: Text(L10n.t(context, 'theme.${mode.code}')),
                trailing: selected
                    ? Icon(Icons.check_circle, color: AppColors.primary, size: 22)
                    : null,
                onTap: () {
                  AppThemeMode.instance.setMode(mode);
                  Navigator.of(sheetContext).pop();
                },
              );
            }),
          ],
        ),
      ),
    ),
  );
}

/// Libellé court du thème courant, pour la tuile du profil.
String themeLabel() => switch (AppThemeMode.instance.mode) {
      SahaThemeMode.system => 'auto',
      SahaThemeMode.light => 'clair',
      SahaThemeMode.dark => 'sombre',
    };