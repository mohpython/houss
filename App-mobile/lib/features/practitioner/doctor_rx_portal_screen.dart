import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:saha_sante/core/config/app_config.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/features/spaces/space_widgets.dart';

/// Onglet « e-Ordonnance » de l'app : ouvre le portail médecin du site.
///
/// L'éditeur d'ordonnance complet (signature, QR de vérification, PDF) vit
/// côté web ; l'apk sert de raccourci sécurisé vers cet espace.
class DoctorRxPortalScreen extends StatelessWidget {
  const DoctorRxPortalScreen({super.key});

  static Future<void> openPortal(BuildContext context) async {
    final uri = Uri.parse('${AppConfig.baseUrl}/medecin/app');
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && context.mounted) {
        showSnack(context, L10n.c('erx.openFailed'), error: true);
      }
    } catch (_) {
      if (context.mounted) showSnack(context, L10n.c('erx.openFailed'), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                spaceHeader(
                  L10n.t(context, 'erx.title'),
                  subtitle: L10n.c('erx.subtitle'),
                ),
                const SizedBox(height: 20),
                SpaceCard(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Image.asset(
                        'assets/icons3d/records.png',
                        width: 92,
                        height: 92,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        L10n.c('erx.title'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        L10n.c('erx.subtitle'),
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 13,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 18),
                      actionButton(
                        L10n.c('erx.open'),
                        () => openPortal(context),
                        icon: Icons.open_in_new,
                      ),
                      const SizedBox(height: 14),
                      Text(
                        L10n.c('erx.hint'),
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 11.5,
                          color: AppColors.textMuted,
                        ),
                      ),
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
