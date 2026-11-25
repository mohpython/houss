import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/config/app_config.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/models/pharmacy.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/delivery_location_store.dart';
import 'package:saha_sante/core/services/location_service.dart';
import 'package:saha_sante/core/services/unread_store.dart';
import 'package:saha_sante/core/services/voice_service.dart';
import 'package:saha_sante/features/home/notification_check_banner.dart';

/// Palette « SAHA 3D » de l'accueil : vert profond, verre, accents menthe.
///
/// Elle est volontairement fixe (independante du theme clair/sombre) : la
/// maquette validee est un tableau de bord sombre, et les icones 3D ont ete
/// rendues pour ce fond. Les autres ecrans gardent leur theme.
class _C {
  _C._();

  static const bg = Color(0xFF04150F);
  static const card = Color(0xFF0A2A20);
  static const cardSoft = Color(0xCC0A2A20);
  static const border = Color(0x331F7A57);
  static const borderStrong = Color(0x661F7A57);
  static const mint = Color(0xFF34E3A4);
  static const mintSoft = Color(0xFF9AD9C2);
  static const text = Color(0xFFF4FBF7);
  static const muted = Color(0xFF8FB8A8);
  static const yellow = Color(0xFFFACC15);
  static const danger = Color(0xFFEF4444);
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<Pharmacy>? _pharmacies;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Voix : lit l'accueil (« Une ordonnance à faire préparer ? » + les services).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      VoiceService.instance.speak(
        [
          L10n.c('home.heroTitle'),
          L10n.c('home.heroDesc'),
          L10n.c('home.scanCta'),
        ].join('. '),
      );
    });
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      // La position est facultative : sans GPS, le serveur renvoie l'annuaire.
      final position = await LocationService.current();
      final data = await ApiService.instance.getPharmacies(
        lat: position?.latitude,
        lng: position?.longitude,
      );
      if (!mounted) return;
      setState(() {
        _pharmacies = data;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = L10n.c('home.loadFailed');
        _loading = false;
      });
    }
  }

  String get _locationLabel {
    final saved = DeliveryLocationStore.instance.neighborhoodName;
    if (saved != null && saved.trim().isNotEmpty) return saved;
    return 'Bamako, Mali';
  }

  void _openSearch() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _SearchSheet(
        pharmacies: _pharmacies ?? const [],
        locationLabel: _locationLabel,
      ),
    );
  }

  Future<void> _openWhatsApp() async {
    final uri = Uri.parse(AppConfig.waMeUrl(L10n.c('home.assistanceMessage')));
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    final pharmacies = _pharmacies ?? const <Pharmacy>[];

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: _C.bg,
      ),
      child: Scaffold(
        backgroundColor: _C.bg,
        body: Stack(
          children: [
            const Positioned(
              top: -130,
              right: -90,
              child: _Glow(size: 340, color: Color(0x5534E3A4)),
            ),
            const Positioned(
              top: 300,
              left: -120,
              child: _Glow(size: 300, color: Color(0x3314B8A6)),
            ),
            const Positioned(
              bottom: -100,
              right: -80,
              child: _Glow(size: 260, color: Color(0x2210B981)),
            ),
            SafeArea(
              bottom: false,
              child: RefreshIndicator(
                color: _C.mint,
                backgroundColor: _C.card,
                onRefresh: _load,
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(18, 10, 18, 120),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Header(
                        locationLabel: _locationLabel,
                        onSearch: _openSearch,
                        onLocation: () => context.push('/pharmacies'),
                      ),
                      const SizedBox(height: 18),
                      _HeroCard(onScan: () => context.push('/scan')),
                      const SizedBox(height: 26),
                      _SectionHeader(
                        title: L10n.t(context, 'home.services'),
                        action: L10n.t(context, 'home.seeAll'),
                        onAction: _openSearch,
                      ),
                      const SizedBox(height: 12),
                      _ServicesGrid(onWhatsApp: _openWhatsApp),
                      const SizedBox(height: 26),
                      _SectionHeader(
                        title: L10n.t(context, 'home.recommended'),
                        trailing: pharmacies.isEmpty
                            ? null
                            : L10n.tArgs(context, 'home.nearby', {
                                'count': '${pharmacies.length}',
                              }),
                      ),
                      const SizedBox(height: 12),
                      if (_loading)
                        const Padding(
                          padding: EdgeInsets.all(28),
                          child: Center(
                            child: CircularProgressIndicator(color: _C.mint),
                          ),
                        )
                      else if (_error != null)
                        _MessageCard(
                          icon: Icons.wifi_off_rounded,
                          message: _error!,
                          onRetry: _load,
                        )
                      else if (pharmacies.isEmpty)
                        _MessageCard(
                          icon: Icons.local_pharmacy_outlined,
                          message: L10n.t(context, 'home.noPharmacy'),
                          onRetry: _load,
                        )
                      else
                        ...pharmacies.map(
                          (p) => Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _PharmacyCard(
                              pharmacy: p,
                              onTap: () => context.push('/pharmacies'),
                            ),
                          ),
                        ),
                      const SizedBox(height: 18),
                      const NotificationCheckBanner(),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Halo radial decoratif du fond.
class _Glow extends StatelessWidget {
  const _Glow({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [color, color.withValues(alpha: 0)]),
        ),
      ),
    );
  }
}

/// En-tete : logo, nom, sous-titre, recherche et notifications.
class _Header extends StatelessWidget {
  const _Header({
    required this.locationLabel,
    required this.onSearch,
    required this.onLocation,
  });

  final String locationLabel;
  final VoidCallback onSearch;
  final VoidCallback onLocation;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: _C.mint.withValues(alpha: 0.18),
                    blurRadius: 18,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Image.asset(
                  'assets/branding/logo_mark.png',
                  fit: BoxFit.cover,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'SAHA Santé',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: _C.text,
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.4,
                      height: 1.05,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    L10n.t(context, 'home.tagline'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: _C.mintSoft,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            _RoundButton(
              asset: 'assets/icons3d/search.png',
              tooltip: L10n.t(context, 'home.searchTitle'),
              onTap: onSearch,
            ),
            const SizedBox(width: 8),
            const _BellButton(),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Flexible(
              child: _Pill(
                asset: 'assets/icons3d/person.png',
                label: L10n.t(context, 'home.patientSpace'),
                onTap: () => context.push('/profil'),
              ),
            ),
            const SizedBox(width: 10),
            Flexible(
              child: _Pill(
                icon: Icons.location_on_rounded,
                label: locationLabel,
                onTap: onLocation,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    required this.asset,
    required this.tooltip,
    required this.onTap,
  });

  final String asset;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(15),
        child: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            color: _C.cardSoft,
            borderRadius: BorderRadius.circular(15),
            border: Border.all(color: _C.borderStrong),
          ),
          child: Center(child: Image.asset(asset, width: 23, height: 23)),
        ),
      ),
    );
  }
}

