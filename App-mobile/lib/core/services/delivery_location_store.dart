/// Lieu de livraison choisi par le patient AVANT la prise de la photo
/// d'ordonnance (au moment du clic sur la caméra / galerie).
///
/// Le choix est ensuite utilisé pour pré-remplir l'écran « Lieu de livraison »
/// affiché après la lecture de l'ordonnance (le patient peut encore le
/// modifier, et c'est là que se choisit le mode livraison/retrait).
///
/// Mémoire uniquement (variable) : valable pour la session courante. Le
/// patient ne ressaisit pas l'adresse à chaque photo de la session.
class DeliveryLocationStore {
  DeliveryLocationStore._();
  static final DeliveryLocationStore instance = DeliveryLocationStore._();

  String mode = 'gps'; // 'gps' | 'neighborhood'
  double? lat;
  double? lng;
  String? neighborhoodId;
  String? neighborhoodName;
  String detail = '';
  String fulfillment = 'delivery'; // 'delivery' | 'pickup'

  bool get hasLocation =>
      mode == 'gps' ? (lat != null && lng != null) : neighborhoodId != null;

  void setGps({required double lat, required double lng, required String detail, String fulfillment = 'delivery'}) {
    mode = 'gps';
    this.lat = lat;
    this.lng = lng;
    neighborhoodId = null;
    neighborhoodName = null;
    this.detail = detail;
    this.fulfillment = fulfillment;
  }

  void setNeighborhood({
    required String id,
    required String name,
    required double lat,
    required double lng,
    required String detail,
    String fulfillment = 'delivery',
  }) {
    mode = 'neighborhood';
    neighborhoodId = id;
    neighborhoodName = name;
    this.lat = lat;
    this.lng = lng;
    this.detail = detail;
    this.fulfillment = fulfillment;
  }

  void setFulfillment(String value) => fulfillment = value;

  void clear() {
    mode = 'gps';
    lat = null;
    lng = null;
    neighborhoodId = null;
    neighborhoodName = null;
    detail = '';
    fulfillment = 'delivery';
  }
}
