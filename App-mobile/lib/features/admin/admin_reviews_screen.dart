import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/widgets/notification_bell.dart';

/// File « Ordonnances à vérifier » (espace admin) : les documents que l'IA a
/// signalés comme douteux, critiques en premier. Mêmes actions que la page
/// web `/app/admin/reviews` : valider, refuser, demander une nouvelle photo,
/// corriger l'extraction (ce qui valide aussi).
///
/// Chaque décision notifie le patient : « Ordonnance validée » l'envoie vers
/// le choix du lieu de livraison, « Nouvelle photo requise » vers le scan.
class AdminReviewsScreen extends StatefulWidget {
  const AdminReviewsScreen({super.key});

  @override
  State<AdminReviewsScreen> createState() => _AdminReviewsScreenState();
}

class _AdminReviewsScreenState extends State<AdminReviewsScreen> {
  List<Map<String, dynamic>>? _rows;
  bool _loading = true;
  String? _error;
  String? _busyId;
  String? _editingId;

  final _editDate = TextEditingController();
  final _editDoctor = TextEditingController();
  final _editHospital = TextEditingController();
  final Map<String, Map<String, TextEditingController>> _editItems = {};

  @override
  void dispose() {
    _editDate.dispose();
    _editDoctor.dispose();
    _editHospital.dispose();
    _clearEditControllers();
    super.dispose();
  }

