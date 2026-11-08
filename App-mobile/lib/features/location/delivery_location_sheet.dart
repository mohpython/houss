import 'package:flutter/material.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/delivery_location_store.dart';
import 'package:saha_sante/core/services/location_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';

/// Point d'entrée : feuille inférieure de choix du lieu de livraison.
/// Retourne `true` si le patient a confirmé un lieu (la capture peut alors
/// démarrer), `null` en cas d'annulation.
Future<bool?> showDeliveryLocationSheet(BuildContext context) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const DeliveryLocationSheet(),
  );
}

class DeliveryLocationSheet extends StatefulWidget {
  const DeliveryLocationSheet({super.key});

  @override
  State<DeliveryLocationSheet> createState() => _DeliveryLocationSheetState();
}

enum _Mode { gps, neighborhood }

class _DeliveryLocationSheetState extends State<DeliveryLocationSheet> {
  final _search = TextEditingController();
  final _detail = TextEditingController();

  _Mode _mode = _Mode.gps;
  double? _lat, _lng;
  bool _locating = false;
  bool _geoDenied = false;
  List<Map<String, dynamic>>? _neighborhoods;
  Map<String, dynamic>? _selected;

  final store = DeliveryLocationStore.instance;

  @override
  void initState() {
    super.initState();
    _search.addListener(() => setState(() {}));
    // Pré-remplit avec le dernier choix enregistré dans la session.
    if (store.mode == 'neighborhood') {
      _mode = _Mode.neighborhood;
      _detail.text = store.detail;
    } else if (store.lat != null && store.lng != null) {
      _lat = store.lat;
      _lng = store.lng;
      _detail.text = store.detail;
    } else {
      _locate();
    }
    _loadNeighborhoods();
  }

  @override
  void dispose() {
    _search.dispose();
    _detail.dispose();
    super.dispose();
  }

