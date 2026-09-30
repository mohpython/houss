import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/location_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/features/spaces/space_widgets.dart';

/// Espace Administration : vue d'ensemble, validations et comptes.
class AdminSpaceScreen extends StatefulWidget {
  const AdminSpaceScreen({super.key});

  @override
  State<AdminSpaceScreen> createState() => _AdminSpaceScreenState();
}

class _AdminSpaceScreenState extends State<AdminSpaceScreen> {
  int _tab = 0;
  bool _loading = true;
  String? _error;
  bool _busy = false;

  Map<String, dynamic>? _overview;
  List<Map<String, dynamic>> _users = [];
  List<Map<String, dynamic>> _couriers = [];

  // Carte Google Maps des pharmacies alentour.
  static const LatLng _bamako = LatLng(12.639, -8.002);
  double _lat = _bamako.latitude;
  double _lng = _bamako.longitude;
  double _radiusKm = 5;
  bool _locating = false;
  bool _searchingNearby = false;
  bool _nearbyLoaded = false;
  List<Map<String, dynamic>> _nearby = [];
  List<Map<String, dynamic>> _places = [];
  final Set<Marker> _markers = <Marker>{};
  final Completer<GoogleMapController> _mapController = Completer<GoogleMapController>();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _error = null);
    try {
      final overview = await ApiService.instance.adminOverview();
      final users = await ApiService.instance.adminUsers();
      final couriers = await ApiService.instance.adminCouriers();
      if (!mounted) return;
      setState(() {
        _overview = overview;
        _users = users;
        _couriers = couriers;
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
        _error = 'Impossible de charger les données d’administration.';
        _loading = false;
      });
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

  /// Distance courte : « 850 m » ou « 2,4 km ».
  String _fmtKm(num? km) {
    if (km == null) return '';
    final d = km.toDouble();
    return d < 1 ? '${(d * 1000).round()} m' : '${d.toStringAsFixed(1)} km';
  }

  /// Recherche les pharmacies alentour : partenaires (base) + Google Places.
  Future<void> _searchNearby({bool gps = false}) async {
    if (_searchingNearby) return;
    setState(() {
      _searchingNearby = true;
      _locating = gps;
    });
    try {
      if (gps) {
        final pos = await LocationService.current();
        if (pos != null) {
          _lat = pos.latitude;
          _lng = pos.longitude;
        }
        if (mounted && pos == null) {
          showSnack(context, 'Position indisponible — Bamako conservée.', error: true);
        }
      }
      final nearbyF = ApiService.instance.adminPharmaciesNearby(
        lat: _lat,
        lng: _lng,
        radiusKm: _radiusKm,
      );
      final placesF = ApiService.instance.adminPharmaciesPlaces(
        lat: _lat,
        lng: _lng,
        radiusKm: _radiusKm,
      );
      final nearbyRes = await nearbyF;
      final places = await placesF;
      if (!mounted) return;
      setState(() {
        _nearby = ((nearbyRes['pharmacies'] as List?) ?? const []).cast<Map<String, dynamic>>();
        _places = places;
        _nearbyLoaded = true;
        _searchingNearby = false;
        _locating = false;
      });
      _rebuildMarkers();
      _moveCamera();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _searchingNearby = false;
        _locating = false;
      });
      showSnack(context, e.message, error: true);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _searchingNearby = false;
        _locating = false;
      });
      showSnack(context, 'Recherche des pharmacies alentour impossible.', error: true);
    }
  }

  /// Marqueurs de la carte : vert = partenaire, orange = à ajouter.
  void _rebuildMarkers() {
    final markers = <Marker>{};
    for (final p in _nearby) {
      final mLat = (p['lat'] as num?)?.toDouble();
      final mLng = (p['lng'] as num?)?.toDouble();
      if (mLat == null || mLng == null) continue;
      final st = p['status'] as String?;
      markers.add(
        Marker(
          markerId: MarkerId('ph-${p['id']}'),
          position: LatLng(mLat, mLng),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
          infoWindow: InfoWindow(
            title: '${p['name']}',
            snippet: st == 'approved' ? 'Partenaire' : (statusLabels[st] ?? st ?? ''),
          ),
        ),
      );
    }
    var i = 0;
    for (final pl in _places) {
      if (pl['local_pharmacy_id'] != null) continue;
      final mLat = (pl['lat'] as num?)?.toDouble();
      final mLng = (pl['lng'] as num?)?.toDouble();
      if (mLat == null || mLng == null) continue;
      markers.add(
        Marker(
          markerId: MarkerId('place-${pl['place_id'] ?? 'x${i++}'}'),
          position: LatLng(mLat, mLng),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
          infoWindow: InfoWindow(
            title: '${pl['name']}',
            snippet: 'À ajouter comme partenaire',
          ),
        ),
      );
    }
    if (!mounted) return;
    setState(() {
      _markers
        ..clear()
        ..addAll(markers);
    });
  }

  void _moveCamera() {
    if (!_mapController.isCompleted) return;
    _mapController.future.then(
      (c) => c.moveCamera(CameraUpdate.newLatLngZoom(LatLng(_lat, _lng), 12.5)),
    );
  }

  /// Ajoute une pharmacie repérée sur la carte comme partenaire.
  Future<void> _addPartner(Map<String, dynamic> pl) async {
    if (_busy) return;
    final lat = (pl['lat'] as num?)?.toDouble();
    final lng = (pl['lng'] as num?)?.toDouble();
    if (lat == null || lng == null) {
      showSnack(context, 'Emplacement inconnu pour cette pharmacie.', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final res = await ApiService.instance.adminAddPartnerPharmacy(
        name: '${pl['name']}',
        address: '${pl['address']}'.trim().isEmpty ? 'Bamako' : '${pl['address']}',
        lat: lat,
        lng: lng,
        phone: pl['phone'] as String?,
        placeId: pl['place_id'] as String?,
        rating: (pl['rating'] as num?)?.toDouble(),
      );
      if (!mounted) return;
      showSnack(
        context,
        res['created'] == true
            ? '« ${pl['name']} » ajoutée comme partenaire.'
            : '« ${pl['name']} » est déjà enregistrée.',
      );
      final acc = res['account'] as Map<String, dynamic>?;
      if (acc != null && mounted) _showPharmacyAccount(acc);
      await _load();
      await _searchNearby();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Ajout impossible pour le moment.', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Map<String, dynamic> get _counts =>
      (_overview?['counts'] as Map<String, dynamic>?) ?? const {};
  List<Map<String, dynamic>> get _pharmacies =>
      ((_overview?['pharmacies'] as List?) ?? const []).cast<Map<String, dynamic>>();

  // --- Vue d'ensemble -------------------------------------------------------

  Widget _overviewView() {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Row(
            children: [
              Expanded(
                child: StatCard(
                  label: 'Pharmacies',
                  value: '${_counts['pharmacies'] ?? 0}',
                  color: AppColors.accentLight,
                  icon: Icons.local_pharmacy_outlined,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: StatCard(
                  label: 'Livreurs',
                  value: '${_counts['couriers'] ?? 0}',
                  icon: Icons.delivery_dining,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: StatCard(
                  label: 'Actives',
                  value: '${_counts['active'] ?? 0}',
                  color: AppColors.warning,
                  icon: Icons.receipt_long,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: StatCard(
                  label: 'Livrées',
                  value: '${_counts['delivered'] ?? 0}',
                  color: AppColors.success,
                  icon: Icons.check_circle_outline,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: StatCard(
                  label: 'Patients',
                  value: '${_counts['patients'] ?? 0}',
                  icon: Icons.group_outlined,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: StatCard(
                  label: 'Praticiens',
                  value: '${_counts['practitioners'] ?? 0}',
                  color: AppColors.success,
                  icon: Icons.medical_services_outlined,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: StatCard(
                  label: 'RDV en attente',
                  value: '${_counts['appointments_pending'] ?? 0}',
                  color: AppColors.warning,
                  icon: Icons.event_outlined,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: StatCard(
                  label: 'Comptes',
                  value: '${_counts['users'] ?? 0}',
                  color: AppColors.accentLight,
                  icon: Icons.badge_outlined,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          sectionTitle('Dernières pharmacies'),
          const SizedBox(height: 8),
          ..._pharmacies.take(6).map(_pharmacyCard),
        ],
      ),
    );
  }

  // --- Pharmacies -----------------------------------------------------------

  Widget _pharmacyCard(Map<String, dynamic> p) {
    final status = (p['status'] as String?) ?? 'pending';
    final city = (p['city'] as String?) ?? '';
    final address = (p['address'] as String?) ?? '';
    final license = (p['license_number'] as String?) ?? '';
    final dist = _fmtKm(p['distance_km'] as num?);

    return SpaceCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${p['name']}',
                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600),
                ),
              ),
              statusChip(statusLabels[status] ?? status, statusColor(status)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            [
              if (license.isNotEmpty) license,
              if (city.isNotEmpty) city,
              if (dist.isNotEmpty) dist,
            ].join(' · '),
            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          if (address.isNotEmpty)
            Text(
              address,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
          if (p['lat'] == null || p['lng'] == null)
            const Padding(
              padding: EdgeInsets.only(top: 3),
              child: Text(
                '⚠ Emplacement manquant — à localiser sur la carte',
                style: TextStyle(fontSize: 11, color: AppColors.warning),
              ),
            ),
          if (status != 'approved') ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              children: [
                actionButton(
                  'Approuver',
                  _busy
                      ? null
                      : () => _act(() async {
                            final res = await ApiService.instance
                                .adminPharmacyDecision(p['id'] as String, 'approved');
                            final acc = res['account'] as Map<String, dynamic>?;
                            if (acc != null && mounted) _showPharmacyAccount(acc);
                          }),
                  color: AppColors.success,
                  icon: Icons.check,
                  dense: true,
                ),
                actionButton(
                  'Rejeter',
                  _busy
                      ? null
                      : () => _act(() => ApiService.instance
                          .adminPharmacyDecision(p['id'] as String, 'rejected')),
                  color: Colors.red.shade700,
                  dense: true,
                ),
              ],
            ),
          ],
          if (status == 'approved' && p['has_account'] != true) ...[
            const SizedBox(height: 10),
            actionButton(
              'Créer le compte pharmacie',
              _busy
                  ? null
                  : () => _act(() async {
                        final res = await ApiService.instance
                            .adminPharmacyDecision(p['id'] as String, 'approved');
                        final acc = res['account'] as Map<String, dynamic>?;
                        if (acc != null && mounted) _showPharmacyAccount(acc);
                      }),
              color: AppColors.accentLight,
              icon: Icons.person_add_alt_1,
              dense: true,
            ),
          ],
        ],
      ),
    );
  }

  /// Affiche les identifiants fraîchement créés pour une pharmacie,
  /// à transmettre à son équipe.
  void _showPharmacyAccount(Map<String, dynamic> acc) {
    final email = '${acc['email'] ?? ''}';
    final password = acc['password'] as String?;
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(password != null ? 'Compte pharmacie créé' : 'Compte rattaché'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              password != null
                  ? 'Transmettez ces identifiants à la pharmacie :'
                  : 'Ce compte existait déjà et vient d’être rattaché :',
              style: const TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 10),
            const Text(
              'Identifiant',
              style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
            ),
            SelectableText(
              email,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                fontFamily: 'monospace',
              ),
            ),
            if (password != null) ...[
              const SizedBox(height: 8),
              const Text(
                'Mot de passe',
                style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
              ),
              SelectableText(
                password,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  fontFamily: 'monospace',
                ),
              ),
            ],
            const SizedBox(height: 10),
            const Text(
              'La pharmacie se connectera avec ces identifiants (espace Pharmacien).',
              style: TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('J’ai noté'),
          ),
        ],
      ),
    );
  }

  /// Carte d'une pharmacie repérée via Google Places (bouton « Ajouter »).
  Widget _placeCard(Map<String, dynamic> pl) {
    final partner = pl['local_pharmacy_id'] != null;
    final status = pl['status'] as String?;
    final address = (pl['address'] as String?) ?? '';
    final dist = _fmtKm(pl['distance_km'] as num?);

    return SpaceCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${pl['name']}',
                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600),
                ),
              ),
              if (partner)
                status == 'approved'
                    ? statusChip('Partenaire', AppColors.success, icon: Icons.verified)
                    : statusChip(
                        statusLabels[status] ?? status ?? 'Enregistrée',
                        statusColor(status),
                      )
              else
                statusChip('Google Maps', AppColors.primaryLight),
            ],
          ),
          if (address.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              address,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              if (dist.isNotEmpty)
                Text(
                  dist,
                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              const Spacer(),
              if (partner)
                const Text(
                  'Déjà enregistrée',
                  style: TextStyle(fontSize: 11.5, color: AppColors.textMuted),
                )
              else
                actionButton(
                  'Ajouter partenaire',
                  _busy ? null : () => _addPartner(pl),
                  icon: Icons.add_business_outlined,
                  dense: true,
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _pharmaciesView() {
    final controls = Row(
      children: [
        Flexible(
          child: actionButton(
            _locating ? 'Localisation…' : 'Autour de moi',
            (_searchingNearby || _locating) ? null : () => _searchNearby(gps: true),
            icon: Icons.my_location,
            dense: true,
          ),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.border),
          ),
          child: DropdownButton<double>(
            value: _radiusKm,
            isDense: true,
            underline: const SizedBox.shrink(),
            dropdownColor: AppColors.card,
            style: const TextStyle(fontSize: 12.5, color: AppColors.textPrimary),
            items: const [2.0, 5.0, 10.0, 20.0]
                .map(
                  (r) => DropdownMenuItem(
                    value: r,
                    child: Text('${r.toStringAsFixed(0)} km'),
                  ),
                )
                .toList(),
            onChanged: _searchingNearby
                ? null
                : (v) {
                    if (v == null) return;
                    setState(() => _radiusKm = v);
                    _searchNearby();
                  },
          ),
        ),
        const Spacer(),
        actionButton(
          'Actualiser',
          _searchingNearby ? null : () => _searchNearby(),
          icon: Icons.refresh,
          dense: true,
        ),
      ],
    );

    final candidates = _places.where((p) => p['local_pharmacy_id'] == null).toList();

    return RefreshIndicator(
      onRefresh: () async {
        await Future.wait([_load(), _searchNearby()]);
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          controls,
          const SizedBox(height: 12),
          SizedBox(
            height: 230,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: GoogleMap(
                initialCameraPosition: CameraPosition(target: LatLng(_lat, _lng), zoom: 12),
                markers: _markers,
                zoomControlsEnabled: false,
                myLocationButtonEnabled: false,
                onMapCreated: (c) {
                  if (!_mapController.isCompleted) _mapController.complete(c);
                },
              ),
            ),
          ),
          if (_searchingNearby) ...[
            const SizedBox(height: 12),
            const LinearProgressIndicator(),
          ],
          const SizedBox(height: 14),
          sectionTitle('Partenaires à proximité (${_nearby.length})'),
          const SizedBox(height: 8),
          ..._nearby.map(_pharmacyCard),
          if (candidates.isNotEmpty) ...[
            const SizedBox(height: 8),
            sectionTitle('Autres pharmacies autour — Google Maps (${candidates.length})'),
            const SizedBox(height: 8),
            ...candidates.map(_placeCard),
          ],
          if (!_searchingNearby && _nearbyLoaded && _nearby.isEmpty && candidates.isEmpty)
            emptyView(
              'Aucune pharmacie dans un rayon de ${_radiusKm.toStringAsFixed(0)} km. Élargissez le rayon.',
            ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  // --- Livreurs -------------------------------------------------------------

  Widget _courierCard(Map<String, dynamic> c) {
    final status = (c['status'] as String?) ?? 'pending';
    final online = c['is_online'] == true;
    final vehicle = (c['vehicle_type'] as String?) ?? '';
    final license = (c['license_number'] as String?) ?? '';
    final phone = (c['phone'] as String?) ?? '';

    return SpaceCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${c['full_name']}',
                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600),
                ),
              ),
              statusChip(statusLabels[status] ?? status, statusColor(status)),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              if (online) ...[
                const Icon(Icons.circle, size: 8, color: AppColors.success),
                const SizedBox(width: 4),
                const Text(
                  'En ligne',
                  style: TextStyle(fontSize: 12, color: AppColors.success),
                ),
                const SizedBox(width: 10),
              ],
              if (phone.isNotEmpty)
                Expanded(
                  child: Text(
                    phone,
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                  ),
                ),
            ],
          ),
          if (vehicle.isNotEmpty || license.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(
                [if (vehicle.isNotEmpty) vehicle, if (license.isNotEmpty) license].join(' · '),
                style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
              ),
            ),
          if (status != 'approved') ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              children: [
                actionButton(
                  'Approuver',
                  _busy
                      ? null
                      : () => _act(() => ApiService.instance
                          .adminCourierDecision(c['id'] as String, 'approved')),
                  color: AppColors.success,
                  icon: Icons.check,
                  dense: true,
                ),
                actionButton(
                  'Rejeter',
                  _busy
                      ? null
                      : () => _act(() => ApiService.instance
                          .adminCourierDecision(c['id'] as String, 'rejected')),
                  color: Colors.red.shade700,
                  dense: true,
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _couriersView() {
    if (_couriers.isEmpty) return emptyView('Aucun livreur inscrit.');
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: _couriers.map(_courierCard).toList(),
      ),
    );
  }

  // --- Comptes --------------------------------------------------------------

  Widget _userCard(Map<String, dynamic> u) {
    final name = ((u['full_name'] as String?) ?? '').trim();
    final email = (u['email'] as String?) ?? '';
    final phone = (u['phone'] as String?) ?? '';
    final roles = ((u['roles'] as List?) ?? const []).map((r) => '$r').toList();
    final lastLogin = parseDate(u['last_sign_in_at']);

    return SpaceCard(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  name.isEmpty ? email : name,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                ),
              ),
              Wrap(
                spacing: 4,
                children: roles
                    .map((r) {
                      final info = roleInfo(r);
                      return statusChip(info.$1, info.$2);
                    })
                    .toList(),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            [
              if (email.isNotEmpty) email,
              if (phone.isNotEmpty) phone,
            ].join(' · '),
            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          if (lastLogin != null)
            Text(
              'Dernière connexion : ${frDateTime(lastLogin)}',
              style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
            ),
        ],
      ),
    );
  }

  Widget _usersView() {
    if (_users.isEmpty) return emptyView('Aucun compte.');
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: _users.map(_userCard).toList(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final body = _loading
        ? const Center(child: CircularProgressIndicator())
        : _error != null
            ? errorView(_error!, () {
                setState(() => _loading = true);
                _load();
              })
            : switch (_tab) {
                1 => _pharmaciesView(),
                2 => _couriersView(),
                3 => _usersView(),
                _ => _overviewView(),
              };

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
                  'Espace Administration',
                  subtitle: 'Pilotage de la plateforme SAHA Santé',
                ),
                const SizedBox(height: 14),
                segmentedTabs(
                  labels: const ['Vue', 'Pharmacies', 'Livreurs', 'Comptes'],
                  icons: const [
                    Icons.dashboard_outlined,
                    Icons.local_pharmacy_outlined,
                    Icons.delivery_dining_outlined,
                    Icons.group_outlined,
                  ],
                  selected: _tab,
                  onChanged: (i) {
                    setState(() => _tab = i);
                    if (i == 1 && !_nearbyLoaded && !_searchingNearby) {
                      _searchNearby();
                    }
                  },
                ),
                const SizedBox(height: 14),
                Expanded(child: body),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