  void _clearEditControllers() {
    for (final m in _editItems.values) {
      for (final c in m.values) {
        c.dispose();
      }
    }
    _editItems.clear();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _error = null;
        if (_rows == null) _loading = true;
      });
    }
    try {
      final rows = await ApiService.instance.adminListReviews();
      if (!mounted) return;
      setState(() {
        _rows = rows;
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
        _error = L10n.c('rev.loadFailed');
        _loading = false;
      });
    }
  }

  Future<void> _act(String id, String decision) async {
    setState(() => _busyId = id);
    try {
      await ApiService.instance.adminResolveReview(id, decision);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            decision == 'approved' ? L10n.c('rev.approved') : L10n.c('rev.rejected'),
          ),
        ),
      );
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      _showError(L10n.c('adm.actionFailed'));
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _retake(String id) async {
    setState(() => _busyId = id);
    try {
      await ApiService.instance.adminRequestRetake(id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(L10n.c('rev.retakeSent'))),
      );
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      _showError(L10n.c('adm.actionFailed'));
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red.shade700),
    );
  }

  void _startEdit(Map<String, dynamic> r) {
    _clearEditControllers();
    _editDate.text = (r['date'] as String?) ?? (r['dateRaw'] as String?) ?? '';
    _editDoctor.text = (r['doctor'] as String?) ?? '';
    _editHospital.text = (r['hospital'] as String?) ?? '';
    for (final raw in ((r['items'] as List?) ?? const [])) {
      final item = raw as Map<String, dynamic>;
      final id = item['id'] as String;
      _editItems[id] = {
        'medicineNameRaw': TextEditingController(text: (item['medicine_name_raw'] as String?) ?? ''),
        'strength': TextEditingController(text: (item['strength'] as String?) ?? ''),
        'dosage': TextEditingController(text: (item['dosage'] as String?) ?? ''),
        'quantity': TextEditingController(text: (item['quantity'] as String?) ?? ''),
        'duration': TextEditingController(text: (item['duration'] as String?) ?? ''),
      };
    }
    setState(() => _editingId = r['id'] as String);
  }

  void _cancelEdit() {
    _clearEditControllers();
    setState(() => _editingId = null);
  }

  /// Champ vide = inchangé (comme sur le web : on n'envoie que le rempli,
  /// ce qui évite d'écraser une valeur par une faute de frappe vide).
  String? _nonEmpty(TextEditingController c) {
    final v = c.text.trim();
    return v.isEmpty ? null : v;
  }

  Future<void> _saveEdit(String id) async {
    setState(() => _busyId = id);
    try {
      final items = _editItems.entries.map((e) {
        return {
          'id': e.key,
          'medicineNameRaw': _nonEmpty(e.value['medicineNameRaw']!),
          'strength': _nonEmpty(e.value['strength']!),
          'dosage': _nonEmpty(e.value['dosage']!),
          'quantity': _nonEmpty(e.value['quantity']!),
          'duration': _nonEmpty(e.value['duration']!),
        };
      }).toList();
      await ApiService.instance.adminEditExtraction(
        prescriptionId: id,
        prescriptionDate: _nonEmpty(_editDate),
        doctorName: _nonEmpty(_editDoctor),
        hospital: _nonEmpty(_editHospital),
        items: items,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(L10n.c('rev.corrected'))),
      );
      _clearEditControllers();
      setState(() => _editingId = null);
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      _showError(L10n.c('rev.saveFailed'));
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  void _zoom(String url) {
    showDialog(
      context: context,
      builder: (context) => Dialog(
        insetPadding: const EdgeInsets.all(12),
        child: Stack(
          children: [
            InteractiveViewer(
              child: Image.network(
                url,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(L10n.c('rev.imageUnavailable')),
                ),
              ),
            ),
            Positioned(
              top: 4,
              right: 4,
              child: IconButton(
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    final rows = _rows;
    return Scaffold(
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
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
                    const NotificationBell(),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        L10n.t(context, 'rev.title'),
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  rows == null
                      ? L10n.t(context, 'rev.subtitle')
                      : rows.isEmpty
                          ? L10n.t(context, 'rev.subtitle')
                          : L10n.tArgs(
                              context,
                              'rev.countPending',
                              {'count': '${rows.length}'},
                            ),
                  style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: _loading
                      ? const Center(child: CircularProgressIndicator())
                      : _error != null
                          ? _StateMessage(
                              icon: Icons.wifi_off,
                              text: _error!,
                              actionLabel: L10n.t(context, 'common.reload'),
                              onAction: _load,
                            )
                          : (rows == null || rows.isEmpty)
                              ? _StateMessage(
                                  icon: Icons.verified_outlined,
                                  text: L10n.t(context, 'rev.nonePending'),
                                  actionLabel: L10n.t(context, 'adm.refresh'),
                                  onAction: _load,
                                )
                              : RefreshIndicator(
                                  onRefresh: _load,
                                  child: ListView.separated(
                                    physics: const AlwaysScrollableScrollPhysics(),
                                    itemCount: rows.length,
                                    separatorBuilder: (_, __) => const SizedBox(height: 14),
                                    itemBuilder: (context, i) => _ReviewCard(
                                      row: rows[i],
                                      busy: _busyId == rows[i]['id'],
                                      editing: _editingId == rows[i]['id'],
                                      onApprove: () => _act(rows[i]['id'] as String, 'approved'),
                                      onReject: () => _act(rows[i]['id'] as String, 'rejected'),
                                      onRetake: () => _retake(rows[i]['id'] as String),
                                      onEdit: () => _startEdit(rows[i]),
                                      onZoom: () {
                                        final url = rows[i]['imageUrl'] as String?;
                                        if (url != null && url.isNotEmpty) _zoom(url);
                                      },
                                      onSaveEdit: () => _saveEdit(rows[i]['id'] as String),
                                      onCancelEdit: _cancelEdit,
                                      editDate: _editDate,
                                      editDoctor: _editDoctor,
                                      editHospital: _editHospital,
                                      editItems: _editItems,
                                    ),
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

class _StateMessage extends StatelessWidget {
  final IconData icon;
  final String text;
  final String actionLabel;
  final VoidCallback onAction;

  const _StateMessage({
    required this.icon,
    required this.text,
    required this.actionLabel,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(
              height: constraints.maxHeight,
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: 48, color: AppColors.textMuted),
                    const SizedBox(height: 16),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text(
                        text,
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.textMuted),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextButton.icon(
                      onPressed: onAction,
                      icon: const Icon(Icons.refresh),
                      label: Text(actionLabel),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

Color _severityColor(String severity) {
  return switch (severity) {
    'critical' => AppColors.danger,
    'minor' => AppColors.primaryDeep,
    _ => AppColors.warning,
  };
}

IconData _severityIcon(String severity) {
  return switch (severity) {
    'critical' => Icons.report_outlined,
    _ => Icons.verified_user_outlined,
  };
}

String _severityLabel(String severity) {
  return switch (severity) {
    'critical' => L10n.c('sev.critical'),
    'moderate' => L10n.c('sev.moderate'),
    'minor' => L10n.c('sev.minor'),
    _ => severity[0].toUpperCase() + severity.substring(1),
  };
}

class _ReviewCard extends StatelessWidget {
  final Map<String, dynamic> row;
  final bool busy;
  final bool editing;
  final VoidCallback onApprove;
  final VoidCallback onReject;
  final VoidCallback onRetake;
  final VoidCallback onEdit;
  final VoidCallback onZoom;
  final VoidCallback onSaveEdit;
  final VoidCallback onCancelEdit;
  final TextEditingController editDate;
  final TextEditingController editDoctor;
  final TextEditingController editHospital;
  final Map<String, Map<String, TextEditingController>> editItems;

  const _ReviewCard({
    required this.row,
    required this.busy,
    required this.editing,
    required this.onApprove,
    required this.onReject,
    required this.onRetake,
    required this.onEdit,
    required this.onZoom,
    required this.onSaveEdit,
    required this.onCancelEdit,
    required this.editDate,
    required this.editDoctor,
    required this.editHospital,
    required this.editItems,
  });

  @override
  Widget build(BuildContext context) {
    final severity = (row['severity'] as String?) ?? 'moderate';
    final sevColor = _severityColor(severity);
    final reasons = ((row['reasons'] as List?) ?? const []).map((r) => '$r').toList();
    final confidence = (row['confidence'] as num?)?.round();
    final details = (row['details'] as Map<String, dynamic>?) ?? const {};
    final unreadable = ((details['unreadableZones'] as List?) ?? const []).map((z) => '$z').toList();
    final inconsistencies =
        ((details['inconsistencies'] as List?) ?? const []).map((c) => '$c').toList();
    final qualityNotes = details['qualityNotes'] as String?;
    final authenticity = (details['authenticityScore'] as num?)?.round();
    final items = ((row['items'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final imageUrl = row['imageUrl'] as String?;

    final patient = (row['patientName'] as String?)?.trim();
    final contact = (row['patientEmail'] as String?)?.trim() ??
        (row['patientPhone'] as String?)?.trim() ??
        '';
    final doctor = (row['doctor'] as String?)?.trim() ?? '';
    final hospital = (row['hospital'] as String?)?.trim() ?? '';
    final date =
        (row['date'] as String?) ?? (row['dateRaw'] as String?) ?? L10n.c('rev.unreadable');
    final dateStatus = details['dateStatus'] as String?;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: AppTheme.glassCard,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (imageUrl != null && imageUrl.isNotEmpty)
                GestureDetector(
                  onTap: onZoom,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.network(
                      imageUrl,
                      height: 150,
                      width: 110,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        height: 150,
                        width: 110,
                        color: AppColors.surfaceLight,
                        child: Icon(Icons.broken_image_outlined,
                            color: AppColors.textMuted),
                      ),
                    ),
                  ),
                ),
              if (imageUrl != null && imageUrl.isNotEmpty) const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        _Chip(
                          icon: _severityIcon(severity),
                          label: _severityLabel(severity),
                          color: sevColor,
                        ),
                        if (confidence != null)
                          _Chip(
                            label: L10n.tArgs(context, 'rev.aiScore', {'value': '$confidence'}),
                            color: AppColors.textMuted,
                          ),
                        if (authenticity != null)
                          _Chip(
                            label:
                                L10n.tArgs(context, 'rev.authenticity', {'value': '$authenticity'}),
                            color: AppColors.textMuted,
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      L10n.tArgs(
                        context,
                        'rev.patient',
                        {'name': '${patient?.isNotEmpty == true ? patient : '—'}'},
                      ),
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                    ),
                    if (contact.isNotEmpty)
                      Text(
                        contact,
                        style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                      ),
                    const SizedBox(height: 4),
                    Text(
                      L10n.tArgs(
                            context,
                            'rev.doctorLine',
                            {
                              'doctor': doctor.isNotEmpty ? doctor : '—',
                              'hospital': hospital.isNotEmpty ? ' ($hospital)' : '',
                              'date': date,
                            },
                          ) +
                          (dateStatus != null ? ' · $dateStatus' : ''),
                      style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (reasons.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: reasons
                  .map((r) => _Chip(label: r, color: AppColors.warning, soft: true))
                  .toList(),
            ),
          ],
          if (unreadable.isNotEmpty || inconsistencies.isNotEmpty || qualityNotes != null) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surfaceLight,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final z in unreadable)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Text(L10n.tArgs(context, 'rev.unreadableZone', {'value': z}),
                          style: const TextStyle(fontSize: 12)),
                    ),
                  for (final c in inconsistencies)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Text(L10n.tArgs(context, 'rev.inconsistency', {'value': c}),
                          style: const TextStyle(fontSize: 12)),
                    ),
                  if (qualityNotes != null)
                    Text(L10n.tArgs(context, 'rev.imageQuality', {'value': qualityNotes}),
                        style: const TextStyle(fontSize: 12)),
                ],
              ),
            ),
          ],
          if (editing)
            _EditForm(
              busy: busy,
              items: items,
              editDate: editDate,
              editDoctor: editDoctor,
              editHospital: editHospital,
              editItems: editItems,
              onSave: onSaveEdit,
              onCancel: onCancelEdit,
            )
          else ...[
            const SizedBox(height: 10),
            if (items.isEmpty)
              Text(L10n.c('rev.noItems'),
                  style: TextStyle(fontSize: 13, color: AppColors.textMuted))
            else
              for (final item in items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text(
                    '• ${_itemLabel(item)}',
                    style: const TextStyle(fontSize: 13),
                  ),
                ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _Action(
                  icon: Icons.check,
                  label: L10n.c('rev.approve'),
                  busy: busy,
                  primary: true,
                  onTap: onApprove,
                ),
                _Action(
                  icon: Icons.close,
                  label: L10n.c('rev.reject'),
                  busy: busy,
                  danger: true,
                  onTap: onReject,
                ),
                _Action(
                  icon: Icons.refresh,
                  label: L10n.c('rev.newPhoto'),
                  busy: busy,
                  onTap: onRetake,
                ),
                _Action(
                  icon: Icons.edit_outlined,
                  label: L10n.c('rev.edit'),
                  busy: busy,
                  onTap: onEdit,
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  static String _itemLabel(Map<String, dynamic> item) {
    final parts = [
      (item['medicine_name_raw'] as String?) ?? '',
      (item['strength'] as String?) ?? '',
      (item['dosage'] as String?) ?? '',
      (item['quantity'] as String?) ?? '',
      (item['duration'] as String?) ?? '',
    ].where((p) => p.trim().isNotEmpty).toList();
    return parts.join(' ');
  }
}

class _Chip extends StatelessWidget {
  final IconData? icon;
  final String label;
  final Color color;
  final bool soft;

  const _Chip({this.icon, required this.label, required this.color, this.soft = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withAlpha(soft ? 26 : 36),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withAlpha(110)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 4),
          ],
          Flexible(
            child: Text(
              label,
              style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _Action extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool busy;
  final bool primary;
  final bool danger;
  final VoidCallback onTap;

  const _Action({
    required this.icon,
    required this.label,
    required this.busy,
    this.primary = false,
    this.danger = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final bg = primary
        ? AppColors.success
        : danger
            ? AppColors.danger
            : AppColors.surfaceLight;
    final fg = (primary || danger) ? Colors.white : AppColors.textPrimary;
    return ElevatedButton.icon(
      onPressed: busy ? null : onTap,
      icon: busy
          ? SizedBox(
              height: 16,
              width: 16,
              child: CircularProgressIndicator(strokeWidth: 2, color: fg),
            )
          : Icon(icon, size: 16, color: fg),
      label: Text(label, style: TextStyle(color: fg)),
      style: ElevatedButton.styleFrom(
        backgroundColor: bg,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        elevation: 0,
      ),
    );
  }
}

class _EditForm extends StatelessWidget {
  final bool busy;
  final List<Map<String, dynamic>> items;
  final TextEditingController editDate;
  final TextEditingController editDoctor;
  final TextEditingController editHospital;
  final Map<String, Map<String, TextEditingController>> editItems;
  final VoidCallback onSave;
  final VoidCallback onCancel;

  const _EditForm({
    required this.busy,
    required this.items,
    required this.editDate,
    required this.editDoctor,
    required this.editHospital,
    required this.editItems,
    required this.onSave,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.primary.withAlpha(18),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.primary.withAlpha(70)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: _field(L10n.c('common.date'), editDate)),
              const SizedBox(width: 8),
              Expanded(child: _field(L10n.c('common.doctor'), editDoctor)),
            ],
          ),
          const SizedBox(height: 8),
          _field(L10n.c('rev.hospital'), editHospital),
          for (final item in items) ...[
            const SizedBox(height: 10),
            Text(
              L10n.c('common.medicine'),
              style: TextStyle(fontSize: 11, color: AppColors.textMuted),
            ),
            const SizedBox(height: 4),
            _field(L10n.c('common.name'), editItems[item['id']]!['medicineNameRaw']!),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(child: _field(L10n.c('rev.dosage'), editItems[item['id']]!['strength']!)),
                const SizedBox(width: 8),
                Expanded(child: _field(L10n.c('rev.frequency'), editItems[item['id']]!['dosage']!)),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(child: _field(L10n.c('common.quantity'), editItems[item['id']]!['quantity']!)),
                const SizedBox(width: 8),
                Expanded(child: _field(L10n.c('common.duration'), editItems[item['id']]!['duration']!)),
              ],
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: busy ? null : onSave,
                  icon: const Icon(Icons.check, size: 16),
                  label: Text(L10n.c('rev.saveApprove')),
                ),
              ),
              const SizedBox(width: 8),
              TextButton(
                onPressed: busy ? null : onCancel,
                child: Text(L10n.c('common.cancel')),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static Widget _field(String label, TextEditingController controller) {
    return TextField(
      controller: controller,
      style: const TextStyle(fontSize: 13),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(fontSize: 12),
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }
}
