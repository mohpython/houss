import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/router/app_router.dart';
import 'package:saha_sante/core/services/auth_service.dart';

const _channelId = 'saha_default';
const _channelName = 'SAHA Santé';

/// Notifications push à distance, façon WhatsApp :
/// - le serveur envoie un FCM quand une commande/ordonnance/rendez-vous évolue ;
/// - l'app fermée reçoit la notification système (créée par firebase_messaging) ;
/// - l'app au premier plan affiche une notification locale ;
/// - le tap ouvre le fil des notifications.
class PushService {
  PushService._();
  static final PushService instance = PushService._();

  final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();
  String? _token;

  Future<void> init() async {
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('Firebase indisponible : $e');
      return;
    }

    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    );
    await _local.initialize(settings, onDidReceiveNotificationResponse: _onLocalTap);

    // Canal attendu par le payload FCM (`android.notification.channel_id`).
    final androidPlugin =
        _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(
      const AndroidNotificationChannel(
        _channelId,
        _channelName,
        importance: Importance.high,
        description: 'Commandes, ordonnances, rendez-vous et livraisons',
      ),
    );

    final fcm = FirebaseMessaging.instance;
    await fcm.requestPermission(alert: true, badge: true, sound: true);

    _token = await fcm.getToken();
    if (_token != null) unawaited(_register(_token!));
    fcm.onTokenRefresh.listen((token) {
      _token = token;
      unawaited(_register(token));
    });

    FirebaseMessaging.onMessage.listen(_onMessage);
    FirebaseMessaging.onMessageOpenedApp.listen((m) => _onTapLink(m.data['link']));
    final opened = await fcm.getInitialMessage();
    if (opened != null) _onTapLink(opened.data['link']);

    // À chaque (re)connexion, le nouveau jeton doit être rattaché au compte.
    AuthService.instance.addListener(() {
      final t = _token;
      if (t != null && AuthService.instance.isLoggedIn) unawaited(_register(t));
    });
  }

  Future<void> _register(String token) async {
    final lang = AppLocale.instance.locale.languageCode;
    try {
      await AuthService.instance.api.post('/devices', {
        'token': token,
        'platform': 'android',
        'language': lang == 'ar' || lang == 'en' ? lang : 'fr',
      });
      debugPrint('push: jeton enregistré');
    } catch (e) {
      debugPrint('push: enregistrement du jeton échoué : $e');
    }
  }

  void _onMessage(RemoteMessage m) {
    final n = m.notification;
    if (n == null) return;
    _local.show(
      m.hashCode,
      n.title,
      n.body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
      payload: m.data['link'],
    );
  }

  void _onLocalTap(NotificationResponse response) {
    _onTapLink(response.payload);
  }

  void _onTapLink(String? link) {
    // Tap = rouvre le fil de notifications (chaque type se tap ensuite vers sa
    // cible : commande -> suivi, ordonnance -> ordonnances, rendez-vous -> /health).
    // On ignore la `link` web du payload : l'app gère sa propre navigation.
    debugPrint('push: ouverture du fil des notifications');
    _go();
  }

  /// Au démarrage à froid, la notification est reçue avant le premier rendu : le
  /// routeur n'est pas encore attaché à un widget. On tente la navigation puis on
  /// la rejoue après la première frame (aller-retour idempotent).
  void _go() {
    try {
      AppRouter.router.go('/notifications');
    } catch (e) {
      debugPrint('push: navigation reportée : $e');
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      try {
        AppRouter.router.go('/notifications');
      } catch (e) {
        debugPrint('push: navigation impossible : $e');
      }
    });
  }
}
