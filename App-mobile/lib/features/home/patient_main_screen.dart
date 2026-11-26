import 'package:flutter/material.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/services/auth_service.dart';
import 'package:saha_sante/features/admin/admin_space_screen.dart';
import 'package:saha_sante/features/courier/courier_space_screen.dart';
import 'package:saha_sante/features/home/home_screen.dart';
import 'package:saha_sante/features/home/whatsapp_fab.dart';
import 'package:saha_sante/features/pharmacy/pharmacy_space_screen.dart';
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

class _PatientMainScreenState extends State<PatientMainScreen> {
  int _currentIndex = 0;

  /// Espace professionnel du compte connecté (priorité : admin > pharmacie >
  /// livreur > praticien).
  static ({Widget page, String labelKey, IconData icon, String asset})?
  _spaceFor(Set<String> roles) {
    if (roles.contains('admin')) {
      return (
        page: const AdminSpaceScreen(),
        labelKey: 'navAdmin',
        icon: Icons.admin_panel_settings_outlined,
        asset: 'assets/icons3d/shield.png',
      );
    }
    if (roles.contains('pharmacy_staff')) {
      return (
        page: const PharmacySpaceScreen(),
        labelKey: 'navPharmacy',
        icon: Icons.local_pharmacy_outlined,
        asset: 'assets/icons3d/pharmacy.png',
      );
    }
    if (roles.contains('courier')) {
      return (
        page: const CourierSpaceScreen(),
        labelKey: 'navCourier',
        icon: Icons.delivery_dining_outlined,
        asset: 'assets/icons3d/scooter.png',
      );
    }
    if (roles.contains('doctor') || roles.contains('nurse')) {
      return (
        page: const PractitionerSpaceScreen(),
        labelKey: 'navPractitioner',
        icon: Icons.medical_services_outlined,
        asset: 'assets/icons3d/stethoscope.png',
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
  ({
    List<Widget> pages,
    List<IconData> icons,
    String spaceLabelKey,
    String? spaceAsset,
  })
  _tabsFor(Set<String> roles) {
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
      spaceAsset: space?.asset,
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
          L10n.t(context, 'navHome'),
          L10n.t(context, 'navScan'),
          L10n.t(context, 'navTrack'),
          if (tabs.spaceLabelKey.isNotEmpty)
            L10n.t(context, tabs.spaceLabelKey),
          L10n.t(context, 'navProfile'),
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
                    final asset = switch (index) {
                      0 => 'assets/icons3d/home.png',
                      1 => 'assets/icons3d/camera.png',
                      2 => 'assets/icons3d/tracking.png',
                      _ when index == tabs.pages.length - 1 =>
                        'assets/icons3d/person.png',
                      _ => tabs.spaceAsset,
                    };
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
