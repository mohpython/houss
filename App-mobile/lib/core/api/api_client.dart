import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:saha_sante/core/config/app_config.dart';

/// Erreur renvoyée par l'API, avec un message déjà traduit en français.
class ApiException implements Exception {
  final String message;
  final int statusCode;

  ApiException(this.message, [this.statusCode = 0]);

  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => message;
}

/// Client HTTP de l'API SAHA Santé (`/api/v1`).
///
/// Le jeton de session est fourni par [tokenProvider] ; quand le serveur
/// répond 401, [onUnauthorized] est appelé pour déconnecter l'utilisateur.
class ApiClient {
  ApiClient({required this.tokenProvider, this.onUnauthorized});

  final String? Function() tokenProvider;
  final void Function()? onUnauthorized;

  static const Duration _timeout = Duration(seconds: 60);

  Map<String, String> _headers({bool json = true}) {
    final token = tokenProvider();
    return {
      if (json) 'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final cleaned = query?.map((k, v) => MapEntry(k, '$v'))
      ?..removeWhere((_, v) => v.isEmpty || v == 'null');
    return Uri.parse('${AppConfig.apiUrl}$path').replace(
      queryParameters: (cleaned == null || cleaned.isEmpty) ? null : cleaned,
    );
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) async {
    return _send(path, () => http.get(_uri(path, query), headers: _headers()));
  }

  Future<Map<String, dynamic>> post(String path, [Map<String, dynamic>? body]) async {
    return _send(
      path,
      () => http.post(_uri(path), headers: _headers(), body: jsonEncode(body ?? {})),
    );
  }

  Future<Map<String, dynamic>> put(String path, [Map<String, dynamic>? body]) async {
    return _send(
      path,
      () => http.put(_uri(path), headers: _headers(), body: jsonEncode(body ?? {})),
    );
  }

  /// Envoi d'un fichier (photo d'ordonnance) en multipart.
  Future<Map<String, dynamic>> upload(String path, File file, {String field = 'file'}) async {
    return _send(path, () async {
      final request = http.MultipartRequest('POST', _uri(path))
        ..headers.addAll(_headers(json: false))
        ..files.add(await http.MultipartFile.fromPath(field, file.path));
      final streamed = await request.send().timeout(_timeout);
      return http.Response.fromStream(streamed);
    });
  }

  Future<Map<String, dynamic>> _send(String path, Future<http.Response> Function() run) async {
    http.Response res;
    try {
      res = await run().timeout(_timeout);
    } on SocketException {
      throw ApiException('Pas de connexion internet. Vérifiez votre réseau.');
    } catch (_) {
      throw ApiException('Le serveur ne répond pas. Réessayez dans un instant.');
    }

    Map<String, dynamic> body;
    try {
      body = res.body.isEmpty ? {} : jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      throw ApiException('Réponse inattendue du serveur.', res.statusCode);
    }

    if (res.statusCode >= 200 && res.statusCode < 300) return body;

    // Un 401 sur /auth/login ou /auth/register signifie « identifiants
    // incorrects » : il ne doit pas fermer la session en cours.
    if (res.statusCode == 401 && !path.startsWith('/auth/')) onUnauthorized?.call();
    throw ApiException(
      (body['error'] as String?) ?? 'Une erreur est survenue (${res.statusCode}).',
      res.statusCode,
    );
  }
}
