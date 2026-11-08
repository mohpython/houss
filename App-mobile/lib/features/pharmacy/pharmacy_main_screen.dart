import 'package:flutter/material.dart';
import 'package:saha_sante/core/config/app_config.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/services/auth_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/features/notifications/notifications_screen.dart';
import 'package:saha_sante/features/pharmacy/pharmacy_space_screen.dart';
import 'package:saha_sante/features/profile/profile_screen.dart';

/// Écran principal de l'application **SAHA Pharmacie**.
///
/// Contrairement à l'application patient, le menu du bas ne contient que
/// l'espace métier : commandes/stock, notifications et profil. Les écrans
/// patient (accueil, scan d'ordonnance, suivi) sont absents.
class PharmacyMainScreen extends StatefulWidget {
  const PharmacyMainScreen({super.key});

  @override
  State<PharmacyMainScreen> createState() => _PharmacyMainScreenState();
}

class _PharmacyMainScreenState extends State<PharmacyMainScreen> {
  int _currentIndex = 0;

  /// IndexedStack : l'espace pharmacie garde ses données (commandes, stock)
  /// quand on passe aux notifications ou au profil, sans recharger l'API.
  static const List<Widget> _pages = [
    PharmacySpaceScreen(),
    NotificationsScreen(),
    ProfileScreen(),
  ];

  Future<void> _signOut() => AuthService.instance.signOut();

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    return ListenableBuilder(
      listenable: AuthService.instance,
      builder: (context, _) {
        final user = AuthService.instance.user;
        final roles = (user?.roles ?? const <String>[]).toSet();
        // Tant que /me n'a pas répondu, on laisse l'espace pharmacie afficher
        // son propre état (chargement / erreur) au lieu de bloquer le compte.
        final allowed =
            user == null ||
            roles.contains('pharmacy_staff') ||
            roles.contains('admin');
        if (!allowed) return _RestrictedView(onSignOut: _signOut);

        if (_currentIndex >= _pages.length) _currentIndex = 0;
        final labels = [
          L10n.t(context, 'navPharmacy'),
          L10n.t(context, 'notifications'),
          L10n.t(context, 'navProfile'),
        ];
        const icons = [
          Icons.local_pharmacy_outlined,
          Icons.notifications_outlined,
          Icons.person_outline,
        ];

        return Scaffold(
          body: IndexedStack(index: _currentIndex, children: _pages),
          bottomNavigationBar: Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              border: Border(top: BorderSide(color: AppColors.border)),
            ),
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: List.generate(_pages.length, (index) {
                    final selected = _currentIndex == index;
                    return GestureDetector(
                      onTap: () => setState(() => _currentIndex = index),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              color: selected
                                  ? AppColors.primary.withAlpha(40)
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Icon(
                              icons[index],
                              color: selected
                                  ? AppColors.primaryLight
                                  : AppColors.textMuted,
                              size: 22,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            labels[index],
                            style: TextStyle(
                              fontSize: 11,
                              color: selected
                                  ? AppColors.primaryLight
                                  : AppColors.textMuted,
                              fontWeight: selected
                                  ? FontWeight.w600
                                  : FontWeight.normal,
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Compte connecté sans rôle pharmacie : on explique l'accès et on permet de
/// se déconnecter pour utiliser le bon compte.
class _RestrictedView extends StatelessWidget {
  const _RestrictedView({required this.onSignOut});

  final Future<void> Function() onSignOut;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.local_pharmacy_outlined,
                    size: 64,
                    color: AppColors.primaryLight,
                  ),
                  const SizedBox(height: 18),
                  Text(
                    AppConfig.appName,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    L10n.t(context, 'ph.restricted'),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 15,
                      color: AppColors.textSecondary,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 24),
                  OutlinedButton.icon(
                    onPressed: onSignOut,
                    icon: const Icon(Icons.logout, size: 18),
                    label: Text(L10n.t(context, 'signOut')),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
