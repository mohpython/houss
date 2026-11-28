/// Extraction du jeton d'e-ordonnance contenu dans un QR code.
///
/// Le portail médecin encode une URL du type
/// `https://sahasantemali.com/medecin/verifier/<jeton>`. Les jetons bruts
/// saisis manuellement sont également acceptés.
library;

/// Retourne le jeton (8 à 120 caractères) ou `null` si la charge utile n'est
/// pas un QR de vérification SAHA Santé valide.
String? extractSahaQrToken(String raw) {
  final value = raw.trim();
  if (value.isEmpty) return null;

  String candidate = value;
  final uri = Uri.tryParse(value);
  if (uri != null &&
      uri.hasScheme &&
      (uri.scheme == 'http' || uri.scheme == 'https')) {
    const marker = '/medecin/verifier/';
    final path = uri.path;
    final start = path.indexOf(marker);
    if (start < 0) return null;
    // Les éventuels paramètres de requête ne font pas partie du jeton.
    candidate = path.substring(start + marker.length).split('/').first;
  }

  if (candidate.length < 8 || candidate.length > 120) return null;
  // Un jeton base64url ne contient ni espace ni séparateur de chemin.
  if (candidate.contains(RegExp(r'\s')) || candidate.contains('/')) {
    return null;
  }
  return candidate;
}
