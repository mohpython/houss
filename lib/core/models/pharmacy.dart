import 'package:flutter/material.dart';

class Pharmacy {
  final String id;
  final String name;
  final String address;
  final String neighborhood;
  final double distanceKm;
  final bool open24;
  final bool isGuard;
  final String? phone;
  final bool delivery;

  const Pharmacy({
    required this.id,
    required this.name,
    required this.address,
    required this.neighborhood,
    required this.distanceKm,
    this.open24 = false,
    this.isGuard = false,
    this.phone,
    this.delivery = true,
  });

  /// Construit depuis la réponse de l'API (`/api/v1/pharmacies`).
  factory Pharmacy.fromJson(Map<String, dynamic> json) => Pharmacy(
        id: json['id'] as String,
        name: json['name'] as String,
        address: json['address'] as String? ?? '',
        neighborhood: json['city'] as String? ?? 'Bamako',
        distanceKm: (json['distance_km'] as num?)?.toDouble() ?? 0,
        phone: json['phone'] as String?,
      );

  String get distanceLabel => '${distanceKm.toStringAsFixed(1)} km';
  String get statusLabel {
    if (open24) return 'Ouvert 24h/24';
    if (isGuard) return 'Garde';
    return 'Ouvert';
  }

  Color get statusColor {
    if (open24) return const Color(0xFF10B981);
    if (isGuard) return const Color(0xFFF59E0B);
    return const Color(0xFF06B6D4);
  }
}
