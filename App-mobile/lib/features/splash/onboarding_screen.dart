import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/l10n/language_picker.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';

/// Première page d'installation (façon WhatsApp) : quelques mots de
/// présentation + « Commencer ». La langue se choisit ici aussi.
class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    return Scaffold(
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Column(
              children: [
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Spacer(),
                    const LanguageChip(),
                  ],
                ),
                const Spacer(flex: 2),
                // Logo officiel SAHA Santé (`assets/branding/logo_mark.png`,
                // fond transparent, bleu/cyan). Il est conçu pour un fond clair
                // — comme l'icône du launcher — d'où la tuile blanche ci-dessous.
                Center(
                  child: Container(
                    width: 136,
                    height: 136,
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(34),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.primary.withAlpha(80),
                          blurRadius: 30,
                          offset: const Offset(0, 12),
                        ),
                      ],
                    ),
                    child: Image.asset(
                      'assets/branding/logo_mark.png',
                      fit: BoxFit.contain,
                      filterQuality: FilterQuality.high,
                    ),
                  ),
                ),
                const SizedBox(height: 28),
                Text(
                  L10n.t(context, 'brand'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 10),
                Text(
                  L10n.t(context, 'tagline'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 14, color: AppColors.accent),
                ),
                const SizedBox(height: 20),
                Text(
                  L10n.t(context, 'hero1'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 27, fontWeight: FontWeight.bold),
                ),
                Text(
                  L10n.t(context, 'hero2'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 27,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primaryLight,
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  L10n.t(context, 'heroDesc'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 15, color: AppColors.textSecondary, height: 1.45),
                ),
                const Spacer(flex: 3),
                Container(
                  width: double.infinity,
                  height: 58,
                  decoration: AppTheme.gradientButton,
                  child: ElevatedButton(
                    onPressed: () => context.go('/login'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.transparent,
                      shadowColor: Colors.transparent,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(29)),
                    ),
                    child: Text(
                      L10n.t(context, 'getStarted'),
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}