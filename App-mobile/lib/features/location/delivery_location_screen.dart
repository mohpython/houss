import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/models/reservation.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/location_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';

/// Choix du lieu de livraison pour une ordonnance validée.
///
/// S'ouvre depuis le message « Ordonnance validée » (fil de notifications) ou
/// depuis « Mes ordonnances ». Deux onglets, comme sur le site :
/// la position GPS actuelle, ou un autre quartier de la liste gérée par
/// l'admin, avec une précision libre (porte, rue, repère).
///
/// La confirmation appelle le routage puis ouvre le suivi. Si une commande
/// existe déjà pour cette ordonnance (message retapé, retour arrière), on
/// rouvre son suivi au lieu de créer un doublon.
class DeliveryLocationScreen extends StatefulWidget {
  final String prescriptionId;

  const DeliveryLocationScreen({super.key, required this.prescriptionId});

  @override
  State<DeliveryLocationScreen> createState() => _DeliveryLocationScreenState();
}

enum _Mode { gps, neighborhood }

class _DeliveryLocationScreenState extends State<DeliveryLocationScreen> {
  final _detailController = TextEditingController();
  final _searchController = TextEditingController();

  bool _checking = true;
  _Mode _mode = _Mode.gps;

  // Position GPS.
  bool _locating = false;
  Position? _position;

  // Quartiers.
  List<Map<String, dynamic>>? _neighborhoods;
  Map<String, dynamic>? _selected;

  /// Étape 1 : domicile (livrée) ou retrait. Transmis à l'étape 2 (devis)
  /// puis appliqué à la création : le retrait ne facture aucun frais.
  String _fulfillment = 'delivery';

