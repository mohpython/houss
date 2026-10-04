import 'package:flutter/material.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/theme/app_colors.dart';

/// Sélecteur de langue partagé (onboarding, connexion, profil).
Future<void> showLanguageSheet(BuildContext context) {
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
                '${L10n.t(context, 'language')} — FR / EN / AR / BM',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(height: 12),
            ...SahaLang.values.map((lang) {
              final selected = AppLocale.instance.current == lang;
              return ListTile(
                leading: Text(
                  lang.badge,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: selected ? AppColors.primaryLight : AppColors.textSecondary,
                  ),
                ),
                title: Text(lang.label),
                trailing: selected
                    ? Icon(Icons.check_circle, color: AppColors.primary, size: 22)
                    : null,
                onTap: () {
                  AppLocale.instance.setLang(lang);
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

/// Pastille de langue affichée dans les en-têtes (FR / EN / AR / BM).
class LanguageChip extends StatelessWidget {
  const LanguageChip({super.key});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => showLanguageSheet(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.surfaceLight,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.language, size: 16, color: AppColors.textSecondary),
            const SizedBox(width: 6),
            Text(
              AppLocale.instance.current.badge,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}