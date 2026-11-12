import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/services.dart';

import 'voice_service.dart';

/// Sonnerie + lecture vocale pour les notifications push (commandes, paiements, courses).
///
/// La lecture suit la langue choisie par le patient (voir [VoiceService]).
class AlertService {
  AlertService._();
  static final AlertService instance = AlertService._();

  final AudioPlayer _player = AudioPlayer();
  bool _ready = false;
  final Set<String> _seen = <String>{};

  Future<void> init() async {
    if (_ready) return;
    await VoiceService.instance.init();
    _ready = true;
  }

  Future<void> announce({required String key, required String message}) async {
    if (_seen.contains(key)) return;
    _seen.add(key);
    if (!_ready) await init();

    // 1. Sonnerie
    try {
      await _player.stop();
      await _player.play(AssetSource('sounds/beep.wav'), volume: 1.0);
    } catch (_) {}

    // 2. Vibration
    try {
      await HapticFeedback.heavyImpact();
      await Future.delayed(const Duration(milliseconds: 200));
      await HapticFeedback.heavyImpact();
    } catch (_) {}

    // 3. Lecture vocale (après la sonnerie), dans la langue choisie
    Future.delayed(const Duration(milliseconds: 900), () async {
      try {
        await VoiceService.instance.speak(message);
      } catch (_) {}
    });
  }

  void reset() => _seen.clear();
}
