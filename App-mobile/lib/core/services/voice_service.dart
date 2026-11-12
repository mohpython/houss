import 'package:flutter/material.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../l10n/app_locale.dart';

/// Lecture vocale des instructions de l'application.
///
/// La voix suit la langue choisie par le patient (FR / EN / AR / BM). Quand
/// l'appareil ne dispose pas de synthèse vocale pour cette langue (le
/// bamanankan n'est en général pas installé), on bascule sur une langue de
/// repli et l'interface le signale.
class VoiceService extends ChangeNotifier {
  VoiceService._();
  static final VoiceService instance = VoiceService._();

  static const _prefsKey = 'saha.voice.enabled';

  final FlutterTts _tts = FlutterTts();
  bool _ready = false;
  bool _enabled = true;
  bool _speaking = false;
  /// Langue réellement utilisée pour la synthèse (peut différer de la langue
  /// choisie si la voix n'est pas installée sur l'appareil).
  String _spokenLanguage = 'fr-FR';
  /// Vrai quand la voix demandée est remplacée par une langue de repli.
  bool _fallback = false;
  SahaLang _lang = SahaLang.fr;

  bool get enabled => _enabled;
  bool get speaking => _speaking;

  /// Correspondance entre la langue de l'application et celle du moteur vocal.
  static const _voices = <SahaLang, String>{
    SahaLang.fr: 'fr-FR',
    SahaLang.en: 'en-US',
    SahaLang.ar: 'ar',
    SahaLang.bm: 'fr-FR', // pas de voix bamanankan sur les appareils Android
  };

  SahaLang get lang => _lang;

  /// Langue effectivement employée (code BCP-47).
  String get spokenLanguage => _spokenLanguage;

  /// Vrai lorsque la voix demandée n'existe pas sur l'appareil et qu'une
  /// langue de repli est employée (ex. bamanankan → français).
  bool get usingFallback => _fallback;

  Future<void> init() async {
    if (_ready) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      _enabled = prefs.getBool(_prefsKey) ?? true;
    } catch (_) {}
    _lang = AppLocale.instance.current;
    try {
      await _tts.setSharedInstance(true);
      await _tts.awaitSpeakCompletion(true);
      await _tts.setSpeechRate(0.45);
      await _tts.setVolume(1.0);
      await _tts.setPitch(1.0);
      await _applyVoice(_lang);
    } catch (_) {}
    _ready = true;
  }

  /// Change la langue de lecture (appelé quand le patient change de langue).
  Future<void> setLanguage(SahaLang lang) async {
    _lang = lang;
    if (!_ready) {
      await init();
      return;
    }
    await _applyVoice(lang);
    notifyListeners();
  }

  Future<void> _applyVoice(SahaLang lang) async {
    final wanted = _voices[lang] ?? 'fr-FR';
    var code = wanted;
    var fallback = false;
    try {
      final available = await _tts.isLanguageAvailable(wanted);
      if (available != true) {
        // Repli : français si disponible, sinon la langue par défaut du moteur.
        final fr = await _tts.isLanguageAvailable('fr-FR');
        code = fr == true ? 'fr-FR' : wanted;
        fallback = true;
      }
      await _tts.setLanguage(code);
    } catch (_) {
      code = wanted;
    }
    _spokenLanguage = code;
    _fallback = fallback;
  }

  /// Active ou désactive la lecture vocale (choix du patient).
  Future<void> setEnabled(bool value) async {
    _enabled = value;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_prefsKey, value);
    } catch (_) {}
    if (!value) await stop();
    notifyListeners();
  }

  Future<void> toggle() => setEnabled(!_enabled);

  /// Lit un texte à voix haute dans la langue choisie.
  Future<void> speak(String text) async {
    if (!_enabled || text.trim().isEmpty) return;
    if (!_ready) await init();
    await _applyVoice(_lang);
    try {
      await _tts.stop();
      _speaking = true;
      notifyListeners();
      await _tts.speak(text);
    } catch (_) {
      // Moteur vocal indisponible : on ignore silencieusement.
    } finally {
      _speaking = false;
      notifyListeners();
    }
  }

  /// Lit plusieurs messages l'un après l'autre.
  Future<void> speakAll(List<String> texts) async {
    for (final t in texts) {
      if (t.trim().isEmpty) continue;
      await speak(t);
    }
  }

  Future<void> stop() async {
    try {
      await _tts.stop();
    } catch (_) {}
    if (_speaking) {
      _speaking = false;
      notifyListeners();
    }
  }
}
