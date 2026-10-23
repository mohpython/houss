import 'package:flutter/material.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/widgets/notification_bell.dart';

// ============================================================================
// Formats
// ============================================================================

/// Date et heure localisées (clés `month.1`..`month.12`).
String frDateTime(DateTime? date) {
  if (date == null) return '—';
  return L10n.dateTime(date.toLocal());
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
  final pretty = name.isEmpty ? L10n.c('common.medicine') : name[0].toUpperCase() + name.substring(1);
  final strength = (med['strength'] as String?) ?? '';
  return strength.isEmpty ? pretty : '$pretty $strength';
}

// ============================================================================
// États / statuts
// ============================================================================

/// Libellés localisés des états (commande, livraison, paiement,
/// rendez-vous, validation). Repli : le statut brut tel quel.
String resLabel(String s) => _labeled(_resStatuses, 'st.res.', s);
String delLabel(String s) => _labeled(_deliveryStatuses, 'st.delivery.', s);
String payLabel(String s) => _labeled(_payStatuses, 'st.pay.', s);
String appLabel(String s) => _labeled(_appStatuses, 'st.app.', s);
String reviewLabel(String s) => _labeled(_reviewStatuses, 'st.review.', s);

String _labeled(Set<String> known, String prefix, String s) =>
    known.contains(s) ? L10n.c('$prefix$s') : s;

const _resStatuses = <String>{
  'pending', 'accepted', 'rejected', 'ready', 'completed', 'cancelled',
};
const _deliveryStatuses = <String>{
  'unassigned', 'assigned', 'picked_up', 'en_route', 'delivered', 'failed',
};
const _payStatuses = <String>{
  'unpaid', 'pending_verification', 'paid', 'failed',
};
const _appStatuses = <String>{
  'requested', 'accepted', 'rescheduled', 'rejected', 'cancelled', 'completed',
};
const _reviewStatuses = <String>{'pending', 'approved', 'rejected'};

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
      return (L10n.c('role.admin'), Colors.red.shade400);
    case 'pharmacy_staff':
      return (L10n.c('role.pharmacy_staff'), AppColors.accentLight);
    case 'courier':
      return (L10n.c('role.courier'), AppColors.primaryLight);
    case 'doctor':
      return (L10n.c('role.doctor'), AppColors.success);
    case 'nurse':
      return (L10n.c('role.nurse'), AppColors.warning);
    case 'patient':
      return (L10n.c('role.patient'), AppColors.textSecondary);
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
    // Nullable et non `= AppColors.primaryLight` : une valeur par defaut de
    // parametre doit etre une constante, et les couleurs de l'app sont des
    // accesseurs. La couleur de repli est donc resolue au moment du build.
    this.color,
    this.icon,
  });

  final String label;
  final String value;
  final Color? color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    // Meme raison que le parametre nullable : repli sur le vert courant, donc
    // correct dans les deux themes.
    final tint = color ?? AppColors.primaryLight;
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
            Icon(icon, size: 15, color: tint, semanticLabel: label),
            const SizedBox(height: 4),
          ],
          Text(
            value,
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: tint),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(fontSize: 10.5, color: AppColors.textMuted),
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
  // Nullable pour la meme raison que `StatCard.color` : une valeur par defaut
  // de parametre doit etre constante.
  Color? color,
  IconData? icon,
  bool dense = false,
}) {
  final tint = color ?? AppColors.primary;
  return ElevatedButton(
    style: ElevatedButton.styleFrom(
      backgroundColor: tint,
      foregroundColor: Colors.white,
      disabledBackgroundColor: tint.withAlpha(70),
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
          // Cloche en haut de chaque espace professionnel (pharmacie, livreur,
          // praticien, admin). Elle est placee ici plutot que dans chaque
          // ecran : ces quatre ecrans partagent cet en-tete, et c'est
          // justement le pharmacien qui doit voir ses notifications sans avoir
          // a revenir a l'accueil.
          const NotificationBell(),
          if (trailing != null) trailing,
        ],
      ),
      if (subtitle != null && subtitle.isNotEmpty) ...[
        const SizedBox(height: 4),
        Text(
          subtitle,
          style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
        ),
      ],
    ],
  );
}

/// Onglets segmentés (icône + libellé) pour les espaces.
///
/// Avec [scrollable] (admin : 5 onglets), les onglets gardent une largeur
/// lisible et défilent horizontalement au lieu d'être tronqués.
Widget segmentedTabs({
  required List<String> labels,
  required List<IconData> icons,
  required int selected,
  required ValueChanged<int> onChanged,
  bool scrollable = false,
}) {
  Widget item(int i) {
    final sel = selected == i;
    return GestureDetector(
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
    );
  }

  final row = Row(
    children: [
      for (var i = 0; i < labels.length; i++)
        if (scrollable)
          SizedBox(width: 112, child: item(i))
        else
          Expanded(child: item(i)),
    ],
  );

  return Container(
    padding: const EdgeInsets.all(4),
    decoration: BoxDecoration(
      color: AppColors.surfaceLight,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: AppColors.border),
    ),
    child: scrollable
        ? SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: row,
          )
        : row,
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
          Icon(Icons.cloud_off, size: 40, color: AppColors.textMuted),
          const SizedBox(height: 12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textSecondary),
          ),
          const SizedBox(height: 16),
          actionButton(L10n.c('common.retry'), onRetry, icon: Icons.refresh),
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
        style: TextStyle(color: AppColors.textSecondary),
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

