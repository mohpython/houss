import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/models/pharmacy.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/location_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';

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
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            colors: [Color(0xFF1E1B4B), AppColors.background],
            radius: 1.4,
            center: Alignment.topCenter,
          ),
        ),
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
                              'Espace Patient',
                              style: TextStyle(
                                fontSize: 13,
                                color: AppColors.accent,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Row(
                        children: [
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
                  const Text(
                    'Services',
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
                    children: const [
                      _ServiceTile(
                        icon: Icons.description,
                        label: 'Ordonnances',
                        route: '/prescriptions',
                      ),
                      _ServiceTile(
                        icon: Icons.local_pharmacy,
                        label: 'Réservations',
                        route: '/reservations',
                      ),
                      _ServiceTile(
                        icon: Icons.local_shipping,
                        label: 'Suivi livraison',
                        route: '/suivi',
                      ),
                      _ServiceTile(
                        icon: Icons.medical_services,
                        label: 'Sans ordonnance',
                        route: '/otc',
                      ),
                    ],
                  ),
                  const SizedBox(height: 28),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Pharmacies recommandées',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      if (_pharmacies != null && _pharmacies!.isNotEmpty)
                        Text(
                          '${_pharmacies!.length} prox.',
                          style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
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
                      message: 'Aucune pharmacie trouvée pour le moment.',
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
            style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
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
        gradient: const LinearGradient(
          colors: [Color(0xFF1A1D3A), Color(0xFF121528)],
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
                  color: AppColors.primary.withAlpha(40),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.bolt, size: 14, color: AppColors.accent),
                    const SizedBox(width: 4),
                    Text(
                      'IA Instantanée',
                      style: TextStyle(fontSize: 12, color: AppColors.accent, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              const Text(
                'Bamako, Mali',
                style: TextStyle(fontSize: 12, color: AppColors.textMuted),
              ),
            ],
          ),
          const SizedBox(height: 18),
          const Text(
            'Une ordonnance à faire préparer ?',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, height: 1.2),
          ),
          const SizedBox(height: 12),
          const Text(
            'Prenez une photo. Notre IA identifie vos médicaments et trouve l\'officine de garde.',
            style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 22),
          Container(
            width: double.infinity,
            height: 54,
            decoration: AppTheme.gradientButton,
            child: ElevatedButton.icon(
              onPressed: () => context.push('/scan'),
              icon: const Icon(Icons.camera_alt, size: 20, color: Colors.white),
              label: const Text('Scanner mon ordonnance'),
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
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
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
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Text(
                  pharmacy.address.isEmpty
                      ? '${pharmacy.neighborhood} — ${pharmacy.statusLabel}'
                      : '${pharmacy.address} — ${pharmacy.statusLabel}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                ),
              ],
            ),
          ),
          // Sans position GPS, le serveur ne renvoie pas de distance.
          if (pharmacy.distanceKm > 0)
            Text(
              pharmacy.distanceLabel,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: AppColors.accent,
              ),
            ),
        ],
      ),
    );
  }
}
