import 'package:flutter/material.dart';

enum ReservationStatus { pending, accepted, ready, inTransit, completed, cancelled }

class Reservation {
  final String id;
  final String pharmacyName;
  final String pharmacyAddress;
  final DateTime createdAt;
  final ReservationStatus status;
  final List<String> medicines;
  final double? totalPrice;

  const Reservation({
    required this.id,
    required this.pharmacyName,
    required this.pharmacyAddress,
    required this.createdAt,
    required this.status,
    this.medicines = const [],
    this.totalPrice,
    this.paymentStatus = 'unpaid',
    this.fulfillmentMethod = 'delivery',
    this.pickupCode,
    this.pharmacyPhone,
  });

  final String paymentStatus;
  final String fulfillmentMethod;
  final String? pickupCode;
  final String? pharmacyPhone;

  bool get needsPayment => paymentStatus == 'unpaid';
  bool get isPickup => fulfillmentMethod == 'pickup';

  /// Copie avec quelques champs modifies.
  ///
  /// Sert au changement de mode de remise : on applique le nouveau mode
  /// immediatement, avant la reponse du serveur, pour que le bouton bascule
  /// dans la meme image. Le serveur confirme ensuite.
  Reservation copyWith({
    String? fulfillmentMethod,
    double? totalPrice,
    String? paymentStatus,
    ReservationStatus? status,
  }) {
    return Reservation(
      id: id,
      pharmacyName: pharmacyName,
      pharmacyAddress: pharmacyAddress,
      createdAt: createdAt,
      status: status ?? this.status,
      medicines: medicines,
      totalPrice: totalPrice ?? this.totalPrice,
      paymentStatus: paymentStatus ?? this.paymentStatus,
      fulfillmentMethod: fulfillmentMethod ?? this.fulfillmentMethod,
      pickupCode: pickupCode,
      pharmacyPhone: pharmacyPhone,
    );
  }

  static ReservationStatus _status(String? status, String? delivery) {
    if (status == 'completed') return ReservationStatus.completed;
    if (status == 'cancelled' || status == 'rejected') return ReservationStatus.cancelled;
    if (delivery == 'picked_up' || delivery == 'en_route') return ReservationStatus.inTransit;
    if (status == 'ready') return ReservationStatus.ready;
    if (status == 'accepted') return ReservationStatus.accepted;
    return ReservationStatus.pending;
  }

  /// Construit depuis la réponse de l'API (`/api/v1/reservations`).
  factory Reservation.fromJson(Map<String, dynamic> json) {
    final pharmacy = (json['pharmacies'] as Map<String, dynamic>?) ?? const {};
    final items = (json['reservation_items'] as List?) ?? const [];
    return Reservation(
      id: json['id'] as String,
      pharmacyName: pharmacy['name'] as String? ?? 'Pharmacie',
      pharmacyAddress: pharmacy['address'] as String? ?? '',
      pharmacyPhone: pharmacy['phone'] as String?,
      createdAt: DateTime.tryParse(json['created_at'] as String? ?? '') ?? DateTime.now(),
      status: _status(json['status'] as String?, json['delivery_status'] as String?),
      totalPrice: (json['total_amount'] as num?)?.toDouble(),
      paymentStatus: json['payment_status'] as String? ?? 'unpaid',
      fulfillmentMethod: json['fulfillment_method'] as String? ?? 'delivery',
      pickupCode: json['pickup_code'] as String?,
      medicines: items.map((raw) {
        final item = (raw as Map<String, dynamic>)['prescription_items'] as Map<String, dynamic>?;
        final name = item?['medicine_name_raw'] as String? ?? '';
        final strength = item?['strength'] as String? ?? '';
        return strength.isEmpty ? name : '$name $strength';
      }).where((label) => label.isNotEmpty).toList(),
    );
  }
}

extension ReservationStatusX on ReservationStatus {
  String get label {
    return switch (this) {
      ReservationStatus.pending => 'En attente',
      ReservationStatus.accepted => 'Acceptée',
      ReservationStatus.ready => 'Prête',
      ReservationStatus.inTransit => 'En livraison',
      ReservationStatus.completed => 'Livrée',
      ReservationStatus.cancelled => 'Annulée',
    };
  }

  Color get color {
    return switch (this) {
      ReservationStatus.pending => const Color(0xFF94A3B8),
      ReservationStatus.accepted => const Color(0xFF8B5CF6),
      ReservationStatus.ready => const Color(0xFF06B6D4),
      ReservationStatus.inTransit => const Color(0xFFF59E0B),
      ReservationStatus.completed => const Color(0xFF10B981),
      ReservationStatus.cancelled => Colors.redAccent,
    };
  }
}
