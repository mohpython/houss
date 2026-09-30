import 'package:flutter/material.dart';
import 'package:saha_sante/core/theme/app_colors.dart';

// ============================================================================
// Formats
// ============================================================================

/// Date et heure au format français, sans dépendre des données de locale d'intl.
String frDateTime(DateTime? date) {
  if (date == null) return '—';
  const months = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
  ];
  final d = date.toLocal();
  final heure = d.hour.toString().padLeft(2, '0');
  final minute = d.minute.toString().padLeft(2, '0');
  return '${d.day} ${months[d.month - 1]} ${d.year} à $heure:$minute';
}

DateTime? parseDate(Object? value) => DateTime.tryParse(value as String? ?? '');

/// Montant en FCFA, arrondi et séparé par milliers (« 4 000 FCFA »).
String frAmount(num amount) {
  final digits = amount.round().abs().toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(' ');
    buffer.write(digits[i]);
  }
  return '${amount < 0 ? '-' : ''}$buffer FCFA';
}

/// Intitulé affichable d'un médicament du catalogue (« Paracetamol 500 mg »).
String medicineLabel(Map<String, dynamic> med) {
  final name = (med['normalized_name'] as String?) ?? '';
  final pretty = name.isEmpty ? 'Médicament' : name[0].toUpperCase() + name.substring(1);
  final strength = (med['strength'] as String?) ?? '';
  return strength.isEmpty ? pretty : '$pretty $strength';
}

// ============================================================================
// États / statuts
// ============================================================================

const reservationLabels = <String, String>{
  'pending': 'En attente',
  'accepted': 'Acceptée',
  'rejected': 'Refusée',
  'ready': 'Prête',
  'completed': 'Terminée',
  'cancelled': 'Annulée',
};

const deliveryLabels = <String, String>{
  'unassigned': 'Non assignée',
  'assigned': 'À récupérer',
  'picked_up': 'Ramenée',
  'en_route': 'En route',
  'delivered': 'Livrée',
  'failed': 'Échec',
};

const paymentLabels = <String, String>{
  'unpaid': 'Non réglé',
  'pending_verification': 'Paiement à confirmer',
  'paid': 'Réglé',
  'failed': 'Paiement refusé',
};

const appointmentLabels = <String, String>{
  'requested': 'Demandé',
  'accepted': 'Accepté',
  'rescheduled': 'Reprogrammé',
  'rejected': 'Refusé',
  'cancelled': 'Annulé',
  'completed': 'Terminé',
};

const statusLabels = <String, String>{
  'pending': 'En attente',
  'approved': 'Approuvé',
  'rejected': 'Rejeté',
};

/// Couleur d'un état (commande, paiement, livraison, validation…).
Color statusColor(String? status) {
  switch (status) {
    case 'accepted':
    case 'paid':
    case 'approved':
    case 'delivered':
    case 'completed':
      return AppColors.success;
    case 'pending':
    case 'pending_verification':
    case 'ready':
    case 'requested':
    case 'assigned':
      return AppColors.warning;
    case 'picked_up':
    case 'en_route':
    case 'rescheduled':
      return AppColors.accent;
    case 'rejected':
    case 'cancelled':
    case 'failed':
    case 'unpaid':
      return Colors.red.shade600;
    default:
      return AppColors.textSecondary;
  }
}

/// Libellé + couleur d'un rôle.
(String, Color) roleInfo(String role) {
  switch (role) {
    case 'admin':
      return ('Admin', Colors.red.shade400);
    case 'pharmacy_staff':
      return ('Pharmacie', AppColors.accentLight);
    case 'courier':
      return ('Livreur', AppColors.primaryLight);
    case 'doctor':
      return ('Médecin', AppColors.success);
    case 'nurse':
      return ('Infirmier', AppColors.warning);
    case 'patient':
      return ('Patient', AppColors.textSecondary);
    default:
      return (role, AppColors.textMuted);
  }
}

// ============================================================================
// Widgets
// ============================================================================

/// Pastille d'état colorée.
Widget statusChip(String label, Color color, {IconData? icon}) {
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: color.withAlpha(35),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: color.withAlpha(110)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
        ],
        Text(
          label,
          style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
        ),
      ],
    ),
  );
}

