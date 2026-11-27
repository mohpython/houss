import 'dart:async';

import 'package:flutter/material.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/services/auth_service.dart';
import 'package:saha_sante/features/admin/admin_space_screen.dart';
import 'package:saha_sante/features/courier/courier_space_screen.dart';
import 'package:saha_sante/features/home/home_screen.dart';
import 'package:saha_sante/features/home/whatsapp_fab.dart';
import 'package:saha_sante/features/pharmacy/pharmacy_space_screen.dart';
import 'package:saha_sante/features/practitioner/doctor_rx_portal_screen.dart';
import 'package:saha_sante/features/practitioner/practitioner_space_screen.dart';
import 'package:saha_sante/features/profile/profile_screen.dart';
import 'package:saha_sante/features/scan/scan_screen.dart';
import 'package:saha_sante/features/tracking/tracking_screen.dart';
import 'package:saha_sante/core/widgets/voice_guide_toggle.dart';

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

class _PatientMainScreenState extends State<PatientMainScreen>
    with WidgetsBindingObserver {
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Un rôle attribué par l'admin pendant que l'app est en arrière-plan
    // doit faire apparaître les nouveaux onglets au retour dans l'app.
    if (state == AppLifecycleState.resumed && AuthService.instance.isLoggedIn) {
      unawaited(AuthService.instance.refreshUser().catchError((_) {}));
    }
  }

  /// Espaces professionnels du compte connecté.
  ///
  /// Un médecin a deux entrées distinctes : « Praticien » (rendez-vous) et
  /// « e-Ordonnance » (portail de prescription ouvert dans le navigateur).
  static List<({Widget page, String labelKey, IconData icon, String asset})>
  _spacesFor(Set<String> roles) {
    final spaces =
        <({Widget page, String labelKey, IconData icon, String asset})>[];
    if (roles.contains('admin')) {
      spaces.add((
        page: const AdminSpaceScreen(),
        labelKey: 'navAdmin',
        icon: Icons.admin_panel_settings_outlined,
        asset: 'assets/icons3d/shield.png',
      ));
    }
    if (roles.contains('pharmacy_staff')) {
      spaces.add((
        page: const PharmacySpaceScreen(),
        labelKey: 'navPharmacy',
        icon: Icons.local_pharmacy_outlined,
        asset: 'assets/icons3d/pharmacy.png',
      ));
    }
    if (roles.contains('courier')) {
      spaces.add((
        page: const CourierSpaceScreen(),
        labelKey: 'navCourier',
        icon: Icons.delivery_dining_outlined,
        asset: 'assets/icons3d/scooter.png',
      ));
    }
    if (roles.contains('doctor') || roles.contains('nurse')) {
      spaces.add((
        page: const PractitionerSpaceScreen(),
        labelKey: 'navPractitioner',
        icon: Icons.medical_services_outlined,
        asset: 'assets/icons3d/stethoscope.png',
      ));
    }
    if (roles.contains('doctor')) {
      spaces.add((
        page: const DoctorRxPortalScreen(),
        labelKey: 'navERx',
        icon: Icons.description_outlined,
        asset: 'assets/icons3d/records.png',
      ));
    }
    return spaces;
  }

  /// Recalcule la barre du bas à partir des rôles **actuels**.
  ///
  /// Ne JAMAIS figer ceci dans `initState` : après une connexion Google par
  /// lien profond, les rôles arrivent via `/me` quelques centaines de ms après
  /// le jeton. Si l'écran était construit avant, l'onglet médecin restait
  /// invisible jusqu'à un redémarrage (où `restore()` précharge `/me`).
  ({
    List<Widget> pages,
    List<IconData> icons,
    List<String> labels,
    List<String?> assets,
  })
  _tabsFor(Set<String> roles) {
    final spaces = _spacesFor(roles);
    return (
      pages: [
        const HomeScreen(),
        const ScanScreen(),
        const TrackingScreen(),
        ...spaces.map((s) => s.page),
        const ProfileScreen(),
      ],
      icons: [
        Icons.home,
        Icons.camera_alt,
        Icons.local_shipping,
        ...spaces.map((s) => s.icon),
        Icons.person_outline,
      ],
      labels: [
        'navHome',
        'navScan',
        'navTrack',
        ...spaces.map((s) => s.labelKey),
        'navProfile',
      ],
      assets: [
        'assets/icons3d/home.png',
        'assets/icons3d/camera.png',
        'assets/icons3d/tracking.png',
        ...spaces.map((s) => s.asset),
        'assets/icons3d/person.png',
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    return ListenableBuilder(
      listenable: AuthService.instance,
      builder: (context, _) {
        final roles = (AuthService.instance.user?.roles ?? const <String>[])
            .toSet();
        final tabs = _tabsFor(roles);
        if (_currentIndex >= tabs.pages.length) {
          _currentIndex = tabs.pages.length - 1;
        }
        final labels = [
          for (final key in tabs.labels) L10n.t(context, key),
        ];

        return Scaffold(
          body: Stack(
            children: [
              tabs.pages[_currentIndex],
              // Bouton pause/reprise vocale flottant (façon NIAGA). Sur
              // l'accueil et le scan, il passe en bas à gauche pour ne pas
              // chevaucher le logo / la recherche ; ailleurs il reste en haut
              // à gauche.
              Positioned(
                top: (_currentIndex == 0 || _currentIndex == 1) ? null : 44,
                bottom: (_currentIndex == 0 || _currentIndex == 1) ? 16 : null,
                left: 8,
                child: const VoiceGuideToggle(),
              ),
              // Commande via WhatsApp, bouton flottant façon site : visible
              // pour tous les comptes, comme sur le site.
              const Positioned(bottom: 16, right: 16, child: WhatsAppFab()),
            ],
          ),
          // Barre flottante « verre » alignée sur la maquette 3D : fond vert
          // profond translucide, pastille menthe sur l'onglet actif.
          bottomNavigationBar: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 7),
                decoration: BoxDecoration(
                  color: const Color(0xF2071F17),
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(color: const Color(0x551F7A57)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.45),
                      blurRadius: 24,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: Row(
                  children: List.generate(tabs.pages.length, (index) {
                    final selected = _currentIndex == index;
                    final asset = tabs.assets[index];
                    return Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => setState(() => _currentIndex = index),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 180),
                          padding: const EdgeInsets.symmetric(
                            vertical: 6,
                            horizontal: 2,
                          ),
                          decoration: BoxDecoration(
                            color: selected
                                ? const Color(0x3334E3A4)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: selected
                                  ? const Color(0x7734E3A4)
                                  : Colors.transparent,
                            ),
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (asset != null)
                                asset.endsWith('shield.png')
                                    ? ColorFiltered(
                                        colorFilter: const ColorFilter.mode(
                                          Color(0xFF34E3A4),
                                          BlendMode.modulate,
                                        ),
                                        child: Image.asset(
                                          asset,
                                          width: 26,
                                          height: 26,
                                        ),
                                      )
                                    : Image.asset(asset, width: 26, height: 26)
                              else
                                Icon(
                                  tabs.icons[index],
                                  color: selected
                                      ? const Color(0xFF34E3A4)
                                      : const Color(0xFFD7EFE4),
                                  size: 24,
                                ),
                              const SizedBox(height: 4),
                              Text(
                                labels[index],
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 10,
                                  color: selected
                                      ? const Color(0xFF34E3A4)
                                      : const Color(0xFFD7EFE4),
                                  fontWeight: selected
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
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
