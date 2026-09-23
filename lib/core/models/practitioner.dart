class Practitioner {
  final String id;
  final String fullName;
  final String type;
  final String specialty;
  final double? distanceKm;
  final String? phone;
  final String? address;
  final bool homeVisits;
  final int? consultationFee;

  const Practitioner({
    required this.id,
    required this.fullName,
    required this.type,
    required this.specialty,
    this.distanceKm,
    this.phone,
    this.address,
    this.homeVisits = false,
    this.consultationFee,
  });

  /// Construit depuis la réponse de l'API. [specialties] fait la correspondance
  /// entre le code de spécialité et son libellé en français.
  factory Practitioner.fromJson(
    Map<String, dynamic> json, {
    Map<String, String> specialties = const {},
  }) {
    final code = json['specialty_code'] as String? ?? '';
    return Practitioner(
      id: json['id'] as String,
      fullName: json['full_name'] as String,
      type: json['type'] as String? ?? 'doctor',
      specialty: specialties[code] ?? code,
      distanceKm: (json['distanceKm'] as num?)?.toDouble(),
      phone: json['phone'] as String?,
      address: json['address'] as String?,
      homeVisits: json['home_visits'] as bool? ?? false,
      consultationFee: (json['consultation_fee'] as num?)?.round(),
    );
  }

  String get displayName => type == 'doctor' ? 'Dr. $fullName' : fullName;
}
