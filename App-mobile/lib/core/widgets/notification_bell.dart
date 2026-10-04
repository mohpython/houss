import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/services/unread_store.dart';
import 'package:saha_sante/core/theme/app_colors.dart';

/// Cloche de notifications avec pastille, facon WhatsApp.
///
/// La pastille se met a jour toute seule : elle ecoute [UnreadStore], partage
/// avec l'ecran notifications. Sans cela, marquer une notification comme lue
/// laisserait le chiffre affiche sur l'accueil jusqu'au prochain
/// redemarrage de l'application.
class NotificationBell extends StatefulWidget {
  const NotificationBell({super.key, this.iconSize = 22});

  final double iconSize;

  @override
  State<NotificationBell> createState() => _NotificationBellState();
}

class _NotificationBellState extends State<NotificationBell> {
  @override
  void initState() {
    super.initState();
    if (!UnreadStore.instance.loaded) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) UnreadStore.instance.refresh();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: UnreadStore.instance,
      builder: (context, _) {
        final unread = UnreadStore.instance.loaded ? UnreadStore.instance.count : 0;

        return Stack(
          clipBehavior: Clip.none,
          children: [
            IconButton(
              onPressed: () => context.push('/notifications'),
              icon: Icon(Icons.notifications_none, size: widget.iconSize),
              tooltip: L10n.t(context, 'notifications'),
            ),
            if (unread > 0)
              Positioned(
                right: 4,
                top: 4,
                child: _Badge(count: unread),
              ),
          ],
        );
      },
    );
  }
}

/// Pastille de compteur. Au-dela de 99 on affiche « 99+ » plutot qu'un nombre
/// qui deborderait de la pastille.
class _Badge extends StatelessWidget {
  const _Badge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final label = count > 99 ? '99+' : '$count';
    return Container(
      constraints: const BoxConstraints(minWidth: 17, minHeight: 17),
      padding: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(
        color: AppColors.danger,
        borderRadius: BorderRadius.circular(9),
        // Léger liseré de la couleur du fond : la pastille reste lisible meme
        // posee sur une icone claire.
        border: Border.all(color: AppColors.background, width: 1.5),
      ),
      child: Text(
        label,
        textAlign: TextAlign.center,
        style: TextStyle(
          // Texte tres sombre sur la pastille claire du mode sombre : le blanc
          // n'y montait qu'a 3,2:1, trop peu pour un chiffre de 10 px.
          color: AppColors.onDanger,
          fontSize: 10,
          fontWeight: FontWeight.w700,
          height: 1.3,
        ),
      ),
    );
  }
}