class _BellButton extends StatelessWidget {
  const _BellButton();

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: UnreadStore.instance,
      builder: (context, _) {
        final unread = UnreadStore.instance.loaded
            ? UnreadStore.instance.count
            : 0;
        return InkWell(
          onTap: () => context.push('/notifications'),
          borderRadius: BorderRadius.circular(15),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: _C.cardSoft,
                  borderRadius: BorderRadius.circular(15),
                  border: Border.all(color: _C.borderStrong),
                ),
                child: Center(
                  child: Image.asset(
                    'assets/icons3d/bell.png',
                    width: 23,
                    height: 23,
                  ),
                ),
              ),
              if (unread > 0)
                Positioned(
                  right: -3,
                  top: -3,
                  child: Container(
                    constraints: const BoxConstraints(
                      minWidth: 18,
                      minHeight: 18,
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      color: _C.danger,
                      borderRadius: BorderRadius.circular(9),
                      border: Border.all(color: _C.bg, width: 2),
                    ),
                    child: Text(
                      unread > 99 ? '99+' : '$unread',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        height: 1.4,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({
    this.asset,
    this.icon,
    required this.label,
    required this.onTap,
  });

  final String? asset;
  final IconData? icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(22),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: _C.cardSoft,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: _C.borderStrong),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (asset != null)
              Image.asset(asset!, width: 20, height: 20)
            else
              Icon(icon, size: 18, color: _C.mint),
            const SizedBox(width: 7),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: _C.text,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Carte hero : accroche IA + illustration 3D + bouton scanner.
class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.onScan});

