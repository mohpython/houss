import 'package:flutter/foundation.dart';
import 'package:saha_sante/core/services/api_service.dart';

/// Nombre de notifications non lues, partage par toute l'application.
///
/// Sans cet etat, la coche de l'accueil ne pouvait pas se rafraichir apres un
/// « tout marquer comme lu » fait sur l'ecran notifications : l'ecran
/// notifications est empile par-dessus l'accueil, qui n'est pas reconstruit au
/// retour. Le compteur est donc detenu ici, et les deux ecrans le mettent a jour.
class UnreadStore extends ChangeNotifier {
  UnreadStore._();
  static final UnreadStore instance = UnreadStore._();

  int _count = 0;
  bool _loaded = false;
  int get count => _count;
  bool get loaded => _loaded;
  bool get hasUnread => _count > 0;

  /// `-1` tant que le compte n'est pas connu : la coche reste alors masquee
  /// plutot que d'afficher « 0 » le temps du chargement.
  static const unknown = -1;

  Future<void> refresh() async {
    try {
      final items = await ApiService.instance.getNotifications();
      final n = items.where((x) => x['read_at'] == null).length;
      setCount(n);
    } catch (_) {
      // Hors ligne : on garde la derniere valeur connue plutot que de faire
      // disparaitre la coche.
      _loaded = true;
      notifyListeners();
    }
  }

  void setCount(int n) {
    _count = n;
    _loaded = true;
    notifyListeners();
  }

  /// Appelee apres avoir marque une notification lue : evite d'attendre un
  /// aller-retour reseau pour reafficher la bonne coche.
  void decrement() {
    if (!_loaded) return;
    if (_count > 0) _count--;
    notifyListeners();
  }

  /// A appeler a la deconnexion.
  ///
  /// Sans cela, le compteur de l'utilisateur precedent resterait affiche pour
  /// le suivant : la cloche ne se rafraichit que si `loaded` est faux, donc
  /// effacer le nombre ne suffit pas — il faut surtout oublier qu'on l'a
  /// charge.
  void reset() {
    _count = 0;
    _loaded = false;
    notifyListeners();
  }
}