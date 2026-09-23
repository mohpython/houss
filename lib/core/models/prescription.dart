import 'package:flutter/material.dart';

enum PrescriptionStatus { uploaded, processing, extracted, verified, failed }

class Prescription {
  final String id;
  final String? doctorName;
  final String? patientName;
  final DateTime? prescriptionDate;
  final DateTime createdAt;
  final PrescriptionStatus status;
  final int? aiConfidence;
  final List<String> medicines;
  final String? imageUrl;

  const Prescription({
    required this.id,
    this.doctorName,
    this.patientName,
    this.prescriptionDate,
    required this.createdAt,
    required this.status,
    this.aiConfidence,
    this.medicines = const [],
    this.imageUrl,
  });

  static PrescriptionStatus _status(String? value) => switch (value) {
        'processing' => PrescriptionStatus.processing,
        'extracted' => PrescriptionStatus.extracted,
        'verified' => PrescriptionStatus.verified,
        'failed' => PrescriptionStatus.failed,
        _ => PrescriptionStatus.uploaded,
      };

  /// Construit depuis la réponse de l'API (`/api/v1/prescriptions`).
  factory Prescription.fromJson(Map<String, dynamic> json) {
    final items = (json['prescription_items'] as List?) ?? const [];
    return Prescription(
      id: json['id'] as String,
      doctorName: json['doctor_name'] as String?,
      patientName: json['patient_name'] as String?,
      prescriptionDate: DateTime.tryParse(json['prescription_date'] as String? ?? ''),
      createdAt: DateTime.tryParse(json['created_at'] as String? ?? '') ?? DateTime.now(),
      status: _status(json['status'] as String?),
      aiConfidence: (json['ai_confidence'] as num?)?.round(),
      imageUrl: json['file_url'] as String?,
      medicines: items.map((raw) {
        final item = raw as Map<String, dynamic>;
        final parts = <String>[
          item['medicine_name_raw'] as String? ?? '',
          if ((item['strength'] as String?)?.isNotEmpty ?? false) item['strength'] as String,
        ];
        final posology = item['dosage'] as String? ?? item['quantity'] as String? ?? '';
        final label = parts.where((p) => p.isNotEmpty).join(' ');
        return posology.isEmpty ? label : '$label — $posology';
      }).where((label) => label.isNotEmpty).toList(),
    );
  }
}

extension PrescriptionStatusX on PrescriptionStatus {
  String get label {
    return switch (this) {
      PrescriptionStatus.uploaded => 'Téléchargée',
      PrescriptionStatus.processing => 'Analyse en cours',
      PrescriptionStatus.extracted => 'Extraite',
      PrescriptionStatus.verified => 'Vérifiée',
      PrescriptionStatus.failed => 'Échouée',
    };
  }

  Color get color {
    return switch (this) {
      PrescriptionStatus.uploaded => Colors.grey,
      PrescriptionStatus.processing => Colors.blue,
      PrescriptionStatus.extracted => const Color(0xFF10B981),
      PrescriptionStatus.verified => const Color(0xFF06B6D4),
      PrescriptionStatus.failed => Colors.redAccent,
    };
  }
}
