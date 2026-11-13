import 'package:flutter/material.dart';

import '../../core/services/voice_service.dart';

/// Bouton pause / lecture vocale flottant (en haut à gauche).
///
/// Un tapotement coupe immédiatement la voix en cours et désactive la
/// lecture ; un second tapotement la réactive. La préférence est mémorisée
/// sur l'appareil.
class VoiceGuideToggle extends StatelessWidget {
  const VoiceGuideToggle({super.key});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: VoiceService.instance,
      builder: (context, _) {
        final on = VoiceService.instance.enabled;
        return GestureDetector(
          onTap: () async {
            final voice = VoiceService.instance;
            if (on) {
              await voice.stop();
              await voice.setEnabled(false);
            } else {
              await voice.setEnabled(true);
              await voice.repeat();
            }
          },
          child: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: on ? const Color(0xFF1B6DFF) : const Color(0xFF334155),
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.35),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Icon(
              on ? Icons.pause_rounded : Icons.volume_up_rounded,
              color: Colors.white,
              size: 26,
            ),
          ),
        );
      },
    );
  }
}
