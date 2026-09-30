import 'package:flutter/material.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/location_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/features/spaces/space_widgets.dart';

/// Espace Livreur : livraisons assignées, mise en ligne et position GPS.
class CourierSpaceScreen extends StatefulWidget {
  const CourierSpaceScreen({super.key});

  @override
  State<CourierSpaceScreen> createState() => _CourierSpaceScreenState();
}

class _CourierSpaceScreenState extends State<CourierSpaceScreen> {
  bool _loading = true;
  String? _error;
  bool _busy = false;

  Map<String, dynamic>? _courier;
  List<Map<String, dynamic>> _deliveries = [];
  int _done = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _error = null);
    try {
      final data = await ApiService.instance.courierMe();
      if (!mounted) return;
      setState(() {
        _courier = data['courier'] as Map<String, dynamic>?;
        _deliveries =
            ((data['deliveries'] as List?) ?? const []).cast<Map<String, dynamic>>();
        _done = (data['done'] as num?)?.toInt() ?? 0;
        _loading = false;
      });
      // Position GPS best-effort (alimente le suivi temps réel du site).
      _sendPosition();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Impossible de charger vos livraisons.';
        _loading = false;
      });
    }
  }

  Future<void> _sendPosition() async {
    try {
      final pos = await LocationService.current();
      if (pos == null) return;
      await ApiService.instance.courierPosition(
        lat: pos.latitude,
        lng: pos.longitude,
      );
    } catch (_) {
      // GPS indisponible : on continue sans position.
    }
  }

  Future<void> _act(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      await _load();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Action impossible pour le moment.', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _toggleOnline(bool value) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      double? lat;
      double? lng;
      try {
        final pos = await LocationService.current();
        lat = pos?.latitude;
        lng = pos?.longitude;
      } catch (_) {
        // Sans GPS, le changement d'état reste possible.
      }
      await ApiService.instance.courierSetOnline(value, lat: lat, lng: lng);
      await _load();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Action impossible pour le moment.', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _deliveryCard(Map<String, dynamic> d) {
    final id = d['id'] as String;
    final ds = d['delivery_status'] as String?;
    final ph = (d['pharmacies'] as Map<String, dynamic>?);
    final address = (d['patient_address'] as String?) ?? 'Adresse à préciser';
    final when = parseDate(d['assigned_at']) ?? parseDate(d['created_at']);

    return SpaceCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      (ph?['name'] as String?) ?? 'Livraison',
                      style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      frDateTime(when),
                      style: const TextStyle(fontSize: 11.5, color: AppColors.textMuted),
                    ),
                  ],
                ),
              ),
              statusChip(deliveryLabels[ds] ?? '$ds', statusColor(ds)),
            ],
          ),
          if (ph?['address'] != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.storefront, size: 14, color: AppColors.textMuted),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    '${ph!['address']}',
                    style: const TextStyle(fontSize: 12.5, color: AppColors.textSecondary),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(Icons.location_on_outlined, size: 14, color: AppColors.textMuted),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  address,
                  style: const TextStyle(fontSize: 12.5, color: AppColors.textSecondary),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (ds == 'assigned')
                actionButton(
                  'J’ai récupéré',
                  _busy ? null : () => _act(() => ApiService.instance.courierDeliveryStatus(id, 'picked_up')),
                  color: AppColors.success,
                  icon: Icons.check,
                  dense: true,
                ),
              if (ds == 'picked_up')
                actionButton(
                  'En route',
                  _busy ? null : () => _act(() => ApiService.instance.courierDeliveryStatus(id, 'en_route')),
                  color: AppColors.accent,
                  icon: Icons.navigation_outlined,
                  dense: true,
                ),
              if (ds == 'en_route') ...[
                actionButton(
                  'Livrée',
                  _busy ? null : () => _act(() => ApiService.instance.courierDeliveryStatus(id, 'delivered')),
                  color: AppColors.success,
                  icon: Icons.check_circle_outline,
                  dense: true,
                ),
                actionButton(
                  'Échec',
                  _busy ? null : () => _act(() => ApiService.instance.courierDeliveryStatus(id, 'failed')),
                  color: Colors.red.shade700,
                  dense: true,
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final online = _courier?['is_online'] == true;
    final status = (_courier?['status'] as String?) ?? '';

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                spaceHeader(
                  'Espace Livreur',
                  subtitle: _courier == null
                      ? null
                      : '${_courier!['full_name']}',
                  trailing: _courier == null
                      ? null
                      : Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              online ? 'En ligne' : 'Hors ligne',
                              style: TextStyle(
                                fontSize: 12,
                                color: online ? AppColors.success : AppColors.textMuted,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Switch(
                              value: online,
                              onChanged: _busy ? null : _toggleOnline,
                            ),
                          ],
                        ),
                ),
                if (status.isNotEmpty && status != 'approved')
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: statusChip(
                      'Profil : ${statusLabels[status] ?? status}',
                      statusColor(status),
                      icon: Icons.info_outline,
                    ),
                  ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: StatCard(
                        label: 'En cours',
                        value: '${_deliveries.length}',
                        icon: Icons.delivery_dining,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: StatCard(
                        label: 'Livrées',
                        value: '$_done',
                        color: AppColors.success,
                        icon: Icons.check_circle_outline,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Expanded(
                  child: _loading
                      ? const Center(child: CircularProgressIndicator())
                      : _error != null
                          ? errorView(_error!, () {
                              setState(() => _loading = true);
                              _load();
                            })
                          : _courier == null
                              ? emptyView(
                                  'Aucun profil livreur actif sur ce compte.\n\nInscrivez-vous comme livreur sur le site web pour recevoir des courses.',
                                )
                              : _deliveries.isEmpty
                                  ? RefreshIndicator(
                                      onRefresh: _load,
                                      child: ListView(
                                        physics: const AlwaysScrollableScrollPhysics(),
                                        children: [
                                          SizedBox(
                                            height: 220,
                                            child: emptyView(
                                              'Aucune livraison en cours.\n\nRestez en ligne : les courses assignées par les pharmacies apparaîtront ici.',
                                            ),
                                          ),
                                        ],
                                      ),
                                    )
                                  : RefreshIndicator(
                                      onRefresh: _load,
                                      child: ListView.separated(
                                        physics: const AlwaysScrollableScrollPhysics(),
                                        itemCount: _deliveries.length,
                                        separatorBuilder: (_, __) =>
                                            const SizedBox(height: 2),
                                        itemBuilder: (_, i) => _deliveryCard(_deliveries[i]),
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
