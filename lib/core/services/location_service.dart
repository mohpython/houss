import 'package:geolocator/geolocator.dart';

/// Position GPS du patient (pharmacie la plus proche, livraison).
class LocationService {
  LocationService._();

  /// Renvoie la position actuelle, ou `null` si l'autorisation est refusée
  /// ou si le GPS est indisponible. N'affiche jamais d'erreur bloquante :
  /// l'utilisateur peut toujours choisir un quartier à la place.
  static Future<Position?> current() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return null;
      }
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 12),
        ),
      );
    } catch (_) {
      return null;
    }
  }
}
