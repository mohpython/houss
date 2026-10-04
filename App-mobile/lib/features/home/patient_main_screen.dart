import 'package:flutter/material.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/services/auth_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/features/admin/admin_space_screen.dart';
import 'package:saha_sante/features/courier/courier_space_screen.dart';
import 'package:saha_sante/features/home/home_screen.dart';
import 'package:saha_sante/features/pharmacy/pharmacy_space_screen.dart';
import 'package:saha_sante/features/practitioner/practitioner_space_screen.dart';
import 'package:saha_sante/features/profile/profile_screen.dart';
import 'package:saha_sante/features/scan/scan_screen.dart';
import 'package:saha_sante/features/tracking/tracking_screen.dart';

/// Écran principal : menu du bas construit selon le rôle de l'utilisateur.
///
/// Un compte qui possède un espace professionnel (pharmacie, livreur,
/// praticien, admin) voit un onglet supplémentaire qui mène à SON espace —
/// chaque compte a donc son propre interface, comme sur le site web.
class PatientMainScreen extends StatefulWidget {
  const PatientMainScreen({super.key});

  @override
  State<PatientMainScreen> createState() => _PatientMainScreenState();
}

class _PatientMainScreenState extends State<PatientMainScreen> {
  int _currentIndex = 0;

  /// Espace professionnel du compte connecté (priorité : admin > pharmacie >
  /// livreur > praticien).
  static ({Widget page, String labelKey, IconData icon})? _spaceFor(Set<String> roles) {
    if (roles.contains('admin')) {
      return (
        page: const AdminSpaceScreen(),
        labelKey: 'navAdmin',
        icon: Icons.admin_panel_settings_outlined,
      );
    }
    if (roles.contains('pharmacy_staff')) {
      return (
        page: const PharmacySpaceScreen(),
        labelKey: 'navPharmacy',
        icon: Icons.local_pharmacy_outlined,
      );
    }
    if (roles.contains('courier')) {
      return (
        page: const CourierSpaceScreen(),
        labelKey: 'navCourier',
        icon: Icons.delivery_dining_outlined,
      );
    }
    if (roles.contains('doctor') || roles.contains('nurse')) {
      return (
        page: const PractitionerSpaceScreen(),
        labelKey: 'navPractitioner',
        icon: Icons.medical_services_outlined,
      );
    }
    return null;
  }

  /// Recalcule la barre du bas à partir des rôles **actuels**.
  ///
  /// Ne JAMAIS figer ceci dans `initState` : après une connexion Google par
  /// lien profond, les rôles arrivent via `/me` quelques centaines de ms après
  /// le jeton. Si l'écran était construit avant, l'onglet admin/pharmacie
  /// restait invisible jusqu'à un redémarrage (où `restore()` précharge `/me`).
  ({List<Widget> pages, List<IconData> icons, String spaceLabelKey}) _tabsFor(
    Set<String> roles,
  ) {
    final space = _spaceFor(roles);
    return (
      pages: [
        const HomeScreen(),
        const ScanScreen(),
        const TrackingScreen(),
        if (space != null) space.page,
        const ProfileScreen(),
      ],
      icons: [
        Icons.home,
        Icons.camera_alt,
        Icons.local_shipping,
        if (space != null) space.icon,
        Icons.person_outline,
      ],
      spaceLabelKey: space?.labelKey ?? '',
    );
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    return ListenableBuilder(
      listenable: AuthService.instance,
      builder: (context, _) {
        final roles = (AuthService.instance.user?.roles ?? const <String>[]).toSet();
        final tabs = _tabsFor(roles);
        if (_currentIndex >= tabs.pages.length) _currentIndex = tabs.pages.length - 1;
        final labels = [
          L10n.t(context, 'navHome'),
          L10n.t(context, 'navScan'),
          L10n.t(context, 'navTrack'),
          if (tabs.spaceLabelKey.isNotEmpty) L10n.t(context, tabs.spaceLabelKey),
          L10n.t(context, 'navProfile'),
        ];

        return Scaffold(
          body: tabs.pages[_currentIndex],
          bottomNavigationBar: Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              border: Border(
                top: BorderSide(color: AppColors.border),
              ),
            ),
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: List.generate(tabs.pages.length, (index) {
                    final selected = _currentIndex == index;
                    return GestureDetector(
                      onTap: () => setState(() => _currentIndex = index),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: selected ? AppColors.primary.withAlpha(40) : Colors.transparent,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Icon(
                              tabs.icons[index],
                              color: selected ? AppColors.primaryLight : AppColors.textMuted,
                              size: 22,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            labels[index],
                            style: TextStyle(
                              fontSize: 11,
                              color: selected ? AppColors.primaryLight : AppColors.textMuted,
                              fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
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