  Future<void> _locate() async {
    if (_locating) return;
    setState(() {
      _locating = true;
      _geoDenied = false;
    });
    final pos = await LocationService.current();
    if (!mounted) return;
    setState(() {
      _locating = false;
      if (pos != null) {
        _lat = pos.latitude;
        _lng = pos.longitude;
      } else {
        _geoDenied = true;
      }
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
    final q = _search.text.trim().toLowerCase();
    final nbs = _neighborhoods ?? const <Map<String, dynamic>>[];
    if (q.isEmpty) return nbs;
    return nbs.where((n) {
      final name = ((n['name'] as String?) ?? '').toLowerCase();
      final city = ((n['city'] as String?) ?? '').toLowerCase();
      return name.contains(q) || city.contains(q);
    }).toList();
  }

  bool get _canConfirm =>
      _mode == _Mode.gps ? (_lat != null && _lng != null) : _selected != null;

  void _confirm() {
    if (!_canConfirm) return;
    final detail = _detail.text.trim();
    if (_mode == _Mode.gps) {
      store.setGps(lat: _lat!, lng: _lng!, detail: detail);
    } else {
      final sel = _selected!;
      store.setNeighborhood(
        id: sel['id'] as String,
        name: (sel['name'] as String?) ?? '',
        lat: (sel['lat'] as num?)?.toDouble() ?? 0,
        lng: (sel['lng'] as num?)?.toDouble() ?? 0,
        detail: detail,
      );
    }
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return SafeArea(
      top: false,
      child: AnimatedPadding(
        duration: const Duration(milliseconds: 150),
        padding: EdgeInsets.only(bottom: bottomInset),
        child: Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          ),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Center(
                  child: Container(
                    width: 44,
                    height: 4,
                    decoration: BoxDecoration(
                      color: const Color(0xFFD0D5DD),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Icon(Icons.local_shipping_outlined, color: AppColors.primary),
                    const SizedBox(width: 8),
                    Text(
                      L10n.t(context, 'delivery.title'),
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  L10n.t(context, 'delivery.hint'),
                  style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                ),
                const SizedBox(height: 14),
                // Onglets GPS / Quartier
                Container(
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    children: [
                      _Tab(
                        icon: Icons.my_location,
                        label: L10n.t(context, 'delivery.myPosition'),
                        selected: _mode == _Mode.gps,
                        onTap: () => setState(() => _mode = _Mode.gps),
                      ),
                      _Tab(
                        icon: Icons.map_outlined,
                        label: L10n.t(context, 'delivery.otherNeighborhood'),
                        selected: _mode == _Mode.neighborhood,
                        onTap: () => setState(() => _mode = _Mode.neighborhood),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                if (_mode == _Mode.gps) _gpsPanel() else _neighborhoodPanel(),
                const SizedBox(height: 14),
                TextField(
                  controller: _detail,
                  maxLength: 200,
                  decoration: InputDecoration(
                    labelText: L10n.t(context, 'delivery.detail'),
                    hintText: L10n.t(context, 'delivery.detailHint'),
                    counterText: '',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(false),
                      child: Text(L10n.t(context, 'common.cancel')),
                    ),
                    const Spacer(),
                    ElevatedButton(
                      onPressed: _canConfirm ? _confirm : null,
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.check, size: 18),
                          const SizedBox(width: 6),
                          Text(L10n.t(context, 'delivery.confirm')),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
              ],
            ),
        ),
      ),
    );
  }

  Widget _gpsPanel() {
    if (_locating) {
      return const _Panel(
        child: Row(
          children: [
            SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 12),
            Text('Localisation…'),
          ],
        ),
      );
    }
    if (_lat != null && _lng != null) {
      return _Panel(
        ok: true,
        child: Row(
          children: [
            Icon(Icons.check_circle, color: AppColors.success),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                L10n.t(context, 'delivery.positionOk'),
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
            TextButton(
              onPressed: _locate,
              child: Text(L10n.t(context, 'delivery.retryGeo')),
            ),
          ],
        ),
      );
    }
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_geoDenied)
            Text(
              L10n.t(context, 'delivery.geoDenied'),
              style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600),
            ),
          if (_geoDenied) const SizedBox(height: 8),
          Text(
            _geoDenied
                ? 'Autorisez la localisation ou choisissez un quartier.'
                : 'Appuyez pour utiliser la position de ce téléphone.',
            style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _locate,
            icon: const Icon(Icons.my_location),
            label: Text(L10n.t(context, 'delivery.useLocation')),
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
    final filtered = _filtered;
    return Column(
      children: [
        TextField(
          controller: _search,
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search),
            hintText: L10n.t(context, 'delivery.searchNeighborhood'),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
          ),
        ),
        const SizedBox(height: 10),
        Container(
          constraints: const BoxConstraints(maxHeight: 240),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE4E7EC)),
          ),
          child: filtered.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    L10n.t(context, 'delivery.noNeighborhood'),
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
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
                    final id = n['id'] as String?;
                    final name = (n['name'] as String?) ?? '';
                    final selected = _selected != null && _selected!['id'] == id;
                    return InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: () => setState(() => _selected = Map<String, dynamic>.from(n)),
                      child: Container(
                        decoration: BoxDecoration(
                          color: selected
                              ? AppColors.primary.withAlpha(20)
                              : AppColors.surface,
                          borderRadius: BorderRadius.circular(14),
                          border: selected
                              ? Border.all(color: AppColors.primary, width: 1.6)
                              : null,
                        ),
                        child: ListTile(
                          leading: Icon(
                            selected ? Icons.check_circle : Icons.place_outlined,
                            color: selected ? AppColors.primary : AppColors.textSecondary,
                          ),
                          title: Text(name, style: const TextStyle(fontWeight: FontWeight.w500)),
                          trailing: selected
                              ? Icon(Icons.check, color: AppColors.primary)
                              : null,
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _Panel extends StatelessWidget {
  final Widget child;
  final bool ok;
  const _Panel({required this.child, this.ok = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ok ? const Color(0xFFECFDF3) : AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: ok ? Border.all(color: AppColors.success) : null,
      ),
      child: child,
    );
  }
}

class _Tab extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _Tab({required this.icon, required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: selected ? AppColors.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: selected ? Colors.white : AppColors.textSecondary),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: selected ? Colors.white : AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