/// Carte de section (fond sombre, coins arrondis).
class SpaceCard extends StatelessWidget {
  const SpaceCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.margin,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      width: double.infinity,
      margin: margin,
      padding: padding,
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: child,
    );
    if (onTap == null) return card;
    return GestureDetector(onTap: onTap, child: card);
  }
}

/// Petite carte de statistique (à placer dans un `Expanded` d'une `Row`).
class StatCard extends StatelessWidget {
  const StatCard({
    super.key,
    required this.label,
    required this.value,
    this.color = AppColors.primaryLight,
    this.icon,
  });

  final String label;
  final String value;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 15, color: color, semanticLabel: label),
            const SizedBox(height: 4),
          ],
          Text(
            value,
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: color),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(fontSize: 10.5, color: AppColors.textMuted),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

/// Bouton d'action compact pour les cartes.
Widget actionButton(
  String label,
  VoidCallback? onPressed, {
  Color color = AppColors.primary,
  IconData? icon,
  bool dense = false,
}) {
  return ElevatedButton(
    style: ElevatedButton.styleFrom(
      backgroundColor: color,
      foregroundColor: Colors.white,
      disabledBackgroundColor: color.withAlpha(70),
      elevation: 0,
      padding: EdgeInsets.symmetric(horizontal: dense ? 10 : 14, vertical: 8),
      minimumSize: const Size(0, 34),
      textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    onPressed: onPressed,
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[Icon(icon, size: 14), const SizedBox(width: 4)],
        Text(label),
      ],
    ),
  );
}

/// Titre de sous-section.
Widget sectionTitle(String text) {
  return Align(
    alignment: Alignment.centerLeft,
    child: Text(
      text,
      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
    ),
  );
}

/// En-tête des écrans d'espace.
Widget spaceHeader(String title, {String? subtitle, Widget? trailing}) {
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const SizedBox(height: 16),
      Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
          ),
          if (trailing != null) trailing,
        ],
      ),
      if (subtitle != null && subtitle.isNotEmpty) ...[
        const SizedBox(height: 4),
        Text(
          subtitle,
          style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
        ),
      ],
    ],
  );
}

/// Onglets segmentés (icône + libellé) pour les espaces.
Widget segmentedTabs({
  required List<String> labels,
  required List<IconData> icons,
  required int selected,
  required ValueChanged<int> onChanged,
}) {
  return Container(
    padding: const EdgeInsets.all(4),
    decoration: BoxDecoration(
      color: AppColors.surfaceLight,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: AppColors.border),
    ),
    child: Row(
      children: List.generate(labels.length, (i) {
        final sel = selected == i;
        return Expanded(
          child: GestureDetector(
            onTap: () => onChanged(i),
            behavior: HitTestBehavior.opaque,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              padding: const EdgeInsets.symmetric(vertical: 9),
              decoration: BoxDecoration(
                color: sel ? AppColors.primary.withAlpha(50) : Colors.transparent,
                borderRadius: BorderRadius.circular(10),
                border: sel ? Border.all(color: AppColors.primary.withAlpha(120)) : null,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    icons[i],
                    size: 15,
                    color: sel ? AppColors.primaryLight : AppColors.textMuted,
                  ),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      labels[i],
                      style: TextStyle(
                        fontSize: 12.5,
                        color: sel ? AppColors.primaryLight : AppColors.textMuted,
                        fontWeight: sel ? FontWeight.w700 : FontWeight.w500,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }),
    ),
  );
}

/// Message d'erreur avec bouton de réessai.
Widget errorView(String message, VoidCallback onRetry) {
  return Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off, size: 40, color: AppColors.textMuted),
          const SizedBox(height: 12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textSecondary),
          ),
          const SizedBox(height: 16),
          actionButton('Réessayer', onRetry, icon: Icons.refresh),
        ],
      ),
    ),
  );
}

/// Message vide (liste sans contenu).
Widget emptyView(String message) {
  return Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: const TextStyle(color: AppColors.textSecondary),
      ),
    ),
  );
}

/// Notification rapide (Snack bar).
void showSnack(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(message),
      backgroundColor: error ? Colors.red.shade700 : AppColors.success,
    ),
  );
}