  final VoidCallback onScan;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0F5E43), Color(0xFF0A3527)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: const Color(0x552EE59D)),
        boxShadow: [
          BoxShadow(
            color: _C.mint.withValues(alpha: 0.16),
            blurRadius: 30,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: Stack(
          children: [
            const Positioned(top: -8, right: -8, child: _HeroArt()),
            Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Image.asset(
                        'assets/icons3d/robot.png',
                        width: 34,
                        height: 34,
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 9,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.22),
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.auto_awesome,
                              size: 13,
                              color: _C.yellow,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              L10n.t(context, 'home.aiInstant'),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Padding(
                    padding: const EdgeInsets.only(right: 92),
                    child: _HeroTitle(),
                  ),
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.only(right: 74),
                    child: Text(
                      L10n.t(context, 'home.heroDesc'),
                      style: const TextStyle(
                        color: _C.mintSoft,
                        fontSize: 12.5,
                        height: 1.35,
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  _ScanButton(onTap: onScan),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroTitle extends StatelessWidget {
  const _HeroTitle();

  @override
  Widget build(BuildContext context) {
    final title = L10n.t(context, 'home.heroTitle');
    final highlight = L10n.t(context, 'home.heroHighlight');
    const base = TextStyle(
      color: _C.text,
      fontSize: 25,
      fontWeight: FontWeight.w800,
      height: 1.15,
      letterSpacing: -0.4,
    );
    if (highlight.isEmpty || !title.contains(highlight)) {
      return Text(title, style: base);
    }
    final index = title.indexOf(highlight);
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(text: title.substring(0, index)),
          TextSpan(
            text: highlight,
            style: const TextStyle(color: _C.yellow),
          ),
          TextSpan(text: title.substring(index + highlight.length)),
        ],
      ),
      style: base,
    );
  }
}

/// Illustration composee a partir des icones 3D (ordonnance, sirop, gelule).
class _HeroArt extends StatelessWidget {
  const _HeroArt();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 122,
      height: 142,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            top: 4,
            left: 8,
            child: Transform.rotate(
              angle: -0.10,
              child: Image.asset(
                'assets/icons3d/rx.png',
                width: 88,
                height: 88,
              ),
            ),
          ),
          Positioned(
            right: 0,
            bottom: 6,
            child: Transform.rotate(
              angle: 0.12,
              child: Image.asset(
                'assets/icons3d/bottle.png',
                width: 48,
                height: 48,
              ),
            ),
          ),
          Positioned(
            left: 2,
            bottom: 2,
            child: Transform.rotate(
              angle: -0.45,
              child: Image.asset(
                'assets/icons3d/pill.png',
                width: 42,
                height: 42,
              ),
            ),
          ),
          const Positioned(
            top: 0,
            right: 8,
            child: Icon(Icons.auto_awesome, size: 16, color: _C.yellow),
          ),
        ],
      ),
    );
  }
}

class _ScanButton extends StatelessWidget {
  const _ScanButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 54,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF34E3A4), Color(0xFF10B981)],
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
        borderRadius: BorderRadius.circular(27),
        boxShadow: [
          BoxShadow(
            color: _C.mint.withValues(alpha: 0.30),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(27),
          child: Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.camera_alt_rounded,
                  size: 21,
                  color: Color(0xFF04291C),
                ),
                const SizedBox(width: 9),
                Flexible(
                  child: Text(
                    L10n.t(context, 'home.scanCta'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFF04291C),
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    this.action,
    this.onAction,
    this.trailing,
  });

  final String title;
  final String? action;
  final VoidCallback? onAction;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: _C.text,
              fontSize: 20,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.3,
            ),
          ),
        ),
        if (action != null && onAction != null)
          InkWell(
            onTap: onAction,
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
              child: Row(
                children: [
                  Text(
                    action!,
                    style: const TextStyle(
                      color: _C.mint,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const Icon(
                    Icons.chevron_right_rounded,
                    size: 17,
                    color: _C.mint,
                  ),
                ],
              ),
            ),
          ),
        if (trailing != null)
          Text(
            trailing!,
            style: const TextStyle(
              color: _C.mintSoft,
              fontSize: 11.5,
              fontWeight: FontWeight.w500,
            ),
          ),
      ],
    );
  }
}

/// Les 8 services, sur deux lignes de 4 comme la maquette.
class _ServicesGrid extends StatelessWidget {
  const _ServicesGrid({required this.onWhatsApp});

  final VoidCallback onWhatsApp;

  @override
  Widget build(BuildContext context) {
    final items = <_ServiceData>[
      _ServiceData(
        label: L10n.t(context, 'home.prescriptions'),
        asset: 'assets/icons3d/rx.png',
        route: '/prescriptions',
      ),
      _ServiceData(
        label: L10n.t(context, 'home.pharmacies'),
        asset: 'assets/icons3d/pharmacy.png',
        route: '/pharmacies',
      ),
      _ServiceData(
        label: L10n.t(context, 'home.appointments'),
        asset: 'assets/icons3d/calendar.png',
        route: '/health',
      ),
      _ServiceData(
        label: L10n.t(context, 'home.otc'),
        asset: 'assets/icons3d/basket.png',
        route: '/otc',
      ),
      _ServiceData(
        label: L10n.t(context, 'home.tracking'),
        asset: 'assets/icons3d/scooter.png',
        route: '/suivi',
      ),
      _ServiceData(
        label: L10n.t(context, 'home.orders'),
        asset: 'assets/icons3d/folder.png',
        route: '/reservations',
      ),
      _ServiceData(
        label: L10n.t(context, 'home.assistance'),
        asset: 'assets/icons3d/support.png',
        onTap: onWhatsApp,
      ),
      _ServiceData(
        label: L10n.t(context, 'navProfile'),
        asset: 'assets/icons3d/person.png',
        route: '/profil',
      ),
    ];

    return GridView.count(
      crossAxisCount: 4,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 0.80,
      children: items,
    );
  }
}

