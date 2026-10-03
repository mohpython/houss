import 'dart:io';

import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/models/pharmacy.dart';
import 'package:saha_sante/core/models/practitioner.dart';
import 'package:saha_sante/core/models/prescription.dart';
import 'package:saha_sante/core/models/reservation.dart';
import 'package:saha_sante/core/services/auth_service.dart';

/// Résultat d'un envoi d'ordonnance : l'ordonnance créée et, si la lecture IA
/// a échoué, le message à afficher au patient.
class ScanResult {
  final Prescription prescription;
  final String? error;
  final Map<String, dynamic>? extraction;

  const ScanResult({required this.prescription, this.error, this.extraction});

  bool get needsReview => extraction?['blocking'] == true;
  List<String> get reasons =>
      ((extraction?['reasons'] as List?) ?? const []).map((r) => '$r').toList();
}

/// Commande créée par le routage automatique.
class RoutingResult {
  final String reservationId;
  final String pharmacyName;
  final int matchedCount;
  final int missingCount;
  final double totalAmount;

  const RoutingResult({
    required this.reservationId,
    required this.pharmacyName,
    required this.matchedCount,
    required this.missingCount,
    required this.totalAmount,
  });

  factory RoutingResult.fromJson(Map<String, dynamic> json) => RoutingResult(
        reservationId: json['reservationId'] as String,
        pharmacyName: json['pharmacyName'] as String? ?? 'Pharmacie',
        matchedCount: (json['matchedCount'] as num?)?.toInt() ?? 0,
        missingCount: (json['missingCount'] as num?)?.toInt() ?? 0,
        totalAmount: (json['totalAmount'] as num?)?.toDouble() ?? 0,
      );
}

/// Toutes les requêtes de l'application vers le serveur SAHA Santé.
class ApiService {
  ApiService._();

  static final ApiService instance = ApiService._();

  ApiClient get _api => AuthService.instance.api;

  // --- Ordonnances ---------------------------------------------------------

