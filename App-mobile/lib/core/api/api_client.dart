import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart' show MediaType;
import 'package:saha_sante/core/config/app_config.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';

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

  Future<Map<String, dynamic>> delete(String path) async {
    return _send(path, () => http.delete(_uri(path), headers: _headers()));
  }

  /// Type MIME déduit de l'extension du fichier.
  ///
  /// Les photos prises par `image_picker` portent un nom de fichier temporaire
  /// sans extension : sans type explicite, `http` envoie
  /// `application/octet-stream` et le serveur refuse le fichier.
  static MediaType _contentTypeFor(String path) {
    final ext = path.split('.').last.toLowerCase();
    const byExt = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
      'heic': 'image/heic',
      'heif': 'image/heif',
      'pdf': 'application/pdf',
    };
    return MediaType.parse(byExt[ext] ?? 'image/jpeg');
  }

  /// Envoi d'un fichier (photo d'ordonnance) en multipart.
  Future<Map<String, dynamic>> upload(String path, File file, {String field = 'file'}) async {
    return _send(path, () async {
      final request = http.MultipartRequest('POST', _uri(path))
        ..headers.addAll(_headers(json: false))
        ..files.add(await http.MultipartFile.fromPath(
          field,
          file.path,
          contentType: _contentTypeFor(file.path),
        ));
      final streamed = await request.send().timeout(_timeout);
      return http.Response.fromStream(streamed);
    });
  }

  Future<Map<String, dynamic>> _send(String path, Future<http.Response> Function() run) async {
    http.Response res;
    try {
      res = await run().timeout(_timeout);
    } on SocketException {
      throw ApiException(L10n.c('api.noConnection'));
    } catch (_) {
      throw ApiException(L10n.c('api.serverDown'));
    }

    Map<String, dynamic> body;
    try {
      body = res.body.isEmpty ? {} : jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      throw ApiException(L10n.c('api.unexpected'), res.statusCode);
    }

    if (res.statusCode >= 200 && res.statusCode < 300) return body;

    // Un 401 sur /auth/login ou /auth/register signifie « identifiants
    // incorrects » : il ne doit pas fermer la session en cours.
    if (res.statusCode == 401 && !path.startsWith('/auth/')) onUnauthorized?.call();
    throw ApiException(
      (body['error'] as String?) ?? L10n.c('api.error').replaceAll('{code}', '${res.statusCode}'),
      res.statusCode,
    );
  }
}
