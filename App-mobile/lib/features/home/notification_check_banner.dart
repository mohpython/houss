import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/services/unread_store.dart';
import 'package:saha_sante/core/theme/app_colors.dart';

/// Coche verte en tete d'accueil, facon WhatsApp.
///
/// Elle rappelle qu'il y a du neuf a lire sans avoir a viser une icone, et elle
/// disparait des qu'il n'y a plus rien de non lu : l'accueil ne porte jamais
/// de bandeau decoratif.
class NotificationCheckBanner extends StatefulWidget {
  const NotificationCheckBanner({super.key});

  @override
  State<NotificationCheckBanner> createState() => _NotificationCheckBannerState();
}

class _NotificationCheckBannerState extends State<NotificationCheckBanner> {
  @override
  void initState() {
    super.initState();
    // Le compteur est partage : on ne le recharge que si personne ne l'a fait.
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
        final unread = UnreadStore.instance.count;
        if (!UnreadStore.instance.loaded || unread <= 0) {
          return const SizedBox.shrink();
        }

        return Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Material(
            color: AppColors.primary,
            borderRadius: BorderRadius.circular(16),
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () => context.push('/notifications'),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                child: Row(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.onPrimary.withValues(alpha: 0.16),
                      ),
                      child: Icon(Icons.check, size: 20, color: AppColors.onPrimary),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        L10n.tArgs(context, 'unreadNotifications', {
                          'count': '$unread',
                        }),
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.onPrimary,
                        ),
                      ),
                    ),
                    Icon(Icons.chevron_right, size: 20, color: AppColors.onPrimary),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}