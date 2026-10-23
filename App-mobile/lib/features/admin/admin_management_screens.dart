import 'package:flutter/material.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/features/spaces/space_widgets.dart';

// ============================================================================
// Rendez-vous (lecture seule, comme la page web admin)
// ============================================================================

class AdminAppointmentsScreen extends StatefulWidget {
  const AdminAppointmentsScreen({super.key});

  @override
  State<AdminAppointmentsScreen> createState() => _AdminAppointmentsScreenState();
}

class _AdminAppointmentsScreenState extends State<AdminAppointmentsScreen> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _error = null);
    try {
      final rows = await ApiService.instance.adminAppointments();
      if (!mounted) return;
      setState(() {
        _items = rows;
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
  Widget build(BuildContext context) {
    L10n.bind(context);
    final filtered = _filter == 'all'
        ? _items
        : _items.where((a) => '${a['status']}' == _filter).toList();
    return Scaffold(
      appBar: AppBar(title: Text(L10n.c('adm.appointments'))),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? errorView(_error!, _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    children: [
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            for (final f in const [
                              'all',
                              'requested',
                              'accepted',
                              'rescheduled',
                              'completed',
                              'rejected',
                            ])
                              Padding(
                                padding: const EdgeInsets.only(right: 8),
                                child: FilterChip(
                                  label: Text(f == 'all' ? L10n.c('adm.all') : appLabel(f)),
                                  selected: _filter == f,
                                  onSelected: (_) => setState(() => _filter = f),
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      if (filtered.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 40),
                          child: Center(child: Text(L10n.c('adm.noAppointments'))),
                        )
                      else
                        ...filtered.map((a) {
                          final status = '${a['status']}';
                          final when = parseDate(a['scheduled_at']) ??
                              parseDate(a['requested_at']);
                          return SpaceCard(
                            margin: const EdgeInsets.only(bottom: 10),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        '${a['patient_name'] ?? a['patient_email'] ?? '—'}',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w600,
                                          fontSize: 14.5,
                                        ),
                                      ),
                                    ),
                                    statusChip(appLabel(status), statusColor(status)),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${a['practitioner_name'] ?? '—'}'
                                  '${a['practitioner_specialty'] != null ? ' · ${a['practitioner_specialty']}' : ''}',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${L10n.c('pr.reason')}: ${a['reason'] ?? '—'}',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textMuted,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  [
                                    if (when != null) frDateTime(when),
                                    if (a['at_home'] == true) L10n.c('pr.atHome'),
                                    if ((a['patient_phone'] ?? '').toString().isNotEmpty)
                                      '${a['patient_phone']}',
                                  ].join(' · '),
                                  style: TextStyle(
                                    fontSize: 11.5,
                                    color: AppColors.textMuted,
                                  ),
                                ),
                              ],
                            ),
                          );
                        }),
                    ],
                  ),
                ),
    );
  }
}

// ============================================================================
// Patients
// ============================================================================

class AdminPatientsScreen extends StatefulWidget {
  const AdminPatientsScreen({super.key});

  @override
  State<AdminPatientsScreen> createState() => _AdminPatientsScreenState();
}

