import 'package:flutter/material.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';

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

  /// État de la vérification par l'équipe (`pending`, `resolved`,
  /// `retake_requested`, `corrected`, ou null si jamais signalée).
  final String? reviewStatus;
  final String? reviewSeverity;
  final List<String> reviewReasons;

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
    this.reviewStatus,
    this.reviewSeverity,
    this.reviewReasons = const [],
  });

  /// Vrai tant que l'équipe n'a pas tranché : l'ordonnance ne peut pas encore
  /// être envoyée à une pharmacie, le patient doit attendre la notification.
  bool get reviewPending => reviewStatus == 'pending';

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
      reviewStatus: json['review_status'] as String?,
      reviewSeverity: json['review_severity'] as String?,
      reviewReasons: ((json['review_reasons'] as List?) ?? const [])
          .map((r) => '$r')
          .where((r) => r.isNotEmpty)
          .toList(),
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
      PrescriptionStatus.uploaded => L10n.c('st.rx.uploaded'),
      PrescriptionStatus.processing => L10n.c('st.rx.processing'),
      PrescriptionStatus.extracted => L10n.c('st.rx.extracted'),
      PrescriptionStatus.verified => L10n.c('st.rx.verified'),
      PrescriptionStatus.failed => L10n.c('st.rx.failed'),
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
