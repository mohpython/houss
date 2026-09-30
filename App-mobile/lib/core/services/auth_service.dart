import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Utilisateur connecté.
class AppUser {
  final String id;
  final String? email;
  final String? phone;
  final String? fullName;
  final List<String> roles;

  const AppUser({
    required this.id,
    this.email,
    this.phone,
    this.fullName,
    this.roles = const [],
  });

  factory AppUser.fromJson(Map<String, dynamic> json, {List<String> roles = const []}) {
    final meta = (json['user_metadata'] as Map<String, dynamic>?) ?? const {};
    return AppUser(
      id: json['id'] as String,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      fullName: meta['full_name'] as String?,
      roles: roles,
    );
  }

  String get displayName =>
      (fullName != null && fullName!.trim().isNotEmpty) ? fullName! : (email ?? phone ?? 'Mon compte');
}

/// Session : jeton conservé sur l'appareil, restauré au démarrage.
///
/// Pour l'instant : email + mot de passe. La connexion par SMS s'ajoutera
/// avec les points d'entrée /auth/otp de l'API (le serveur est déjà prêt).
class AuthService extends ChangeNotifier {
  AuthService._();

  static final AuthService instance = AuthService._();

  static const _tokenKey = 'saha.token';

  String? _token;
  AppUser? _user;
  bool _loading = true;

  String? get token => _token;
  AppUser? get user => _user;
  bool get isLoggedIn => _token != null;

  /// true tant que la session enregistrée n'a pas été vérifiée.
  bool get isLoading => _loading;

  late final ApiClient api = ApiClient(
    tokenProvider: () => _token,
    onUnauthorized: () => signOut(),
  );

  /// Restaure la session au lancement de l'application.
  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_tokenKey);
    if (_token != null) {
      try {
        final data = await api.get('/me');
        _user = AppUser.fromJson(
          data['user'] as Map<String, dynamic>,
          roles: ((data['roles'] as List?) ?? const []).cast<String>(),
        );
      } on ApiException catch (e) {
        if (e.isUnauthorized) {
          _token = null;
          await prefs.remove(_tokenKey);
        }
      }
    }
    _loading = false;
    notifyListeners();
  }

  Future<void> signIn(String email, String password) async {
    final data = await api.post('/auth/login', {'email': email.trim(), 'password': password});
    await _apply(data);
  }

  /// Connexion avec un jeton d'identité Google (vérifié par le serveur).
  Future<void> signInWithGoogle(String idToken) async {
    final data = await api.post('/auth/google', {'id_token': idToken});
    await _apply(data);
  }

  /// Connexion avec un access token Google : le serveur échange le jeton contre
  /// le profil via userinfo (repli quand Google refuse l'ID token faute de
  /// registration Android).
  Future<void> signInWithGoogleAccessToken(String accessToken) async {
    final data = await api.post('/auth/google', {'access_token': accessToken});
    await _apply(data);
  }

  /// ID client OAuth Google fourni par le serveur ; `null` si non configuré.
  Future<String?> googleClientId() async {
    try {
      final data = await api.get('/auth/google/client-config');
      final id = data['client_id'] as String?;
      return (id == null || id.isEmpty) ? null : id;
    } on ApiException {
      return null;
    }
  }

  /// Termine une connexion Google initiée depuis le site web (lien profond
  /// `sahasantemali://auth?access_token=…`). Le jeton a été émis par le site
  /// (client web enregistré) ; on récupère le profil via `/me`.
  Future<void> applySessionToken(String accessToken) async {
    _token = accessToken;
    // Pendant la récupération du profil, le routeur ne doit pas encore
    // rediriger vers /app : sans les rôles, PatientMainScreen serait construit
    // avec la seule interface patient (bug « admin/pharmacie absent tant que
    // l'app n'est pas relancée »). `isLoading` retient la redirection.
    _loading = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_tokenKey, accessToken);
      final data = await api.get('/me');
      _user = AppUser.fromJson(
        data['user'] as Map<String, dynamic>,
        roles: ((data['roles'] as List?) ?? const []).cast<String>(),
      );
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        _token = null;
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(_tokenKey);
      }
      rethrow;
    } finally {
      _loading = false;
    }
    notifyListeners();
  }

  /// Traite un lien profond `sahasantemali://auth?access_token=…` renvoyé par
  /// le site web après la connexion Google. Retourne `true` si la session a
  /// été appliquée.
  Future<bool> handleAuthUri(Uri uri) async {
    if (uri.scheme != 'sahasantemali' || uri.host != 'auth') return false;
    final token = uri.queryParameters['access_token'];
    if (token == null || token.isEmpty) return false;
    try {
      await applySessionToken(token);
      return true;
    } on ApiException catch (e) {
      debugPrint('auth-deeplink: session rejetée (${e.message})');
      return false;
    }
  }

  /// Envoie un code OTP SMS vers le téléphone (connexion ou création de compte).
  Future<void> sendOtp(String phone) async {
    await api.post('/auth/otp/send', {'phone': phone.trim()});
  }

  /// Vérifie le code OTP et ouvre (ou crée) la session.
  Future<void> verifyOtp(String phone, String code) async {
    final data = await api.post(
      '/auth/otp/verify',
      {'phone': phone.trim(), 'code': code.trim()},
    );
    await _apply(data);
  }

  Future<void> register({
    required String email,
    required String password,
    required String fullName,
    String? phone,
  }) async {
    final data = await api.post('/auth/register', {
      'email': email.trim(),
      'password': password,
      'full_name': fullName.trim(),
      if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
    });
    await _apply(data);
  }

  Future<void> signOut() async {
    final hadToken = _token != null;
    _token = null;
    _user = null;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    if (hadToken) {
      // Révoque la session côté serveur (sans bloquer si le réseau est coupé).
      unawaited(api.post('/auth/logout').catchError((_) => <String, dynamic>{}));
    }
  }

  Future<void> refreshUser() async {
    if (_token == null) return;
    final data = await api.get('/me');
    _user = AppUser.fromJson(
      data['user'] as Map<String, dynamic>,
      roles: ((data['roles'] as List?) ?? const []).cast<String>(),
    );
    notifyListeners();
  }

  Future<void> _apply(Map<String, dynamic> data) async {
    _token = data['access_token'] as String;
    _user = AppUser.fromJson(
      data['user'] as Map<String, dynamic>,
      roles: ((data['roles'] as List?) ?? const []).cast<String>(),
    );
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, _token!);
    _loading = false;
    notifyListeners();
  }
}
