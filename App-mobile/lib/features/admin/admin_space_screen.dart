import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/location_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/features/admin/admin_management_screens.dart';
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
  List<Map<String, dynamic>> _practitioners = [];
  List<Map<String, dynamic>> _specialties = [];

  // Gérants de pharmacie (par id) et emails en cours de saisie.
  Map<String, Map<String, dynamic>> _ownersById = const {};
  final Map<String, TextEditingController> _emailCtrls = {};

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
      final owners = await ApiService.instance.adminPharmacyOwners();
      final practitioners = await ApiService.instance.adminPractitioners();
      if (!mounted) return;
      setState(() {
        _overview = overview;
        _users = users;
        _couriers = couriers;
        _practitioners = ((practitioners['practitioners'] as List?) ?? const [])
            .cast<Map<String, dynamic>>();
        _specialties = ((practitioners['specialties'] as List?) ?? const [])
            .cast<Map<String, dynamic>>();
        _ownersById = {
          for (final o in owners)
            if (o['id'] != null) '${o['id']}': o,
        };
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
        _error = L10n.c('adm.loadFailed');
        _loading = false;
      });
    }
  }

  @override
  void dispose() {
    for (final c in _emailCtrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<bool> _act(Future<void> Function() action) async {
    if (_busy) return false;
    setState(() => _busy = true);
    try {
      await action();
      await _load();
      return true;
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
      return false;
    } catch (_) {
      if (mounted) showSnack(context, L10n.c('adm.actionFailed'), error: true);
      return false;
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
          showSnack(context, L10n.c('adm.gpsUnavailable'), error: true);
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
      showSnack(context, L10n.c('adm.searchFailed'), error: true);
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
            snippet: st == 'approved' ? L10n.c('adm.partner') : reviewLabel(st ?? ''),
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
            snippet: L10n.c('adm.toAdd'),
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
      showSnack(context, L10n.c('adm.unknownLocation'), error: true);
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
            ? L10n.tArgs(context, 'adm.addedPartner', {'name': '${pl['name']}'})
            : L10n.tArgs(context, 'adm.alreadyPartner', {'name': '${pl['name']}'}),
      );
      final acc = res['account'] as Map<String, dynamic>?;
      if (acc != null && mounted) _showPharmacyAccount(acc);
      await _load();
      await _searchNearby();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } catch (_) {
      if (mounted) showSnack(context, L10n.c('adm.addFailed'), error: true);
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
                  label: L10n.c('adm.pharmacies'),
                  value: '${_counts['pharmacies'] ?? 0}',
                  color: AppColors.accentLight,
                  icon: Icons.local_pharmacy_outlined,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: StatCard(
                  label: L10n.c('adm.couriers'),
                  value: '${_counts['couriers'] ?? 0}',
                  icon: Icons.delivery_dining,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: StatCard(
                  label: L10n.c('adm.active'),
                  value: '${_counts['active'] ?? 0}',
                  color: AppColors.warning,
                  icon: Icons.receipt_long,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: StatCard(
                  label: L10n.c('adm.deliveredCount'),
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
                  label: L10n.c('adm.patients'),
                  value: '${_counts['patients'] ?? 0}',
                  icon: Icons.group_outlined,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: StatCard(
                  label: L10n.c('adm.practitioners'),
                  value: '${_counts['practitioners'] ?? 0}',
                  color: AppColors.success,
                  icon: Icons.medical_services_outlined,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: StatCard(
                  label: L10n.c('adm.pendingAppts'),
                  value: '${_counts['appointments_pending'] ?? 0}',
                  color: AppColors.warning,
                  icon: Icons.event_outlined,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: StatCard(
                  label: L10n.c('adm.accounts'),
                  value: '${_counts['users'] ?? 0}',
                  color: AppColors.accentLight,
                  icon: Icons.badge_outlined,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _ReviewEntryCard(),
          const SizedBox(height: 16),
          const _ManagementEntries(),
          const SizedBox(height: 16),
          sectionTitle(L10n.c('adm.latestPharmacies')),
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
              statusChip(reviewLabel(status), statusColor(status)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            [
              if (license.isNotEmpty) license,
              if (city.isNotEmpty) city,
              if (dist.isNotEmpty) dist,
            ].join(' · '),
            style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          if (address.isNotEmpty)
            Text(
              address,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
          if (p['lat'] == null || p['lng'] == null)
            Padding(
              padding: EdgeInsets.only(top: 3),
              child: Text(
                L10n.c('adm.missingLocation'),
                style: TextStyle(fontSize: 11, color: AppColors.warning),
              ),
            ),
          if (status != 'approved') ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              children: [
                actionButton(
                  L10n.c('adm.approve'),
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
                  L10n.c('adm.reject'),
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
              L10n.c('adm.createAccount'),
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
          if (status == 'approved') ...[
            const SizedBox(height: 10),
            _managerSection(p),
          ],
        ],
      ),
    );
  }

  // --- Gérants de pharmacie --------------------------------------------------

  TextEditingController _emailCtrl(String pharmacyId) =>
      _emailCtrls.putIfAbsent(pharmacyId, TextEditingController.new);

  /// Attribue (ou réserve) la pharmacie à un compte existant par email.
  Future<void> _assignOwner(Map<String, dynamic> p) async {
    final id = p['id'] as String;
    final email = _emailCtrl(id).text.trim();
    if (email.isEmpty) {
      showSnack(context, L10n.c('adm.enterManagerEmail'), error: true);
      return;
    }
    await _act(() async {
      final status = await ApiService.instance.adminAssignOwner(id, email);
      if (!mounted) return;
      showSnack(
        context,
        status == 'invited'
            ? L10n.c('adm.noAccountForEmail')
            : L10n.c('adm.ownerAssigned'),
      );
    });
    _emailCtrl(id).clear();
  }

  /// Retire le gérant (ou la réservation) d'une pharmacie, après confirmation.
  Future<void> _removeOwner(Map<String, dynamic> p, String? email) async {
    final id = p['id'] as String;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(L10n.c('adm.removeManagerTitle')),
        content: Text(
          (email != null && email.isNotEmpty)
              ? L10n.tArgs(context, 'adm.loseAccessEmail', {'email': email})
              : L10n.c('adm.loseAccess'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(L10n.c('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(L10n.c('adm.remove')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _act(() async {
      await ApiService.instance.adminRemoveOwner(id);
      if (mounted) showSnack(context, L10n.c('adm.managerRemoved'));
    });
  }

  /// Bloc « Gérant » d'une carte pharmacie : affiche le gérant (ou la
  /// réservation) ou propose d'attribuer la pharmacie à un compte existant.
  Widget _managerSection(Map<String, dynamic> p) {
    final id = p['id'] as String;
    final ownerRow = _ownersById[id];
    final ownerEmail = (ownerRow?['owner_email'] as String?) ?? '';
    final claimEmail = (ownerRow?['claim_email'] as String?) ?? '';

    if (ownerEmail.isNotEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.person_pin_circle_outlined, size: 15, color: AppColors.success),
              const SizedBox(width: 5),
              Expanded(
                child: Text(
                  L10n.tArgs(context, 'adm.managerLine', {'email': ownerEmail}),
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.success,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          actionButton(
            L10n.c('adm.removeManager'),
            _busy ? null : () => _removeOwner(p, ownerEmail),
            color: Colors.red.shade700,
            dense: true,
          ),
        ],
      );
    }

    if (claimEmail.isNotEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.mail_outline, size: 15, color: AppColors.warning),
              const SizedBox(width: 5),
              Expanded(
                child: Text(
                  L10n.tArgs(context, 'adm.reservedFor', {'email': claimEmail}),
                  style: TextStyle(fontSize: 12, color: AppColors.warning),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          actionButton(
            L10n.c('adm.cancelReservation'),
            _busy ? null : () => _removeOwner(p, claimEmail),
            color: Colors.red.shade700,
            dense: true,
          ),
        ],
      );
    }

    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _emailCtrl(id),
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            decoration: InputDecoration(
              isDense: true,
              hintText: L10n.c('adm.managerEmailHint'),
              prefixIcon: Icon(Icons.alternate_email, size: 18, color: AppColors.textMuted),
              border: OutlineInputBorder(),
              contentPadding: EdgeInsets.symmetric(vertical: 12),
            ),
            onSubmitted: (_) => _assignOwner(p),
          ),
        ),
        const SizedBox(width: 8),
        actionButton(
          L10n.c('adm.assign'),
          _busy ? null : () => _assignOwner(p),
          icon: Icons.person_add_alt_1,
          dense: true,
        ),
      ],
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
        title: Text(password != null ? L10n.c('adm.accountCreated') : L10n.c('adm.accountLinked')),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              password != null
                  ? L10n.c('adm.sendCredentials')
                  : L10n.c('adm.accountExisted'),
              style: const TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 10),
            Text(
              L10n.c('adm.identifier'),
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
              Text(
                L10n.c('adm.password'),
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
            Text(
              L10n.c('adm.loginHint'),
              style: TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(L10n.c('adm.gotIt')),
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
                    ? statusChip(L10n.c('adm.partner'), AppColors.success, icon: Icons.verified)
                    : statusChip(
                        status != null ? reviewLabel(status) : L10n.c('adm.registered'),
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
              style: TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              if (dist.isNotEmpty)
                Text(
                  dist,
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              const Spacer(),
              if (partner)
                Text(
                  L10n.c('adm.alreadyRegistered'),
                  style: TextStyle(fontSize: 11.5, color: AppColors.textMuted),
                )
              else
                actionButton(
                  L10n.c('adm.addPartner'),
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
            _locating ? L10n.c('adm.locating') : L10n.c('adm.aroundMe'),
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
            style: TextStyle(fontSize: 12.5, color: AppColors.textPrimary),
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
          L10n.c('adm.refresh'),
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
          sectionTitle(
            L10n.tArgs(context, 'adm.nearbyPartners', {'count': '${_nearby.length}'}),
          ),
          const SizedBox(height: 8),
          ..._nearby.map(_pharmacyCard),
          if (candidates.isNotEmpty) ...[
            const SizedBox(height: 8),
            sectionTitle(
              L10n.tArgs(context, 'adm.otherNearby', {'count': '${candidates.length}'}),
            ),
            const SizedBox(height: 8),
            ...candidates.map(_placeCard),
          ],
          if (!_searchingNearby && _nearbyLoaded && _nearby.isEmpty && candidates.isEmpty)
            emptyView(
              L10n.tArgs(
                context,
                'adm.noPharmacyInRadius',
                {'radius': _radiusKm.toStringAsFixed(0)},
              ),
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
              statusChip(reviewLabel(status), statusColor(status)),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              if (online) ...[
                Icon(Icons.circle, size: 8, color: AppColors.success),
                const SizedBox(width: 4),
                Text(
                  L10n.c('adm.online'),
                  style: TextStyle(fontSize: 12, color: AppColors.success),
                ),
                const SizedBox(width: 10),
              ],
              if (phone.isNotEmpty)
                Expanded(
                  child: Text(
                    phone,
                    style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                  ),
                ),
            ],
          ),
          if (vehicle.isNotEmpty || license.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(
                [if (vehicle.isNotEmpty) vehicle, if (license.isNotEmpty) license].join(' · '),
                style: TextStyle(fontSize: 12, color: AppColors.textMuted),
              ),
            ),
          if (status != 'approved') ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              children: [
                actionButton(
                  L10n.c('adm.approve'),
                  _busy
                      ? null
                      : () => _act(() => ApiService.instance
                          .adminCourierDecision(c['id'] as String, 'approved')),
                  color: AppColors.success,
                  icon: Icons.check,
                  dense: true,
                ),
                actionButton(
                  L10n.c('adm.reject'),
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
    if (_couriers.isEmpty) return emptyView(L10n.c('adm.noCouriers'));
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: _couriers.map(_courierCard).toList(),
      ),
    );
  }

  // --- Praticiens -----------------------------------------------------------

  String _specialtyLabel(String code) {
    for (final s in _specialties) {
      if ('${s['code']}' == code) {
        final key = switch (AppLocale.instance.current) {
          SahaLang.en => 'label_en',
          SahaLang.ar => 'label_ar',
          _ => 'label_fr',
        };
        return '${s[key] ?? s['label_fr'] ?? code}';
      }
    }
    return code.isEmpty ? L10n.c('adm.specialty') : code;
  }

  String _practitionerTypeLabel(String type) =>
      type == 'nurse' ? L10n.c('prac.nurse') : L10n.c('prac.doctor');

  Future<void> _openPractitionerEditor([Map<String, dynamic>? p]) async {
    final isNew = p == null;
    if (_specialties.isEmpty) {
      showSnack(context, L10n.c('adm.noSpecialties'), error: true);
      return;
    }
    final name = TextEditingController(text: '${p?['full_name'] ?? ''}');
    final phone = TextEditingController(text: '${p?['phone'] ?? ''}');
    final city = TextEditingController(text: '${p?['city'] ?? ''}');
    final address = TextEditingController(text: '${p?['address'] ?? ''}');
    final license = TextEditingController(text: '${p?['license_number'] ?? ''}');
    final initialFee = p?['consultation_fee'];
    final fee = TextEditingController(
      text: initialFee is num ? initialFee.toStringAsFixed(0) : '',
    );
    final claimEmail = TextEditingController(text: '${p?['claim_email'] ?? ''}');
    final bio = TextEditingController(text: '${p?['bio'] ?? ''}');

    var type = '${p?['type'] ?? 'doctor'}';
    if (type != 'doctor' && type != 'nurse') type = 'doctor';
    var specialty = '${p?['specialty_code'] ?? ''}';
    if (!_specialties.any((s) => '${s['code']}' == specialty)) {
      specialty = '${_specialties.first['code']}';
    }
    var status = '${p?['status'] ?? 'pending'}';
    if (!const ['pending', 'approved', 'rejected'].contains(status)) {
      status = 'pending';
    }
    var homeVisits = p?['home_visits'] == true;
    var available = p?['is_available'] != false;

    // Codes de spécialité (la valeur courante reste sélectionnable même si la
    // liste serveur a changé entre-temps).
    final codes = <String>{
      ..._specialties.map((s) => '${s['code']}'),
      specialty,
    }.toList();

    await showDialog<void>(
      context: context,
      builder: (dctx) => StatefulBuilder(
        builder: (dctx, setLocal) {
          Future<void> save() async {
            if (name.text.trim().length < 2) {
              showSnack(dctx, L10n.c('adm.nameRequired'), error: true);
              return;
            }
            if (specialty.isEmpty) {
              showSnack(dctx, L10n.c('adm.specialtyRequired'), error: true);
              return;
            }
            double? feeValue;
            final feeText = fee.text.trim().replaceAll(',', '.');
            if (feeText.isNotEmpty) {
              feeValue = double.tryParse(feeText);
              if (feeValue == null || feeValue < 0) {
                showSnack(dctx, L10n.c('adm.invalidFee'), error: true);
                return;
              }
            }
            final payload = <String, dynamic>{
              if (!isNew) 'id': '${p['id']}',
              'full_name': name.text.trim(),
              'type': type,
              'specialty_code': specialty,
              'license_number': _nullIfEmpty(license.text),
              'phone': _nullIfEmpty(phone.text),
              'address': _nullIfEmpty(address.text),
              'city': _nullIfEmpty(city.text),
              'home_visits': homeVisits,
              'consultation_fee': feeValue,
              'is_available': available,
              'status': status,
              'bio': _nullIfEmpty(bio.text),
              'claim_email': _nullIfEmpty(claimEmail.text)?.toLowerCase(),
            };
            Navigator.pop(dctx);
            final ok = await _act(
              () => ApiService.instance.adminSavePractitioner(payload),
            );
            if (ok && mounted) {
              showSnack(context, L10n.c('adm.practitionerSaved'));
            }
          }

          return AlertDialog(
            scrollable: true,
            title: Text(isNew ? L10n.c('adm.addPractitioner') : L10n.c('adm.editPractitioner')),
            content: SizedBox(
              width: 460,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: name,
                    textCapitalization: TextCapitalization.words,
                    decoration: InputDecoration(labelText: L10n.c('adm.fullName')),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: type,
                    decoration: InputDecoration(labelText: L10n.c('adm.typeLabel')),
                    items: [
                      DropdownMenuItem(value: 'doctor', child: Text(L10n.c('prac.doctor'))),
                      DropdownMenuItem(value: 'nurse', child: Text(L10n.c('prac.nurse'))),
                    ],
                    onChanged: (v) => setLocal(() => type = v ?? 'doctor'),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: specialty,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: L10n.c('adm.specialty')),
                    items: codes
                        .map((c) => DropdownMenuItem(
                              value: c,
                              child: Text(_specialtyLabel(c), overflow: TextOverflow.ellipsis),
                            ))
                        .toList(),
                    onChanged: (v) => setLocal(() => specialty = v ?? specialty),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: license,
                    decoration: InputDecoration(labelText: L10n.c('adm.license')),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: phone,
                    keyboardType: TextInputType.phone,
                    decoration: InputDecoration(labelText: L10n.c('adm.phone')),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: city,
                    textCapitalization: TextCapitalization.words,
                    decoration: InputDecoration(labelText: L10n.c('adm.city')),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: address,
                    decoration: InputDecoration(labelText: L10n.c('adm.address')),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: fee,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: InputDecoration(labelText: L10n.c('adm.fee')),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: claimEmail,
                    keyboardType: TextInputType.emailAddress,
                    decoration: InputDecoration(labelText: L10n.c('adm.claimEmail')),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: bio,
                    maxLines: 3,
                    decoration: InputDecoration(labelText: L10n.c('adm.bio')),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(L10n.c('adm.homeVisits')),
                    value: homeVisits,
                    onChanged: (v) => setLocal(() => homeVisits = v),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(L10n.c('adm.available')),
                    value: available,
                    onChanged: (v) => setLocal(() => available = v),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: status,
                    decoration: InputDecoration(labelText: L10n.c('adm.statusLabel')),
                    items: const ['pending', 'approved', 'rejected']
                        .map((s) => DropdownMenuItem(
                              value: s,
                              child: Text(reviewLabel(s)),
                            ))
                        .toList(),
                    onChanged: (v) => setLocal(() => status = v ?? status),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dctx),
                child: Text(L10n.c('adm.cancel')),
              ),
              FilledButton(
                onPressed: save,
                child: Text(L10n.c('adm.save')),
              ),
            ],
          );
        },
      ),
    );

    name.dispose();
    phone.dispose();
    city.dispose();
    address.dispose();
    license.dispose();
    fee.dispose();
    claimEmail.dispose();
    bio.dispose();
  }

  String? _nullIfEmpty(String value) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  Widget _practitionerCard(Map<String, dynamic> p) {
    final status = (p['status'] as String?) ?? 'pending';
    final type = (p['type'] as String?) ?? 'doctor';
    final specialty = _specialtyLabel('${p['specialty_code'] ?? ''}');
    final phone = (p['phone'] as String?) ?? '';
    final city = (p['city'] as String?) ?? '';
    final fee = p['consultation_fee'] as num?;
    final available = p['is_available'] != false;
    final id = '${p['id']}';

    return SpaceCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${p['full_name']}',
                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600),
                ),
              ),
              statusChip(reviewLabel(status), statusColor(status)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${_practitionerTypeLabel(type)} · $specialty',
            style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 2),
          Text(
            [
              if (phone.isNotEmpty) phone,
              if (city.isNotEmpty) city,
              if (fee != null) '${fee.toStringAsFixed(0)} FCFA',
            ].join(' · '),
            style: TextStyle(fontSize: 12, color: AppColors.textMuted),
          ),
          if (!available)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                L10n.c('adm.unavailable'),
                style: TextStyle(fontSize: 11.5, color: AppColors.warning),
              ),
            ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              actionButton(
                L10n.c('adm.edit'),
                _busy ? null : () => _openPractitionerEditor(p),
                icon: Icons.edit_outlined,
                dense: true,
              ),
              if (status != 'approved')
                actionButton(
                  L10n.c('adm.approve'),
                  _busy
                      ? null
                      : () => _act(() => ApiService.instance
                          .adminPractitionerStatus(id, 'approved')),
                  color: AppColors.success,
                  icon: Icons.check,
                  dense: true,
                ),
              if (status == 'approved')
                actionButton(
                  L10n.c('adm.suspend'),
                  _busy
                      ? null
                      : () => _act(() => ApiService.instance
                          .adminPractitionerStatus(id, 'rejected')),
                  color: Colors.orange.shade800,
                  icon: Icons.pause_circle_outline,
                  dense: true,
                ),
              actionButton(
                L10n.c('adm.delete'),
                _busy ? null : () => _confirmDeletePractitioner(p),
                color: Colors.red.shade700,
                icon: Icons.delete_outline,
                dense: true,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDeletePractitioner(Map<String, dynamic> p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dctx) => AlertDialog(
        title: Text(L10n.c('adm.deletePractitionerTitle')),
        content: Text(
          L10n.tArgs(context, 'adm.deletePractitionerBody', {'name': '${p['full_name']}'}),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dctx, false),
            child: Text(L10n.c('adm.cancel')),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            onPressed: () => Navigator.pop(dctx, true),
            child: Text(L10n.c('adm.delete')),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final done = await _act(
      () => ApiService.instance.adminDeletePractitioner('${p['id']}'),
    );
    if (done && mounted) showSnack(context, L10n.c('adm.practitionerDeleted'));
  }

  Widget _practitionersView() {
    final pending = _practitioners.where((p) => p['status'] == 'pending').length;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 90),
        children: [
          if (pending > 0)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                L10n.tArgs(context, 'adm.pendingPractitioners', {'count': '$pending'}),
                style: TextStyle(fontSize: 12, color: AppColors.warning),
              ),
            ),
          if (_practitioners.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 28),
              child: Center(child: Text(L10n.c('adm.noPractitioners'))),
            )
          else
            ..._practitioners.map(_practitionerCard),
        ],
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
            style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          if (lastLogin != null)
            Text(
              L10n.tArgs(context, 'adm.lastLogin', {'date': frDateTime(lastLogin)}),
              style: TextStyle(fontSize: 11, color: AppColors.textMuted),
            ),
        ],
      ),
    );
  }

  Widget _usersView() {
    if (_users.isEmpty) return emptyView(L10n.c('adm.noAccounts'));
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
    L10n.bind(context);
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
                3 => _practitionersView(),
                4 => _usersView(),
                _ => _overviewView(),
              };

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: _tab == 3 && !_loading
          ? FloatingActionButton.extended(
              onPressed: _busy ? null : () => _openPractitionerEditor(),
              icon: const Icon(Icons.add),
              label: Text(L10n.c('adm.addPractitioner')),
            )
          : null,
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                spaceHeader(
                  L10n.t(context, 'adm.title'),
                  subtitle: L10n.t(context, 'adm.subtitle'),
                ),
                const SizedBox(height: 14),
                segmentedTabs(
                  labels: [
                    L10n.t(context, 'adm.tabOverview'),
                    L10n.t(context, 'adm.pharmacies'),
                    L10n.t(context, 'adm.couriers'),
                    L10n.t(context, 'adm.tabPractitioners'),
                    L10n.t(context, 'adm.accounts'),
                  ],
                  icons: const [
                    Icons.dashboard_outlined,
                    Icons.local_pharmacy_outlined,
                    Icons.delivery_dining_outlined,
                    Icons.medical_services_outlined,
                    Icons.group_outlined,
                  ],
                  scrollable: true,
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

/// Entrée vers la file « Ordonnances à vérifier » : les documents que l'IA a
/// signalés comme douteux. Mêmes actions que la page web `/app/admin/reviews`.
class _ReviewEntryCard extends StatelessWidget {
  const _ReviewEntryCard();

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => context.push('/admin/reviews'),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.warning.withAlpha(24),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.warning.withAlpha(110)),
          ),
          child: Row(
            children: [
              Container(
                height: 44,
                width: 44,
                decoration: BoxDecoration(
                  color: AppColors.warning.withAlpha(40),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.verified_user_outlined, color: AppColors.warning),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      L10n.t(context, 'rev.title'),
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      L10n.t(context, 'rev.entrySubtitle'),
                      style: const TextStyle(fontSize: 12),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: AppColors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

/// Accès aux autres sections du back-office web (rendez-vous, patients, avis,
/// quartiers, stocks et WhatsApp).
class _ManagementEntries extends StatelessWidget {
  const _ManagementEntries();

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    final items =
        <({String title, IconData icon, Color color, WidgetBuilder builder})>[
      (
        title: L10n.c('adm.appointments'),
        icon: Icons.event_outlined,
        color: AppColors.accentLight,
        builder: (_) => const AdminAppointmentsScreen(),
      ),
      (
        title: L10n.c('adm.patients'),
        icon: Icons.people_outline,
        color: AppColors.success,
        builder: (_) => const AdminPatientsScreen(),
      ),
      (
        title: L10n.c('adm.feedback'),
        icon: Icons.star_outline,
        color: AppColors.warning,
        builder: (_) => const AdminFeedbackScreen(),
      ),
      (
        title: L10n.c('adm.neighborhoods'),
        icon: Icons.map_outlined,
        color: AppColors.primaryLight,
        builder: (_) => const AdminNeighborhoodsScreen(),
      ),
      (
        title: L10n.c('adm.stocks'),
        icon: Icons.inventory_2_outlined,
        color: AppColors.accentLight,
        builder: (_) => const AdminStocksScreen(),
      ),
      (
        title: L10n.c('adm.whatsapp'),
        icon: Icons.chat_outlined,
        color: AppColors.success,
        builder: (_) => const AdminWhatsappScreen(),
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionTitle(L10n.c('adm.manage')),
        const SizedBox(height: 8),
        LayoutBuilder(
          builder: (context, constraints) {
            final width = (constraints.maxWidth - 8) / 2;
            return Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final item in items)
                  SizedBox(
                    width: width,
                    child: _ManagementTile(
                      title: item.title,
                      icon: item.icon,
                      color: item.color,
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(builder: item.builder),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _ManagementTile extends StatelessWidget {
  const _ManagementTile({
    required this.title,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  final String title;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          decoration: BoxDecoration(
            color: AppColors.surfaceLight,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Container(
                height: 34,
                width: 34,
                decoration: BoxDecoration(
                  color: color.withAlpha(36),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: color, size: 19),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
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