  @override
  void initState() {
    super.initState();
    _checkExisting();
    _locate();
    _loadNeighborhoods();
    _searchController.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _detailController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  /// Une commande existe-t-elle déjà pour cette ordonnance ? Si oui, on ouvre
  /// son suivi : retaper le message « Ordonnance validée » ne doit pas
  /// commander deux fois les mêmes médicaments.
  Future<void> _checkExisting() async {
    try {
      final orders = await ApiService.instance.getReservations();
      if (!mounted) return;
      Reservation? existing;
      for (final o in orders) {
        if (o.prescriptionId == widget.prescriptionId &&
            o.status != ReservationStatus.cancelled) {
          existing = o;
          break;
        }
      }
      if (existing != null) {
        context.go('/suivi/${existing.id}');
        return;
      }
    } on ApiException {
      // Vérification seulement : un échec réseau ne doit pas bloquer l'écran,
      // la confirmation échouera proprement si vraiment hors-ligne.
    } catch (_) {
      // Idem.
    }
    if (mounted) setState(() => _checking = false);
  }

  Future<void> _locate() async {
    if (mounted) setState(() => _locating = true);
    final pos = await LocationService.current();
    if (!mounted) return;
    setState(() {
      _locating = false;
      _position = pos;
    });
  }

  Future<void> _loadNeighborhoods() async {
    try {
      final nbs = await ApiService.instance.getNeighborhoods();
      if (!mounted) return;
      setState(() => _neighborhoods = nbs);
    } catch (_) {
      if (!mounted) return;
      setState(() => _neighborhoods = const []);
    }
  }

  List<Map<String, dynamic>> get _filtered {
    final q = _searchController.text.trim().toLowerCase();
    final nbs = _neighborhoods ?? const <Map<String, dynamic>>[];
    if (q.isEmpty) return nbs;
    return nbs.where((n) {
      final name = ((n['name'] as String?) ?? '').toLowerCase();
      final city = ((n['city'] as String?) ?? '').toLowerCase();
      return name.contains(q) || city.contains(q);
    }).toList();
  }

  bool get _canConfirm {
    if (_mode == _Mode.gps) return _position != null;
    return _selected != null;
  }

  /// Étape 1 validée : on passe à l'étape 2 (pharmacies classées) en lui
  /// transmettant lieu + mode dans l'URL, pour que chaque écran reste
  /// ouvrable par lien (notification, historique).
  void _confirm() {
    if (!_canConfirm) return;
    final detail = _detailController.text.trim();
    final params = <String, String>{
      'fulfillment': _fulfillment,
      if (detail.isNotEmpty) 'address': detail,
    };
    if (_mode == _Mode.gps) {
      params['mode'] = 'gps';
      params['lat'] = '${_position!.latitude}';
      params['lng'] = '${_position!.longitude}';
    } else {
      params['mode'] = 'neighborhood';
      params['neighborhoodId'] = _selected!['id'] as String;
    }
    context.push(
      '/pharmacies/${widget.prescriptionId}?${Uri(queryParameters: params).query}',
    );
  }

  void _setMode(_Mode mode) {
    if (_mode == mode) return;
    setState(() {
      _mode = mode;
      if (mode == _Mode.gps && _position == null && !_locating) {
        _locate();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    return Scaffold(
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 16),
                Row(
                  children: [
                    IconButton(
                      onPressed: () => context.pop(),
                      icon: const Icon(Icons.arrow_back),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        L10n.t(context, 'delivery.title'),
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  L10n.t(context, 'delivery.hint'),
                  style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
                ),
                const SizedBox(height: 20),
                if (_checking)
                  const Expanded(child: Center(child: CircularProgressIndicator()))
                else
                  Expanded(
                    child: SingleChildScrollView(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _Tabs(mode: _mode, onChanged: _setMode),
                          const SizedBox(height: 16),
                          if (_mode == _Mode.gps) _gpsPanel() else _neighborhoodPanel(),
                          const SizedBox(height: 16),
                          TextField(
                            controller: _detailController,
                            maxLength: 200,
                            decoration: InputDecoration(
                              labelText: L10n.t(context, 'delivery.detail'),
                              hintText: L10n.t(context, 'delivery.detailHint'),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                          ),
                          const SizedBox(height: 20),
                          Text(
                            L10n.t(context, 'delivery.fulfillment'),
                            style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              _Tab(
                                icon: Icons.two_wheeler,
                                label: L10n.t(context, 'delivery.homeDelivery'),
                                selected: _fulfillment == 'delivery',
                                onTap: () => setState(() => _fulfillment = 'delivery'),
                              ),
                              const SizedBox(width: 8),
                              _Tab(
                                icon: Icons.storefront,
                                label: L10n.t(context, 'delivery.pickupSelf'),
                                selected: _fulfillment == 'pickup',
                                onTap: () => setState(() => _fulfillment = 'pickup'),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          SizedBox(
                            width: double.infinity,
                            height: 56,
                            child: ElevatedButton.icon(
                              onPressed: _canConfirm ? _confirm : null,
                              icon: const Icon(Icons.storefront, color: Colors.white),
                              label: Text(L10n.t(context, 'delivery.seePharmacies')),
                            ),
                          ),
                          const SizedBox(height: 24),
                        ],
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

  Widget _gpsPanel() {
    if (_locating) {
      return _Panel(
        child: Row(
          children: [
            const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(L10n.t(context, 'delivery.locating'))),
          ],
        ),
      );
    }
    if (_position != null) {
      return _Panel(
        ok: true,
        child: Row(
          children: [
            Icon(Icons.check_circle, color: AppColors.success),
            const SizedBox(width: 12),
            Expanded(child: Text(L10n.t(context, 'delivery.positionOk'))),
          ],
        ),
      );
    }
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            L10n.t(context, 'delivery.geoDenied'),
            style: TextStyle(color: AppColors.danger),
          ),
          const SizedBox(height: 8),
          TextButton.icon(
            onPressed: _locate,
            icon: const Icon(Icons.refresh, size: 18),
            label: Text(L10n.t(context, 'delivery.retryGeo')),
          ),
        ],
      ),
    );
  }

  Widget _neighborhoodPanel() {
    final nbs = _neighborhoods;
    if (nbs == null) {
      return const _Panel(
        child: Center(
          child: SizedBox(
            height: 20,
            width: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }
    final sel = _selected;
    if (sel != null) {
      return _Panel(
        ok: true,
        child: Row(
          children: [
            Icon(Icons.check_circle, color: AppColors.success),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                (sel['name'] as String?) ?? '',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
            TextButton(
              onPressed: () => setState(() => _selected = null),
              child: Text(L10n.t(context, 'delivery.change')),
            ),
          ],
        ),
      );
    }
    final filtered = _filtered;
    return Column(
      children: [
        TextField(
          controller: _searchController,
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search),
            hintText: L10n.t(context, 'delivery.searchNeighborhood'),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Container(
          constraints: const BoxConstraints(maxHeight: 240),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: filtered.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    L10n.t(context, 'delivery.noNeighborhood'),
                    style: TextStyle(color: AppColors.textMuted),
                  ),
                )
              : ListView.separated(
                  shrinkWrap: true,
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => Divider(
                    height: 1,
                    color: AppColors.border,
                  ),
                  itemBuilder: (context, i) {
                    final n = filtered[i];
                    final name = (n['name'] as String?) ?? '';
                    final city = (n['city'] as String?) ?? '';
                    return ListTile(
                      leading: Icon(Icons.location_on_outlined,
                          color: AppColors.textMuted),
                      title: Text(name),
                      subtitle: city.isEmpty ? null : Text(city),
                      onTap: () => setState(() => _selected = n),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

/// Onglets « Ma position » / « Autre quartier ».
class _Tabs extends StatelessWidget {
  final _Mode mode;
  final ValueChanged<_Mode> onChanged;

  const _Tabs({required this.mode, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          _Tab(
            icon: Icons.my_location,
            label: L10n.t(context, 'delivery.myPosition'),
            selected: mode == _Mode.gps,
            onTap: () => onChanged(_Mode.gps),
          ),
          _Tab(
            icon: Icons.location_city_outlined,
            label: L10n.t(context, 'delivery.otherNeighborhood'),
            selected: mode == _Mode.neighborhood,
            onTap: () => onChanged(_Mode.neighborhood),
          ),
        ],
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _Tab({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: selected ? AppColors.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(24),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 18,
                color: selected ? Colors.white : AppColors.textSecondary,
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
                    color: selected ? Colors.white : AppColors.textSecondary,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  final Widget child;
  final bool ok;

  const _Panel({required this.child, this.ok = false});

  @override
  Widget build(BuildContext context) {
    final accent = ok ? AppColors.success : AppColors.textMuted;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: ok ? accent.withAlpha(120) : AppColors.border,
          width: ok ? 1.2 : 1,
        ),
      ),
      child: child,
    );
  }
}
