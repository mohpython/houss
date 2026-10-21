import 'package:flutter/material.dart';
import 'package:saha_sante/core/config/app_config.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:url_launcher/url_launcher.dart';

/// Bouton flottant WhatsApp — ouvre la conversation avec le bot SAHA Santé,
/// message d'accueil pré-rempli dans la langue de l'application.
///
/// Si WhatsApp n'est pas installé sur le téléphone, un dialogue propose de
/// l'installer (Play Store) ou d'appeler directement le numéro SAHA.
///
/// Masqué quand le numéro WhatsApp n'est pas configuré (comme sur le site).
class WhatsAppFab extends StatelessWidget {
  const WhatsAppFab({super.key});

  /// Numéro de contact sans caractères non chiffrés.
  static String _digits() =>
      AppConfig.whatsappNumber.replaceAll(RegExp(r'\D'), '');

  /// Affichage lisible : +223 71 25 77 60.
  static String _formatted(String n) {
    if (n.length >= 11) {
      return '+${n.substring(0, 3)} ${n.substring(3, 5)} '
          '${n.substring(5, 7)} ${n.substring(7, 9)} ${n.substring(9)}';
    }
    return '+$n';
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    if (AppConfig.whatsappNumber.trim().isEmpty) return const SizedBox.shrink();

    return Semantics(
      label: L10n.t(context, 'whatsapp.fabAria'),
      button: true,
      child: Material(
        color: const Color(0xFF25D366),
        shape: const CircleBorder(),
        elevation: 6,
        shadowColor: Colors.black45,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () => _open(context),
          child: const SizedBox(
            width: 56,
            height: 56,
            child: Icon(Icons.chat, color: Colors.white, size: 28),
          ),
        ),
      ),
    );
  }

  Future<void> _open(BuildContext context) async {
    final n = _digits();
    if (n.isEmpty) return;
    // Texte pré-rempli lu AVANT tout point d'attente : le contexte n'est plus
    // utilisable après un await (linter), et la langue reste celle du tap.
    final text = Uri.encodeComponent(L10n.t(context, 'whatsapp.prefill'));
    try {
      // Détection de WhatsApp via son propre schéma d'intention : seul
      // l'application WhatsApp sait gérer `whatsapp://`.
      final hasWhatsApp =
          await canLaunchUrl(Uri.parse('whatsapp://send?phone=$n'));
      if (hasWhatsApp) {
        // Lien profond WhatsApp : ouvre DIRECTEMENT la conversation avec le
        // message pré-rempli, sans le sélecteur « Ouvrir avec » du système.
        await launchUrl(
          Uri.parse('whatsapp://send?phone=$n&text=$text'),
          mode: LaunchMode.externalApplication,
        );
      } else if (context.mounted) {
        await _showHelp(context, n);
      }
    } catch (_) {
      // Détection impossible : par sécurité, proposer l'aide au lieu de
      // laisser le bouton paraître mort.
      if (context.mounted) await _showHelp(context, n);
    }
  }

  Future<void> _showHelp(BuildContext context, String n) {
    return showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        icon: const Icon(Icons.chat, color: Color(0xFF25D366)),
        title: Text(L10n.t(dialogContext, 'whatsapp.notInstalledTitle')),
        content: Text(L10n.tArgs(dialogContext, 'whatsapp.notInstalledBody',
            {'number': _formatted(n)})),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(L10n.t(dialogContext, 'common.cancel')),
          ),
          TextButton(
            onPressed: () async {
              try {
                await launchUrl(
                  Uri.parse('tel:+$n'),
                  mode: LaunchMode.externalApplication,
                );
              } catch (_) {
                // `tel:` non gérable (rare) : ignorer silencieusement.
              }
            },
            child: Text(
                '${L10n.t(dialogContext, 'whatsapp.callAction')} ${_formatted(n)}'),
          ),
          FilledButton(
            onPressed: () async {
              try {
                await launchUrl(
                  Uri.parse(
                      'https://play.google.com/store/apps/details?id=com.whatsapp'),
                  mode: LaunchMode.externalApplication,
                );
              } catch (_) {
                // Boutique injoignable : ignorer silencieusement.
              }
            },
            child: Text(L10n.t(dialogContext, 'whatsapp.installAction')),
          ),
        ],
      ),
    );
  }
}
