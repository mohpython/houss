import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/models/pharmacy.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/location_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/core/widgets/notification_bell.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/features/home/notification_check_banner.dart';

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
        _error = 'Impossible de charger les pharmacies.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        // Le decor d'origine etait violet (0xFF1E1B4B) : incoherent avec le
        // vert de la marque. Meme halo que les autres ecrans, donc l'accueil ne
        // se distingue plus des autres pages.
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: _load,
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 12),
                  const NotificationCheckBanner(),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceLight,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.person_outline, size: 16),
                            const SizedBox(width: 6),
                            Text(
                              L10n.t(context, 'home.patientSpace'),
                              style: TextStyle(
                                fontSize: 13,
                                color: AppColors.primaryLight,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Row(
                        children: [
                          // Cloche en tete d'accueil, avec pastille : c'est le
                          // point d'entree le plus direct vers les notifications.
                          const NotificationBell(),
                          IconButton(
                            onPressed: () => context.push('/otc'),
                            icon: const Icon(Icons.medical_services, size: 20),
                          ),
                          IconButton(
                            onPressed: () => context.push('/health'),
                            icon: const Icon(Icons.healing, size: 20),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  const _HeroCard(),
                  const SizedBox(height: 28),
                  Text(
                    L10n.t(context, 'home.services'),
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 16),
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    childAspectRatio: 1.5,
                    children: [
                      _ServiceTile(
                        icon: Icons.description,
                        label: L10n.t(context, 'home.prescriptions'),
                        route: '/prescriptions',
                      ),
                      _ServiceTile(
                        icon: Icons.local_pharmacy,
                        label: L10n.t(context, 'home.reservations'),
                        route: '/reservations',
                      ),
                      _ServiceTile(
                        icon: Icons.local_shipping,
                        label: L10n.t(context, 'home.tracking'),
                        route: '/suivi',
                      ),
                      _ServiceTile(
                        icon: Icons.medical_services,
                        label: L10n.t(context, 'home.otc'),
                        route: '/otc',
                      ),
                    ],
                  ),
                  const SizedBox(height: 28),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        L10n.t(context, 'home.recommended'),
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      if (_pharmacies != null && _pharmacies!.isNotEmpty)
                        Text(
                          L10n.tArgs(context, 'home.nearby', {
                            'count': '${_pharmacies!.length}',
                          }),
                          style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (_loading)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: CircularProgressIndicator(),
                      ),
                    )
                  else if (_error != null)
                    _MessageCard(
                      icon: Icons.wifi_off,
                      message: _error!,
                      onRetry: _load,
                    )
                  else if (_pharmacies == null || _pharmacies!.isEmpty)
                    _MessageCard(
                      icon: Icons.local_pharmacy_outlined,
                      message: L10n.t(context, 'home.noPharmacy'),
                      onRetry: _load,
                    )
                  else
                    ..._pharmacies!.map((p) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _PharmacyCard(pharmacy: p),
                        )),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _MessageCard extends StatelessWidget {
  final IconData icon;
  final String message;
  final VoidCallback onRetry;

  const _MessageCard({
    required this.icon,
    required this.message,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: AppTheme.glassCard,
      child: Column(
        children: [
          Icon(icon, size: 36, color: AppColors.textMuted),
          const SizedBox(height: 12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 8),
          TextButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const Text('Réessayer'),
          ),
        ],
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: AppColors.border),
        // Le degrade bleu nuit codee en dur (0xFF1A1D3A) etait la seconde
        // couleur « non professionnelle » de l'accueil, apres celle de l'ecran.
        // On le remplace par le vert de la marque. Le degrade reste assez
        // sombre dans les deux themes pour garder un texte blanc lisible.
        gradient: LinearGradient(
          colors: [AppColors.primaryDeep, AppColors.primary],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  // Voile blanc et non `primary` : le fond est deja vert.
                  color: Colors.white.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.bolt, size: 14, color: Colors.white),
                    SizedBox(width: 4),
                    Text(
                      L10n.t(context, 'home.aiInstant'),
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                'Bamako, Mali',
                style: TextStyle(fontSize: 12, color: Colors.white70),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Text(
            L10n.t(context, 'home.heroTitle'),
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              height: 1.2,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            L10n.t(context, 'home.heroDesc'),
            style: TextStyle(fontSize: 14, color: Colors.white70),
          ),
          SizedBox(height: 22),
          Container(
            width: double.infinity,
            height: 54,
            decoration: AppTheme.gradientButton,
            child: ElevatedButton.icon(
              onPressed: () => context.push('/scan'),
              icon: const Icon(Icons.camera_alt, size: 20, color: Colors.white),
              label: Text(L10n.t(context, 'home.scanCta')),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.transparent,
                shadowColor: Colors.transparent,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
                textStyle: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ServiceTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String route;

  const _ServiceTile({
    required this.icon,
    required this.label,
    required this.route,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push(route),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: AppTheme.glassCard,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.primary.withAlpha(30),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: AppColors.primaryLight, size: 22),
            ),
            Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PharmacyCard extends StatelessWidget {
  final Pharmacy pharmacy;

  const _PharmacyCard({required this.pharmacy});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: AppTheme.glassCard,
      child: Row(
        children: [
          Container(
            height: 48,
            width: 48,
            decoration: BoxDecoration(
              color: pharmacy.statusColor.withAlpha(30),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(Icons.local_pharmacy, color: pharmacy.statusColor),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  pharmacy.name,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  pharmacy.address.isEmpty
                      ? '${pharmacy.neighborhood} — ${pharmacy.statusLabel}'
                      : '${pharmacy.address} — ${pharmacy.statusLabel}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                ),
              ],
            ),
          ),
          // Sans position GPS, le serveur ne renvoie pas de distance.
          if (pharmacy.distanceKm > 0)
            Text(
              pharmacy.distanceLabel,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                // `accent` etait pale en mode clair (#D9FDD3) donc invisible
                // sur une carte blanche : on prend le vert soutenu.
                color: AppColors.primaryLight,
              ),
            ),
        ],
      ),
    );
  }
}