  Future<List<Prescription>> getPrescriptions() async {
    final data = await _api.get('/prescriptions');
    return ((data['prescriptions'] as List?) ?? const [])
        .map((e) => Prescription.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Prescription> getPrescription(String id) async {
    final data = await _api.get('/prescriptions/$id');
    final rx = data['prescription'] as Map<String, dynamic>;
    rx['file_url'] = data['file_url'];
    return Prescription.fromJson(rx);
  }

  /// Envoie la photo, lance la lecture IA et renvoie l'ordonnance extraite.
  Future<ScanResult> uploadPrescription(File file) async {
    final data = await _api.upload('/prescriptions', file);
    return ScanResult(
      prescription: Prescription.fromJson(data['prescription'] as Map<String, dynamic>),
      error: data['error'] as String?,
      extraction: data['extraction'] as Map<String, dynamic>?,
    );
  }

  // --- Commandes -----------------------------------------------------------

  Future<List<Reservation>> getReservations() async {
    final data = await _api.get('/reservations');
    return ((data['reservations'] as List?) ?? const [])
        .map((e) => Reservation.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> getReservation(String id) async {
    return _api.get('/reservations/$id');
  }

  /// Envoie l'ordonnance à la pharmacie la plus proche qui a les médicaments.
  Future<RoutingResult> routePrescription({
    required String prescriptionId,
    double? lat,
    double? lng,
    String? address,
    String? neighborhoodId,
  }) async {
    final data = await _api.post('/reservations/route', {
      'prescription_id': prescriptionId,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      if (address != null && address.isNotEmpty) 'address': address,
      if (neighborhoodId != null) 'neighborhood_id': neighborhoodId,
    });
    return RoutingResult.fromJson(data);
  }

  Future<Reservation> setFulfillment(String reservationId, String method) async {
    final data = await _api.post('/reservations/$reservationId/fulfillment', {'method': method});
    return Reservation.fromJson(data['reservation'] as Map<String, dynamic>);
  }

  /// Déclare le paiement mobile money (la pharmacie le confirme ensuite).
  Future<void> declarePayment({
    required String reservationId,
    required String method,
    required String reference,
    required String phone,
  }) async {
    await _api.post('/reservations/$reservationId/pay', {
      'method': method,
      'reference': reference,
      'phone': phone,
    });
  }

  Future<void> cancelReservation(String reservationId) async {
    await _api.post('/reservations/$reservationId/cancel');
  }

  // --- Annuaire ------------------------------------------------------------

  Future<List<Pharmacy>> getPharmacies({double? lat, double? lng}) async {
    final data = await _api.get('/pharmacies', query: {'lat': lat, 'lng': lng});
    return ((data['pharmacies'] as List?) ?? const [])
        .map((e) => Pharmacy.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<Practitioner>> getPractitioners({
    double? lat,
    double? lng,
    String? type,
    bool homeVisitsOnly = false,
  }) async {
    final data = await _api.get('/practitioners', query: {
      'lat': lat,
      'lng': lng,
      'type': type,
      if (homeVisitsOnly) 'home_visits': 1,
    });
    return _practitioners(data);
  }

  /// Triage IA des symptômes + praticiens correspondants.
  Future<({Map<String, dynamic> triage, List<Practitioner> practitioners})> triage({
    required String symptoms,
    double? lat,
    double? lng,
    bool homeVisitsOnly = false,
  }) async {
    final data = await _api.post('/health/triage', {
      'symptoms': symptoms,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      if (homeVisitsOnly) 'home_visits': true,
    });
    return (
      triage: (data['triage'] as Map<String, dynamic>?) ?? const {},
      practitioners: _practitioners(data),
    );
  }

  List<Practitioner> _practitioners(Map<String, dynamic> data) {
    final labels = <String, String>{
      for (final s in ((data['specialties'] as List?) ?? const []))
        (s as Map<String, dynamic>)['code'] as String: s['label_fr'] as String,
    };
    return ((data['practitioners'] as List?) ?? const [])
        .map((e) => Practitioner.fromJson(e as Map<String, dynamic>, specialties: labels))
        .toList();
  }

  Future<List<Map<String, dynamic>>> getNeighborhoods() async {
    final data = await _api.get('/neighborhoods');
    return ((data['neighborhoods'] as List?) ?? const []).cast<Map<String, dynamic>>();
  }

  // --- Rendez-vous ---------------------------------------------------------

  Future<List<Map<String, dynamic>>> getAppointments() async {
    final data = await _api.get('/appointments');
    return ((data['appointments'] as List?) ?? const []).cast<Map<String, dynamic>>();
  }

  Future<String> requestAppointment({
    required String practitionerId,
    String? reason,
    String? symptoms,
    bool atHome = false,
    String? address,
    String? phone,
    double? lat,
    double? lng,
    Map<String, dynamic>? triage,
  }) async {
    final data = await _api.post('/appointments', {
      'practitioner_id': practitionerId,
      if (reason != null && reason.isNotEmpty) 'reason': reason,
      if (symptoms != null && symptoms.isNotEmpty) 'symptoms': symptoms,
      'at_home': atHome,
      if (address != null) 'address': address,
      if (phone != null) 'phone': phone,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      if (triage != null) 'triage': triage,
    });
    return data['appointment_id'] as String;
  }

  Future<void> cancelAppointment(String id) async {
    await _api.post('/appointments/$id/cancel');
  }

  // --- Médicaments sans ordonnance ----------------------------------------

  Future<List<String>> getOtcSuggestions({String query = ''}) async {
    final data = await _api.get('/otc/suggestions', query: {'q': query});
    return ((data['suggestions'] as List?) ?? const []).map((e) => '$e').toList();
  }

  Future<RoutingResult> orderOtc({
    required List<String> medicines,
    double? lat,
    double? lng,
    String? address,
    String? neighborhoodId,
  }) async {
    final data = await _api.post('/otc/order', {
      'medicines': medicines,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      if (address != null && address.isNotEmpty) 'address': address,
      if (neighborhoodId != null) 'neighborhood_id': neighborhoodId,
    });
    return RoutingResult.fromJson(data);
  }

  // --- Notifications & profil ---------------------------------------------

  Future<List<Map<String, dynamic>>> getNotifications() async {
    final data = await _api.get('/notifications');
    return ((data['notifications'] as List?) ?? const []).cast<Map<String, dynamic>>();
  }

  Future<void> markNotificationsRead({String? id}) async {
    await _api.post('/notifications/read', {if (id != null) 'id': id});
  }

  Future<Map<String, dynamic>> getProfile() async {
    final data = await _api.get('/me');
    return (data['profile'] as Map<String, dynamic>?) ?? const {};
  }

  Future<void> updateProfile({String? fullName, String? phone, String? language}) async {
    await _api.put('/me', {
      if (fullName != null) 'full_name': fullName,
      if (phone != null) 'phone': phone,
      if (language != null) 'language': language,
    });
    await AuthService.instance.refreshUser();
  }

  // --- Espace pharmacie -----------------------------------------------------

  /// Tableau de bord : `{ pharmacy, stats: { stock, low_stock, orders } }`.
  Future<Map<String, dynamic>> pharmacyMe() => _api.get('/pharmacy/me');

  /// Commandes reçues : `{ rows, rxUrls }` (URL signées des ordonnances).
  Future<Map<String, dynamic>> pharmacyOrders() => _api.get('/pharmacy/orders');

  /// Décision sur une commande (accepted / rejected / ready / completed /
  /// cancelled) et/ou vérification du paiement (verify / reject).
  Future<void> pharmacyDecision(
    String reservationId, {
    String? decision,
    String? payment,
  }) async {
    await _api.post('/pharmacy/orders/$reservationId', {
      if (decision != null) 'decision': decision,
      if (payment != null) 'payment': payment,
    });
  }

  /// Assigne le livreur en ligne le plus proche à la commande.
  Future<void> pharmacyAssignCourier(String reservationId) async {
    await _api.post('/pharmacy/orders/$reservationId/assign');
  }

  /// Stock : `{ pharmacy, rows }`.
  Future<Map<String, dynamic>> pharmacyInventory() => _api.get('/pharmacy/inventory');

  /// Ajoute ou remplace une ligne de stock (le médicament doit exister dans
  /// le catalogue, sauf pour un administrateur).
  Future<void> pharmacyAddStock({
    required String name,
    required int stock,
    double? price,
    String? strength,
    String? generic,
  }) async {
    await _api.post('/pharmacy/inventory', {
      'name': name,
      'stock': stock,
      'price': price,
      if (strength != null && strength.isNotEmpty) 'strength': strength,
      if (generic != null && generic.isNotEmpty) 'generic': generic,
    });
  }

  Future<void> pharmacyUpdateStock(
    String inventoryId, {
    int? stockQty,
    double? price,
  }) async {
    await _api.put('/pharmacy/inventory/$inventoryId', {
      if (stockQty != null) 'stock_qty': stockQty,
      if (price != null) 'price': price,
    });
  }

  Future<void> pharmacyDeleteStock(String inventoryId) async {
    await _api.delete('/pharmacy/inventory/$inventoryId');
  }

  // --- Espace livreur -------------------------------------------------------

  /// `{ courier, deliveries, done }` — `courier` null sans profil livreur.
  Future<Map<String, dynamic>> courierMe() => _api.get('/courier/me');

  Future<void> courierSetOnline(bool online, {double? lat, double? lng}) async {
    await _api.post('/courier/online', {
      'online': online,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
    });
  }

  Future<void> courierPosition({double? lat, double? lng, String? reservationId}) async {
    if (lat == null || lng == null) return;
    await _api.post('/courier/position', {
      'lat': lat,
      'lng': lng,
      if (reservationId != null) 'reservation_id': reservationId,
    });
  }

  Future<void> courierDeliveryStatus(String reservationId, String status) async {
    await _api.post('/courier/deliveries/$reservationId/status', {'status': status});
  }

  // --- Espace praticien -----------------------------------------------------

  /// `{ me, appointments, counts }`.
  Future<Map<String, dynamic>> practitionerDashboard() => _api.get('/practitioner/dashboard');

  Future<void> practitionerRespond(
    String appointmentId, {
    String? action,
    String? at,
    String? reason,
    String? notes,
    bool complete = false,
  }) async {
    await _api.post('/practitioner/appointments/$appointmentId', {
      if (action != null) 'action': action,
      if (at != null) 'at': at,
      if (reason != null) 'reason': reason,
      if (notes != null) 'notes': notes,
      if (complete) 'complete': true,
    });
  }

  // --- Administration -------------------------------------------------------

  /// `{ pharmacies, counts }`.
  Future<Map<String, dynamic>> adminOverview() => _api.get('/admin/overview');

  Future<List<Map<String, dynamic>>> adminUsers() async {
    final data = await _api.get('/admin/users');
    return ((data['users'] as List?) ?? const []).cast<Map<String, dynamic>>();
  }

  Future<List<Map<String, dynamic>>> adminCouriers() async {
    final data = await _api.get('/admin/couriers');
    return ((data['couriers'] as List?) ?? const []).cast<Map<String, dynamic>>();
  }

  /// Décision admin sur une pharmacie. Renvoie la réponse serveur, dont
  /// `account: { email, password }` quand un compte vient d'être créé.
  Future<Map<String, dynamic>> adminPharmacyDecision(
    String pharmacyId,
    String decision,
  ) {
    return _api.post('/admin/pharmacies/$pharmacyId', {'decision': decision});
  }

  Future<void> adminCourierDecision(String courierId, String decision) async {
    await _api.post('/admin/couriers/$courierId', {'decision': decision});
  }

  /// Pharmacies et leur gérant :
  /// `{ pharmacies: [{ id, name, address, city, status, owner_email,
  /// claim_email }] }`.
  Future<List<Map<String, dynamic>>> adminPharmacyOwners() async {
    final data = await _api.get('/admin/pharmacies/owners');
    return ((data['pharmacies'] as List?) ?? const []).cast<Map<String, dynamic>>();
  }

  /// Attribue la gestion d'une pharmacie à un compte existant (par email),
  /// ou réserve la pharmacie pour cet email si aucun compte n'existe.
  /// Renvoie `'assigned'` ou `'invited'`.
  Future<String> adminAssignOwner(String pharmacyId, String email) async {
    final data = await _api.post('/admin/pharmacies/$pharmacyId/owner', {'email': email});
    return (data['status'] as String?) ?? 'assigned';
  }

  Future<void> adminRemoveOwner(String pharmacyId) async {
    await _api.post('/admin/pharmacies/$pharmacyId/owner/remove');
  }

  // --- Carte des pharmacies (Google Maps) -----------------------------------

  /// Pharmacies partenaires autour d'une position :
  /// `{ pharmacies, without_location, center, radius_km }`.
  Future<Map<String, dynamic>> adminPharmaciesNearby({
    required double lat,
    required double lng,
    double radiusKm = 5,
  }) =>
      _api.get('/admin/pharmacies/nearby', query: {
        'lat': lat,
        'lng': lng,
        'radius': radiusKm,
      });

  /// Toutes les pharmacies autour d'une position (Google Places) ;
  /// `local_pharmacy_id` non nul quand la pharmacie est déjà partenaire.
  Future<List<Map<String, dynamic>>> adminPharmaciesPlaces({
    required double lat,
    required double lng,
    double radiusKm = 5,
    String? query,
  }) async {
    final data = await _api.post('/admin/pharmacies/places', {
      'lat': lat,
      'lng': lng,
      'radius_m': (radiusKm * 1000).round(),
      if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
    });
    return ((data['places'] as List?) ?? const []).cast<Map<String, dynamic>>();
  }

  /// Ajoute une pharmacie repérée sur la carte comme partenaire
  /// (l'emplacement lat/lng est obligatoire). Renvoie `{ id, created,
  /// account }` — `account: { email, password }` quand un compte vient
  /// d'être créé pour la pharmacie.
  Future<Map<String, dynamic>> adminAddPartnerPharmacy({
    required String name,
    required String address,
    required double lat,
    required double lng,
    String? city,
    String? phone,
    String? placeId,
    double? rating,
  }) async {
    final data = await _api.post('/admin/pharmacies', {
      'name': name,
      'address': address,
      'lat': lat,
      'lng': lng,
      if (city != null && city.trim().isNotEmpty) 'city': city.trim(),
      if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
      if (placeId != null && placeId.isNotEmpty) 'place_id': placeId,
      if (rating != null) 'rating': rating,
    });
    return data;
  }
}
