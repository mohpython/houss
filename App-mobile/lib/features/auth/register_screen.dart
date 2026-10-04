import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/l10n/language_picker.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:url_launcher/url_launcher.dart';

/// Inscription : Google uniquement.
///
/// Les comptes sont créés par « Continuer avec Google » (le site web, même
/// flux déjà utilisé pour la connexion). Google vérifie l'adresse e-mail :
/// aucun compte ne peut donc être fabriqué avec une adresse inventée.
///
/// La connexion par e-mail/mot de passe reste disponible sur l'écran de
/// connexion pour les comptes existants (patients, gérants de pharmacie,
/// administrateurs).
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  bool _googleLoading = false;

  /// Création de compte via le site web (Google) — même flux que la connexion.
  Future<void> _signUpWithGoogle() async {
    setState(() => _googleLoading = true);
    try {
      final url = 'https://sahasantemali.com/api/auth/google/?redirect=%2Fapp&mobile=1';
      debugPrint('GSI[WEB] launch $url');
      final ok = await launchUrl(
        Uri.parse(url),
        mode: LaunchMode.inAppBrowserView,
        webOnlyWindowName: '_self',
      );
      debugPrint('GSI[WEB] launch ok=$ok');
    } catch (e) {
      debugPrint('GSI[ERREUR] ${e.runtimeType}: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(L10n.t(context, 'errGoogle')), backgroundColor: Colors.red.shade700),
        );
      }
    } finally {
      if (mounted) setState(() => _googleLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    return Scaffold(
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: CustomScrollView(
              slivers: [
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          IconButton(
                            onPressed: () => context.pop(),
                            icon: const Icon(Icons.arrow_back),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            L10n.t(context, 'brand'),
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                          ),
                          const Spacer(),
                          const LanguageChip(),
                        ],
                      ),
                      const SizedBox(height: 20),
                      Text(
                        L10n.t(context, 'registerTitle'),
                        style: const TextStyle(fontSize: 36, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        L10n.t(context, 'registerSub'),
                        style: TextStyle(fontSize: 15, color: AppColors.textSecondary),
                      ),
                      const SizedBox(height: 24),
                      SizedBox(
                        width: double.infinity,
                        height: 52,
                        child: OutlinedButton.icon(
                          onPressed: _googleLoading ? null : _signUpWithGoogle,
                          style: OutlinedButton.styleFrom(
                            // Fond sombre : `AppColors.textPrimary` est quasi
                            // blanc, un fond blanc rendait le bouton invisible.
                            backgroundColor: AppColors.surfaceLight,
                            foregroundColor: AppColors.textPrimary,
                            side: BorderSide(color: AppColors.border),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(26),
                            ),
                          ),
                          icon: _googleLoading
                              ? const SizedBox(
                                  height: 18,
                                  width: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : Icon(Icons.g_mobiledata, size: 28, color: AppColors.primary),
                          label: Text(
                            L10n.t(context, 'googleBtn'),
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
                          ),
                        ),
                      ),
                      const Spacer(),
                      Center(
                        child: TextButton(
                          onPressed: () => context.go('/login'),
                          child: Text(
                            L10n.t(context, 'alreadyRegistered'),
                            style: TextStyle(
                              fontSize: 14,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}