class _ServiceData extends StatelessWidget {
  const _ServiceData({
    required this.label,
    required this.asset,
    this.route,
    this.onTap,
  });

  final String label;
  final String asset;
  final String? route;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap ?? () => context.push(route!),
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 10),
        decoration: BoxDecoration(
          color: _C.cardSoft,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: _C.border),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset(asset, width: 40, height: 40),
            const SizedBox(height: 7),
            Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: _C.text,
                fontSize: 10.5,
                height: 1.15,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PharmacyCard extends StatelessWidget {
  const _PharmacyCard({required this.pharmacy, required this.onTap});

  final Pharmacy pharmacy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: _C.cardSoft,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: _C.border),
        ),
        child: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(14),
              ),
              padding: const EdgeInsets.all(4),
              child: Image.asset('assets/icons3d/pharmacy.png'),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    pharmacy.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: _C.text,
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    pharmacy.address.isEmpty
                        ? '${pharmacy.neighborhood} — ${pharmacy.statusLabel}'
                        : '${pharmacy.address} — ${pharmacy.statusLabel}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: _C.muted, fontSize: 11.5),
                  ),
                ],
              ),
            ),
            if (pharmacy.distanceKm > 0) ...[
              const SizedBox(width: 8),
              Row(
                children: [
                  const Icon(
                    Icons.location_on_rounded,
                    size: 13,
                    color: _C.mint,
                  ),
                  const SizedBox(width: 2),
                  Text(
                    pharmacy.distanceLabel,
                    style: const TextStyle(
                      color: _C.mint,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(width: 2),
            const Icon(Icons.chevron_right_rounded, size: 20, color: _C.muted),
          ],
        ),
      ),
    );
  }
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({
    required this.icon,
    required this.message,
    required this.onRetry,
  });

  final IconData icon;
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: _C.cardSoft,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _C.border),
      ),
      child: Column(
        children: [
          Icon(icon, size: 34, color: _C.muted),
          const SizedBox(height: 10),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: _C.mintSoft, fontSize: 12.5),
          ),
          const SizedBox(height: 6),
          TextButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded, color: _C.mint),
            label: Text(
              L10n.c('common.retry'),
              style: const TextStyle(color: _C.mint),
            ),
          ),
        ],
      ),
    );
  }
}

/// Recherche rapide : services + pharmacies partenaires.
class _SearchSheet extends StatefulWidget {
  const _SearchSheet({required this.pharmacies, required this.locationLabel});

  final List<Pharmacy> pharmacies;
  final String locationLabel;

  @override
  State<_SearchSheet> createState() => _SearchSheetState();
}

class _SearchSheetState extends State<_SearchSheet> {
  final _controller = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _go(String route) {
    final router = GoRouter.of(context);
    Navigator.of(context).pop();
    router.push(route);
  }