class _AdminPatientsScreenState extends State<AdminPatientsScreen> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _error = null);
    try {
      final rows = await ApiService.instance.adminPatients();
      if (!mounted) return;
      setState(() {
        _items = rows;
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
  Widget build(BuildContext context) {
    L10n.bind(context);
    final q = _query.trim().toLowerCase();
    final filtered = q.isEmpty
        ? _items
        : _items.where((p) {
            final hay = [
              p['full_name'],
              p['email'],
              p['phone'],
              p['neighborhood'],
            ].whereType<Object>().join(' ').toLowerCase();
            return hay.contains(q);
          }).toList();
    return Scaffold(
      appBar: AppBar(title: Text(L10n.c('adm.patients'))),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? errorView(_error!, _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    children: [
                      TextField(
                        decoration: InputDecoration(
                          labelText: L10n.c('adm.search'),
                          prefixIcon: const Icon(Icons.search),
                        ),
                        onChanged: (v) => setState(() => _query = v),
                      ),
                      const SizedBox(height: 12),
                      if (filtered.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 40),
                          child: Center(child: Text(L10n.c('adm.noPatients'))),
                        )
                      else
                        ...filtered.map(
                          (p) => SpaceCard(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(
                                '${p['full_name'] ?? p['email'] ?? '—'}',
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              subtitle: Text(
                                [
                                  if ((p['phone'] ?? '').toString().isNotEmpty)
                                    '${p['phone']}',
                                  if ((p['neighborhood'] ?? '').toString().isNotEmpty)
                                    '${p['neighborhood']}',
                                  L10n.tArgs(
                                    context,
                                    'adm.ordersCount',
                                    {'count': '${p['orders_count'] ?? 0}'},
                                  ),
                                ].join(' · '),
                                style: const TextStyle(fontSize: 12),
                              ),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => AdminPatientDetailScreen(patient: p),
                                ),
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

class AdminPatientDetailScreen extends StatefulWidget {
  const AdminPatientDetailScreen({super.key, required this.patient});

  final Map<String, dynamic> patient;

  @override
  State<AdminPatientDetailScreen> createState() => _AdminPatientDetailScreenState();
}

class _AdminPatientDetailScreenState extends State<AdminPatientDetailScreen> {
  List<Map<String, dynamic>> _orders = [];
  bool _loading = true;
  String? _error;
  late bool _isAdmin;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _isAdmin = ((widget.patient['roles'] as List?) ?? const []).contains('admin');
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = await ApiService.instance
          .adminPatientOrders('${widget.patient['user_id']}');
      if (!mounted) return;
      setState(() {
        _orders = rows;
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

  Future<void> _toggleAdmin() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await ApiService.instance
          .adminSetPatientAdmin('${widget.patient['user_id']}', !_isAdmin);
      if (!mounted) return;
      setState(() => _isAdmin = !_isAdmin);
      showSnack(context, L10n.c('adm.saved'));
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } catch (_) {
      if (mounted) showSnack(context, L10n.c('adm.actionFailed'), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    final p = widget.patient;
    return Scaffold(
      appBar: AppBar(
        title: Text('${p['full_name'] ?? p['email'] ?? L10n.c('adm.patients')}'),
        actions: [
          TextButton.icon(
            onPressed: _busy ? null : _toggleAdmin,
            icon: Icon(_isAdmin ? Icons.remove_moderator : Icons.admin_panel_settings),
            label: Text(
              _isAdmin ? L10n.c('adm.revokeAdmin') : L10n.c('adm.grantAdmin'),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SpaceCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${p['email'] ?? '—'}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Text(
                  [
                    if ((p['phone'] ?? '').toString().isNotEmpty) '${p['phone']}',
                    if ((p['neighborhood'] ?? '').toString().isNotEmpty)
                      '${p['neighborhood']}',
                  ].join(' · '),
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  children: [
                    for (final r in (p['roles'] as List?) ?? const [])
                      statusChip(roleInfo('$r').$1, roleInfo('$r').$2),
                    if (_isAdmin) statusChip(L10n.c('adm.adminRole'), Colors.red.shade400),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          sectionTitle(L10n.c('adm.orderHistory')),
          const SizedBox(height: 8),
          if (_loading)
            const Center(child: Padding(
              padding: EdgeInsets.all(24),
              child: CircularProgressIndicator(),
            ))
          else if (_error != null)
            errorView(_error!, _load)
          else if (_orders.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(child: Text(L10n.c('adm.noOrders'))),
            )
          else
            ..._orders.map(
              (o) => SpaceCard(
                margin: const EdgeInsets.only(bottom: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${o['pharmacy'] ?? '—'}',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                        statusChip(resLabel('${o['status']}'), statusColor('${o['status']}')),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      [
                        frAmount((o['total_amount'] as num?) ?? 0),
                        if ((o['neighborhood'] ?? '').toString().isNotEmpty)
                          '${o['neighborhood']}',
                        frDateTime(parseDate(o['created_at'])),
                      ].join(' · '),
                      style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ============================================================================
// Avis clients
// ============================================================================

class AdminFeedbackScreen extends StatefulWidget {
  const AdminFeedbackScreen({super.key});

  @override
  State<AdminFeedbackScreen> createState() => _AdminFeedbackScreenState();
}

class _AdminFeedbackScreenState extends State<AdminFeedbackScreen> {
  Map<String, dynamic> _data = const {};
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _error = null);
    try {
      final data = await ApiService.instance.adminFeedback();
      if (!mounted) return;
      setState(() {
        _data = data;
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
  Widget build(BuildContext context) {
    L10n.bind(context);
    final rows = ((_data['rows'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final averages =
        ((_data['averages'] as List?) ?? const []).cast<Map<String, dynamic>>();
    return Scaffold(
      appBar: AppBar(title: Text(L10n.c('adm.feedback'))),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? errorView(_error!, _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: StatCard(
                              label: L10n.c('adm.overall'),
                              value: '${_data['overall'] ?? 0} / 5',
                              color: AppColors.warning,
                              icon: Icons.star,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: StatCard(
                              label: L10n.c('adm.reviews'),
                              value: '${rows.length}',
                              icon: Icons.rate_review_outlined,
                            ),
                          ),
                        ],
                      ),
                      if (averages.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        sectionTitle(L10n.c('adm.byPharmacy')),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final a in averages)
                              statusChip(
                                '${a['name']} · ${a['average']} (${a['count']})',
                                AppColors.accentLight,
                              ),
                          ],
                        ),
                      ],
                      const SizedBox(height: 16),
                      if (rows.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 32),
                          child: Center(child: Text(L10n.c('adm.noFeedback'))),
                        )
                      else
                        ...rows.map((r) {
                          final rating = (r['rating'] as num?)?.toInt() ?? 0;
                          return SpaceCard(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(
                                      '${List.filled(rating, '★').join()}'
                                      '${List.filled(5 - rating, '☆').join()}',
                                      style: TextStyle(
                                        color: AppColors.warning,
                                        fontSize: 15,
                                      ),
                                    ),
                                    const Spacer(),
                                    Text(
                                      frDateTime(parseDate(r['createdAt'])),
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: AppColors.textMuted,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${r['pharmacyName'] ?? '—'}',
                                  style: const TextStyle(fontWeight: FontWeight.w600),
                                ),
                                if ((r['comment'] ?? '').toString().isNotEmpty) ...[
                                  const SizedBox(height: 3),
                                  Text('${r['comment']}'),
                                ],
                                if ((r['phone'] ?? '').toString().isNotEmpty)
                                  Text(
                                    '${r['phone']}',
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      color: AppColors.textMuted,
                                    ),
                                  ),
                              ],
                            ),
                          );
                        }),
                    ],
                  ),
                ),
    );
  }
}

// ============================================================================
// Quartiers
// ============================================================================

class AdminNeighborhoodsScreen extends StatefulWidget {
  const AdminNeighborhoodsScreen({super.key});

  @override
  State<AdminNeighborhoodsScreen> createState() => _AdminNeighborhoodsScreenState();
}

class _AdminNeighborhoodsScreenState extends State<AdminNeighborhoodsScreen> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _error = null);
    try {
      final rows = await ApiService.instance.adminNeighborhoods();
      if (!mounted) return;
      setState(() {
        _items = rows;
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

  Future<void> _edit([Map<String, dynamic>? n]) async {
    final name = TextEditingController(text: '${n?['name'] ?? ''}');
    final city = TextEditingController(text: '${n?['city'] ?? 'Bamako'}');
    final lat = TextEditingController(text: '${n?['lat'] ?? 12.639}');
    final lng = TextEditingController(text: '${n?['lng'] ?? -8.002}');
    var active = n?['is_active'] != false;
    await showDialog<void>(
      context: context,
      builder: (dctx) => StatefulBuilder(
        builder: (dctx, setLocal) => AlertDialog(
          scrollable: true,
          title: Text(n == null ? L10n.c('adm.addNeighborhood') : L10n.c('adm.edit')),
          content: SizedBox(
            width: 420,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: name,
                  decoration: InputDecoration(labelText: L10n.c('adm.name')),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: city,
                  decoration: InputDecoration(labelText: L10n.c('adm.city')),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: lat,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Latitude'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: lng,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Longitude'),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(L10n.c('adm.activeLabel')),
                  value: active,
                  onChanged: (v) => setLocal(() => active = v),
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
              onPressed: () async {
                final la = double.tryParse(lat.text.trim());
                final ln = double.tryParse(lng.text.trim());
                if (name.text.trim().length < 2 || la == null || ln == null) {
                  showSnack(dctx, L10n.c('adm.invalidNeighborhood'), error: true);
                  return;
                }
                Navigator.pop(dctx);
                try {
                  await ApiService.instance.adminSaveNeighborhood({
                    if (n != null) 'id': '${n['id']}',
                    'name': name.text.trim(),
                    'city': city.text.trim().isEmpty ? 'Bamako' : city.text.trim(),
                    'lat': la,
                    'lng': ln,
                    'is_active': active,
                  });
                  await _load();
                  if (mounted) showSnack(context, L10n.c('adm.saved'));
                } on ApiException catch (e) {
                  if (mounted) showSnack(context, e.message, error: true);
                } catch (_) {
                  if (mounted) showSnack(context, L10n.c('adm.actionFailed'), error: true);
                }
              },
              child: Text(L10n.c('adm.save')),
            ),
          ],
        ),
      ),
    );
    name.dispose();
    city.dispose();
    lat.dispose();
    lng.dispose();
  }

  Future<void> _toggle(Map<String, dynamic> n, bool value) async {
    try {
      await ApiService.instance.adminToggleNeighborhood('${n['id']}', value);
      await _load();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } catch (_) {
      if (mounted) showSnack(context, L10n.c('adm.actionFailed'), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    return Scaffold(
      appBar: AppBar(title: Text(L10n.c('adm.neighborhoods'))),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _loading ? null : () => _edit(),
        icon: const Icon(Icons.add_location_alt_outlined),
        label: Text(L10n.c('adm.addNeighborhood')),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? errorView(_error!, _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _items.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: [
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 60),
                              child: Center(child: Text(L10n.c('adm.noNeighborhoods'))),
                            ),
                          ],
                        )
                      : ListView.builder(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                          itemCount: _items.length,
                          itemBuilder: (context, i) {
                            final n = _items[i];
                            final active = n['is_active'] != false;
                            return SpaceCard(
                              margin: const EdgeInsets.only(bottom: 8),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          '${n['name']}',
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                        Text(
                                          '${n['city']} · ${n['lat']}, ${n['lng']}',
                                          style: TextStyle(
                                            fontSize: 11.5,
                                            color: AppColors.textMuted,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Switch(
                                    value: active,
                                    onChanged: (v) => _toggle(n, v),
                                  ),
                                  IconButton(
                                    onPressed: () => _edit(n),
                                    icon: const Icon(Icons.edit_outlined),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                ),
    );
  }
}

// ============================================================================
// Stocks des pharmacies
// ============================================================================

class AdminStocksScreen extends StatefulWidget {
  const AdminStocksScreen({super.key});

  @override
  State<AdminStocksScreen> createState() => _AdminStocksScreenState();
}

class _AdminStocksScreenState extends State<AdminStocksScreen> {
  List<Map<String, dynamic>> _pharmacies = [];
  List<Map<String, dynamic>> _rows = [];
  String? _selected;
  bool _loading = true;
  bool _rowsLoading = false;
  String? _error;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _loadPharmacies();
  }

  Future<void> _loadPharmacies() async {
    try {
      final rows = await ApiService.instance.adminInventoryPharmacies();
      if (!mounted) return;
      setState(() {
        _pharmacies = rows;
        _selected = rows.isNotEmpty ? '${rows.first['id']}' : null;
        _loading = false;
      });
      if (_selected != null) await _loadRows();
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

  Future<void> _loadRows() async {
    final pharmacyId = _selected;
    if (pharmacyId == null) return;
    setState(() => _rowsLoading = true);
    try {
      final rows = await ApiService.instance.adminInventory(pharmacyId);
      if (!mounted) return;
      setState(() {
        _rows = rows;
        _rowsLoading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _rowsLoading = false);
      showSnack(context, e.message, error: true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _rowsLoading = false);
      showSnack(context, L10n.c('adm.loadFailed'), error: true);
    }
  }

  Future<void> _editRow(Map<String, dynamic> row) async {
    final med = (row['medicines'] as Map<String, dynamic>?) ?? const {};
    final stock = TextEditingController(text: '${row['stock_qty'] ?? 0}');
    final price = TextEditingController(
      text: row['price'] == null ? '' : (row['price'] as num).toStringAsFixed(0),
    );
    await showDialog<void>(
      context: context,
      builder: (dctx) => AlertDialog(
        title: Text(medicineLabel(med)),
        content: SizedBox(
          width: 380,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: stock,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: L10n.c('adm.stockQty')),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: price,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(labelText: L10n.c('adm.price')),
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
            onPressed: () async {
              final s = int.tryParse(stock.text.trim());
              if (s == null) {
                showSnack(dctx, L10n.c('adm.invalidStock'), error: true);
                return;
              }
              final p = price.text.trim().isEmpty
                  ? null
                  : double.tryParse(price.text.trim().replaceAll(',', '.'));
              Navigator.pop(dctx);
              try {
                await ApiService.instance.adminInventoryUpdate(
                  '${row['id']}',
                  stock: s,
                  price: p,
                );
                await _loadRows();
                if (mounted) showSnack(context, L10n.c('adm.saved'));
              } on ApiException catch (e) {
                if (mounted) showSnack(context, e.message, error: true);
              } catch (_) {
                if (mounted) showSnack(context, L10n.c('adm.actionFailed'), error: true);
              }
            },
            child: Text(L10n.c('adm.save')),
          ),
        ],
      ),
    );
    stock.dispose();
    price.dispose();
  }

  Future<void> _addMedicine() async {
    if (_selected == null) return;
    final name = TextEditingController();
    final generic = TextEditingController();
    final strength = TextEditingController();
    final stock = TextEditingController(text: '1');
    final price = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (dctx) => AlertDialog(
        scrollable: true,
        title: Text(L10n.c('adm.addMedicine')),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: name,
                decoration: InputDecoration(labelText: L10n.c('adm.medicineName')),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: generic,
                decoration: InputDecoration(labelText: L10n.c('adm.genericName')),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: strength,
                decoration: InputDecoration(labelText: L10n.c('adm.strength')),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: stock,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: L10n.c('adm.stockQty')),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: price,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(labelText: L10n.c('adm.price')),
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
            onPressed: () async {
              final s = int.tryParse(stock.text.trim());
              if (name.text.trim().isEmpty || s == null) {
                showSnack(dctx, L10n.c('adm.invalidStock'), error: true);
                return;
              }
              final p = price.text.trim().isEmpty
                  ? null
                  : double.tryParse(price.text.trim().replaceAll(',', '.'));
              Navigator.pop(dctx);
              try {
                await ApiService.instance.adminInventoryUpsert(
                  _selected!,
                  name: name.text.trim(),
                  generic: generic.text,
                  strength: strength.text,
                  stock: s,
                  price: p,
                );
                await _loadRows();
                if (mounted) showSnack(context, L10n.c('adm.saved'));
              } on ApiException catch (e) {
                if (mounted) showSnack(context, e.message, error: true);
              } catch (_) {
                if (mounted) showSnack(context, L10n.c('adm.actionFailed'), error: true);
              }
            },
            child: Text(L10n.c('adm.save')),
          ),
        ],
      ),
    );
    name.dispose();
    generic.dispose();
    strength.dispose();
    stock.dispose();
    price.dispose();
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    final q = _query.trim().toLowerCase();
    final filtered = q.isEmpty
        ? _rows
        : _rows.where((r) {
            final med = (r['medicines'] as Map<String, dynamic>?) ?? const {};
            return medicineLabel(med).toLowerCase().contains(q);
          }).toList();
    return Scaffold(
      appBar: AppBar(title: Text(L10n.c('adm.stocks'))),
      floatingActionButton: _selected == null
          ? null
          : FloatingActionButton.extended(
              onPressed: _addMedicine,
              icon: const Icon(Icons.add),
              label: Text(L10n.c('adm.addMedicine')),
            ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? errorView(_error!, _loadPharmacies)
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: DropdownButtonFormField<String>(
                        initialValue: _selected,
                        isExpanded: true,
                        decoration: InputDecoration(
                          labelText: L10n.c('adm.selectPharmacy'),
                        ),
                        items: _pharmacies
                            .map(
                              (p) => DropdownMenuItem(
                                value: '${p['id']}',
                                child: Text(
                                  '${p['name']}',
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: (v) {
                          setState(() {
                            _selected = v;
                            _rows = [];
                          });
                          _loadRows();
                        },
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
                      child: TextField(
                        decoration: InputDecoration(
                          labelText: L10n.c('adm.search'),
                          prefixIcon: const Icon(Icons.search),
                        ),
                        onChanged: (v) => setState(() => _query = v),
                      ),
                    ),
                    Expanded(
                      child: _rowsLoading
                          ? const Center(child: CircularProgressIndicator())
                          : RefreshIndicator(
                              onRefresh: _loadRows,
                              child: filtered.isEmpty
                                  ? ListView(
                                      physics: const AlwaysScrollableScrollPhysics(),
                                      children: [
                                        Padding(
                                          padding: const EdgeInsets.symmetric(
                                            vertical: 60,
                                          ),
                                          child: Center(
                                            child: Text(L10n.c('adm.noStock')),
                                          ),
                                        ),
                                      ],
                                    )
                                  : ListView.builder(
                                      physics: const AlwaysScrollableScrollPhysics(),
                                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 90),
                                      itemCount: filtered.length,
                                      itemBuilder: (context, i) {
                                        final row = filtered[i];
                                        final med = (row['medicines']
                                                as Map<String, dynamic>?) ??
                                            const {};
                                        final stock =
                                            (row['stock_qty'] as num?)?.toInt() ?? 0;
                                        final price = row['price'] as num?;
                                        final low = stock <= 5;
                                        return SpaceCard(
                                          margin: const EdgeInsets.only(bottom: 8),
                                          child: Row(
                                            children: [
                                              Expanded(
                                                child: Column(
                                                  crossAxisAlignment:
                                                      CrossAxisAlignment.start,
                                                  children: [
                                                    Text(
                                                      medicineLabel(med),
                                                      style: const TextStyle(
                                                        fontWeight: FontWeight.w600,
                                                      ),
                                                    ),
                                                    Text(
                                                      '${L10n.c('adm.stockQty')}: $stock'
                                                      '${price != null ? ' · ${frAmount(price)}' : ''}',
                                                      style: TextStyle(
                                                        fontSize: 12,
                                                        color: low
                                                            ? AppColors.warning
                                                            : AppColors.textMuted,
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                              ),
                                              IconButton(
                                                onPressed: () => _editRow(row),
                                                icon: const Icon(Icons.edit_outlined),
                                              ),
                                            ],
                                          ),
                                        );
                                      },
                                    ),
                            ),
                    ),
                  ],
                ),
    );
  }
}

// ============================================================================
// WhatsApp
// ============================================================================

class AdminWhatsappScreen extends StatefulWidget {
  const AdminWhatsappScreen({super.key});

  @override
  State<AdminWhatsappScreen> createState() => _AdminWhatsappScreenState();
}

class _AdminWhatsappScreenState extends State<AdminWhatsappScreen> {
  Map<String, dynamic> _data = const {};
  List<Map<String, dynamic>> _templates = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _error = null);
    try {
      final results = await Future.wait([
        ApiService.instance.adminWhatsapp(),
        ApiService.instance.adminWhatsappTemplates(),
      ]);
      if (!mounted) return;
      setState(() {
        _data = results[0] as Map<String, dynamic>;
        _templates = (results[1] as List).cast<Map<String, dynamic>>();
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

  Future<void> _editTemplate(Map<String, dynamic> t) async {
    final values = (t['values'] as Map<String, dynamic>?) ?? const {};
    var lang = 'fr';
    final body = TextEditingController(
      text: '${(values[lang] as Map<String, dynamic>?)?['body'] ?? ''}',
    );
    await showDialog<void>(
      context: context,
      builder: (dctx) => StatefulBuilder(
        builder: (dctx, setLocal) => AlertDialog(
          scrollable: true,
          title: Text('${t['label'] ?? t['key']}'),
          content: SizedBox(
            width: 460,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: lang,
                  decoration: const InputDecoration(labelText: 'Langue'),
                  items: const [
                    DropdownMenuItem(value: 'fr', child: Text('Français')),
                    DropdownMenuItem(value: 'en', child: Text('English')),
                    DropdownMenuItem(value: 'ar', child: Text('العربية')),
                  ],
                  onChanged: (v) {
                    final next = v ?? 'fr';
                    setLocal(() {
                      lang = next;
                      body.text =
                          '${(values[next] as Map<String, dynamic>?)?['body'] ?? ''}';
                    });
                  },
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: body,
                  maxLines: 8,
                  decoration: InputDecoration(
                    labelText: L10n.c('adm.templateBody'),
                    alignLabelWithHint: true,
                  ),
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
              onPressed: () async {
                Navigator.pop(dctx);
                try {
                  await ApiService.instance.adminSaveWhatsappTemplate(
                    key: '${t['key']}',
                    lang: lang,
                    body: body.text,
                  );
                  await _load();
                  if (mounted) showSnack(context, L10n.c('adm.saved'));
                } on ApiException catch (e) {
                  if (mounted) showSnack(context, e.message, error: true);
                } catch (_) {
                  if (mounted) showSnack(context, L10n.c('adm.actionFailed'), error: true);
                }
              },
              child: Text(L10n.c('adm.save')),
            ),
          ],
        ),
      ),
    );
    body.dispose();
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    final orders = ((_data['orders'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final sessions =
        ((_data['sessions'] as List?) ?? const []).cast<Map<String, dynamic>>();
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text(L10n.c('adm.whatsapp')),
          bottom: TabBar(
            tabs: [
              Tab(text: L10n.c('adm.tracking')),
              Tab(text: L10n.c('adm.conversations')),
              Tab(text: L10n.c('adm.templates')),
            ],
          ),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? errorView(_error!, _load)
                : TabBarView(
                    children: [
                      RefreshIndicator(
                        onRefresh: _load,
                        child: orders.isEmpty
                            ? ListView(
                                physics: const AlwaysScrollableScrollPhysics(),
                                children: [
                                  Padding(
                                    padding: const EdgeInsets.symmetric(vertical: 60),
                                    child: Center(
                                      child: Text(L10n.c('adm.noWhatsappOrders')),
                                    ),
                                  ),
                                ],
                              )
                            : ListView.builder(
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding: const EdgeInsets.all(16),
                                itemCount: orders.length,
                                itemBuilder: (context, i) {
                                  final o = orders[i];
                                  return SpaceCard(
                                    margin: const EdgeInsets.only(bottom: 8),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Expanded(
                                              child: Text(
                                                '${o['patient_name'] ?? o['patient_phone'] ?? '—'}',
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w600,
                                                ),
                                              ),
                                            ),
                                            statusChip(
                                              resLabel('${o['status']}'),
                                              statusColor('${o['status']}'),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 3),
                                        Text(
                                          [
                                            if ((o['pharmacy'] ?? '').toString().isNotEmpty)
                                              '${o['pharmacy']}',
                                            if ((o['neighborhood'] ?? '').toString().isNotEmpty)
                                              '${o['neighborhood']}',
                                            frAmount((o['total_amount'] as num?) ?? 0),
                                          ].join(' · '),
                                          style: TextStyle(
                                            fontSize: 12,
                                            color: AppColors.textMuted,
                                          ),
                                        ),
                                      ],
                                    ),
                                  );
                                },
                              ),
                      ),
                      RefreshIndicator(
                        onRefresh: _load,
                        child: sessions.isEmpty
                            ? ListView(
                                physics: const AlwaysScrollableScrollPhysics(),
                                children: [
                                  Padding(
                                    padding: const EdgeInsets.symmetric(vertical: 60),
                                    child: Center(
                                      child: Text(L10n.c('adm.noConversations')),
                                    ),
                                  ),
                                ],
                              )
                            : ListView.builder(
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding: const EdgeInsets.all(16),
                                itemCount: sessions.length,
                                itemBuilder: (context, i) {
                                  final s = sessions[i];
                                  return SpaceCard(
                                    margin: const EdgeInsets.only(bottom: 8),
                                    child: ListTile(
                                      contentPadding: EdgeInsets.zero,
                                      title: Text(
                                        '${s['wa_name'] ?? s['wa_phone'] ?? '—'}',
                                      ),
                                      subtitle: Text(
                                        '${s['wa_phone']} · ${s['state']} · ${s['language']}',
                                        style: const TextStyle(fontSize: 12),
                                      ),
                                      trailing: statusChip(
                                        s['linked'] == true
                                            ? L10n.c('adm.linked')
                                            : L10n.c('adm.notLinked'),
                                        s['linked'] == true
                                            ? AppColors.success
                                            : AppColors.textMuted,
                                      ),
                                    ),
                                  );
                                },
                              ),
                      ),
                      ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _templates.length,
                        itemBuilder: (context, i) {
                          final t = _templates[i];
                          return SpaceCard(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text('${t['label'] ?? t['key']}'),
                              subtitle: Text(
                                '${t['key']}',
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: AppColors.textMuted,
                                ),
                              ),
                              trailing: const Icon(Icons.edit_outlined),
                              onTap: () => _editTemplate(t),
                            ),
                          );
                        },
                      ),
                    ],
                  ),
      ),
    );
  }
}
