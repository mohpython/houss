import 'package:flutter/material.dart';

import '../../core/l10n/app_locale.dart';
import '../../core/services/voice_service.dart';
import '../../core/theme/app_colors.dart';

/// Bouton « écoute » : lit un texte à voix haute dans la langue choisie.
///
/// Si la synthèse vocale est désactivée par le patient, le bouton disparaît.
class VoiceButton extends StatelessWidget {
  const VoiceButton({
    super.key,
    required this.text,
    this.label,
    this.compact = true,
  });

  /// Texte lu (déjà traduit dans la langue de l'application).
  final String text;

  /// Libellé affiché à côté de l'icône (facultatif).
  final String? label;

  /// Version ronde et discrète (icône seule).
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final voice = VoiceService.instance;
    return AnimatedBuilder(
      animation: voice,
      builder: (context, _) {
        if (!voice.enabled) return const SizedBox.shrink();
        final icon = Icon(
          voice.speaking ? Icons.graphic_eq : Icons.volume_up_outlined,
          size: compact ? 18 : 22,
          color: voice.speaking ? AppColors.primary : AppColors.textSecondary,
        );
        if (compact) {
          return IconButton(
            onPressed: () => voice.speak(text),
            icon: icon,
            tooltip: L10n.t(context, 'voice.listen'),
            visualDensity: VisualDensity.compact,
          );
        }
        return OutlinedButton.icon(
          onPressed: () => voice.speak(text),
          icon: icon,
          label: Text(label ?? L10n.t(context, 'voice.listen')),
        );
      },
    );
  }
}