  Future<void> _whatsapp() async {
    final uri = Uri.parse(AppConfig.waMeUrl(L10n.c('home.assistanceMessage')));
    Navigator.of(context).pop();
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final services = <_SearchItem>[
      _SearchItem(
        label: L10n.t(context, 'home.prescriptions'),
        asset: 'assets/icons3d/rx.png',
        route: '/prescriptions',
      ),
      _SearchItem(
        label: L10n.t(context, 'home.pharmacies'),
        asset: 'assets/icons3d/pharmacy.png',
        route: '/pharmacies',
      ),
      _SearchItem(
        label: L10n.t(context, 'home.appointments'),
        asset: 'assets/icons3d/calendar.png',
        route: '/health',
      ),
      _SearchItem(
        label: L10n.t(context, 'home.otc'),
        asset: 'assets/icons3d/basket.png',
        route: '/otc',
      ),
      _SearchItem(
        label: L10n.t(context, 'home.tracking'),
        asset: 'assets/icons3d/scooter.png',
        route: '/suivi',
      ),
      _SearchItem(
        label: L10n.t(context, 'home.orders'),
        asset: 'assets/icons3d/folder.png',
        route: '/reservations',
      ),
      _SearchItem(
        label: L10n.t(context, 'home.assistance'),
        asset: 'assets/icons3d/support.png',
        onTap: _whatsapp,
      ),
      _SearchItem(
        label: L10n.t(context, 'navProfile'),
        asset: 'assets/icons3d/person.png',
        route: '/profil',
      ),
    ];
    final q = _query.trim().toLowerCase();
    final filteredServices = q.isEmpty
        ? services
        : services
              .where((s) => s.label.toLowerCase().contains(q))
              .toList(growable: false);
    final filteredPharmacies = q.isEmpty
        ? widget.pharmacies.take(4).toList(growable: false)
        : widget.pharmacies
              .where(
                (p) =>
                    p.name.toLowerCase().contains(q) ||
                    p.address.toLowerCase().contains(q) ||
                    p.neighborhood.toLowerCase().contains(q),
              )
              .take(10)
              .toList(growable: false);

    return DraggableScrollableSheet(
      initialChildSize: 0.78,
      minChildSize: 0.45,
      maxChildSize: 0.94,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Color(0xFF071F17),
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
            border: Border(top: BorderSide(color: _C.borderStrong)),
          ),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: _C.muted.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 8),
                child: Row(
                  children: [
                    const Icon(Icons.search_rounded, color: _C.mint),
                    const SizedBox(width: 8),
                    Text(
                      L10n.t(context, 'home.searchTitle'),
                      style: const TextStyle(
                        color: _C.text,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close_rounded, color: _C.muted),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 18),
                child: TextField(
                  controller: _controller,
                  autofocus: true,
                  onChanged: (v) => setState(() => _query = v),
                  style: const TextStyle(color: _C.text, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: L10n.t(context, 'home.searchHint'),
                    hintStyle: const TextStyle(color: _C.muted, fontSize: 13),
                    prefixIcon: const Icon(
                      Icons.search_rounded,
                      color: _C.muted,
                    ),
                    filled: true,
                    fillColor: _C.card,
                    contentPadding: const EdgeInsets.symmetric(vertical: 12),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: const BorderSide(color: _C.border),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: const BorderSide(color: _C.border),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: const BorderSide(color: _C.mint),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(18, 6, 18, 24),
                  children: [
                    if (filteredServices.isNotEmpty) ...[
                      _SheetLabel(label: L10n.t(context, 'home.services')),
                      ...filteredServices.map(
                        (s) => _SearchRow(
                          asset: s.asset,
                          label: s.label,
                          onTap: s.onTap ?? () => _go(s.route!),
                        ),
                      ),
                    ],
                    if (filteredPharmacies.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      _SheetLabel(label: L10n.t(context, 'home.recommended')),
                      ...filteredPharmacies.map(
                        (p) => _SearchRow(
                          asset: 'assets/icons3d/pharmacy.png',
                          label: p.name,
                          subtitle: p.address.isEmpty
                              ? '${p.neighborhood} — ${p.statusLabel}'
                              : p.address,
                          onTap: () => _go('/pharmacies'),
                        ),
                      ),
                    ],
                    if (filteredServices.isEmpty && filteredPharmacies.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 30),
                        child: Column(
                          children: [
                            Image.asset(
                              'assets/icons3d/search.png',
                              width: 54,
                              height: 54,
                            ),
                            const SizedBox(height: 10),
                            Text(
                              L10n.t(context, 'home.searchEmpty'),
                              style: const TextStyle(
                                color: _C.mintSoft,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _SearchItem {
  const _SearchItem({
    required this.label,
    required this.asset,
    this.route,
    this.onTap,
  });

  final String label;
  final String asset;
  final String? route;
  final VoidCallback? onTap;
}

class _SheetLabel extends StatelessWidget {
  const _SheetLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6, top: 4),
      child: Text(
        label.toUpperCase(),
        style: const TextStyle(
          color: _C.muted,
          fontSize: 10,
          fontWeight: FontWeight.w800,
          letterSpacing: 1.1,
        ),
      ),
    );
  }
}

class _SearchRow extends StatelessWidget {
  const _SearchRow({
    required this.asset,
    required this.label,
    required this.onTap,
    this.subtitle,
  });

  final String asset;
  final String label;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 2),
        child: Row(
          children: [
            Image.asset(asset, width: 34, height: 34),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: _C.text,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: _C.muted, fontSize: 11),
                    ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: _C.muted, size: 20),
          ],
        ),
      ),
    );
  }
}
