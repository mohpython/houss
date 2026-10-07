import 'package:flutter/material.dart';
import 'package:saha_sante/core/config/app_config.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:url_launcher/url_launcher.dart';

/// Bouton flottant WhatsApp — ouvre la conversation avec le bot SAHA Santé,
/// message d'accueil pré-rempli dans la langue de l'application.
///
/// Masqué quand le numéro WhatsApp n'est pas configuré (comme sur le site).
class WhatsAppFab extends StatelessWidget {
  const WhatsAppFab({super.key});

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    if (AppConfig.whatsappNumber.trim().isEmpty) return const SizedBox.shrink();

    final url = AppConfig.waMeUrl(L10n.t(context, 'whatsapp.prefill'));

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
          onTap: () async {
            if (url.isEmpty) return;
            try {
              await launchUrl(
                Uri.parse(url),
                mode: LaunchMode.externalApplication,
              );
            } catch (_) {
              // Ouverture impossible (pas de navigateur/WhatsApp) : silencieux.
            }
          },
          child: const SizedBox(
            width: 56,
            height: 56,
            child: Icon(Icons.chat, color: Colors.white, size: 28),
          ),
        ),
      ),
    );
  }
}