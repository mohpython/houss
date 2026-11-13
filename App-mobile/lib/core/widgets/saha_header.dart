import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/widgets/notification_bell.dart';

/// En-tête standard des écrans : icône « accueil » (et « retour » quand il y
/// a une page précédente), cloche de notifications et titre.
///
/// Le bouton accueil ramène sur l'écran d'accueil depuis n'importe quel écran,
/// ce qui évite de chercher la flèche retour.
class SahaHeader extends StatelessWidget {
  const SahaHeader({
    super.key,
    this.title,
    this.titleSize = 20,
    this.trailing,
  });

  final String? title;
  final double titleSize;

  /// Élément ajouté à droite (ex. bouton d'écoute vocale).
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final canPop = Navigator.of(context).canPop();
    return Row(
      children: [
        IconButton(
          onPressed: () => context.go('/home'),
          icon: const Icon(Icons.home_outlined),
          tooltip: L10n.c('navHome'),
        ),
        if (canPop)
          IconButton(
            onPressed: () => context.pop(),
            icon: const Icon(Icons.arrow_back),
            tooltip: L10n.c('common.back'),
          ),
        const NotificationBell(),
        if (title != null) ...[
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              title!,
              style: TextStyle(fontSize: titleSize, fontWeight: FontWeight.bold),
            ),
          ),
        ],
        if (trailing != null) trailing!,
      ],
    );
  }
}
