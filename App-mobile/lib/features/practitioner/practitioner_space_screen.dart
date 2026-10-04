import 'package:flutter/material.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/features/spaces/space_widgets.dart';

/// Espace Praticien : demandes de rendez-vous, acceptation et suivi.
class PractitionerSpaceScreen extends StatefulWidget {
  const PractitionerSpaceScreen({super.key});

  @override
  State<PractitionerSpaceScreen> createState() => _PractitionerSpaceScreenState();
}

class _PractitionerSpaceScreenState extends State<PractitionerSpaceScreen> {
  bool _loading = true;
  String? _error;
  bool _busy = false;

  Map<String, dynamic>? _me;
  List<Map<String, dynamic>> _appointments = [];
  Map<String, dynamic> _counts = const {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _error = null);
    try {
      final data = await ApiService.instance.practitionerDashboard();
      if (!mounted) return;
      setState(() {
        _me = data['me'] as Map<String, dynamic>?;
        _appointments =
            ((data['appointments'] as List?) ?? const []).cast<Map<String, dynamic>>();
        _counts = (data['counts'] as Map<String, dynamic>?) ?? const {};
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
        _error = 'Impossible de charger vos rendez-vous.';
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

  /// Sélecteur date + heure → ISO 8601 UTC (format attendu par l'API).
  Future<String?> _pickDateTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year, now.month, now.day),
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return null;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(now.add(const Duration(hours: 1))),
    );
    if (time == null) return null;
    final dt = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    return dt.toUtc().toIso8601String();
  }

  Future<void> _pickAndRespond(Map<String, dynamic> a, String action) async {
    final at = await _pickDateTime();
    if (at == null || !mounted) return;
    await _act(() => ApiService.instance.practitionerRespond(
          a['id'] as String,
          action: action,
          at: at,
        ));
  }

  Future<void> _rejectFlow(Map<String, dynamic> a) async {
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Text(
          'Refuser le rendez-vous',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        content: TextField(
          controller: ctrl,
          maxLines: 3,
          decoration: const InputDecoration(hintText: 'Motif du refus (facultatif)'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text('Refuser', style: TextStyle(color: Colors.red.shade400)),
          ),
        ],
      ),
    );
    final reason = ctrl.text.trim();
    ctrl.dispose();
    if (ok != true || !mounted) return;
    await _act(() => ApiService.instance.practitionerRespond(
          a['id'] as String,
          action: 'reject',
          reason: reason.isEmpty ? null : reason,
        ));
  }

  Widget _appointmentCard(Map<String, dynamic> a) {
    final status = a['status'] as String?;
    final when = parseDate(a['scheduled_at']) ??
        parseDate(a['proposed_at']) ??
        parseDate(a['requested_at']);
    final atHome = a['at_home'] == true;
    final reason = (a['reason'] as String?) ?? '';
    final symptoms = (a['symptoms'] as String?) ?? '';
    final rejection = (a['rejection_reason'] as String?) ?? '';

    return SpaceCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  (a['patient_name'] as String?) ?? 'Patient',
                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600),
                ),
              ),
              statusChip(
                appointmentLabels[status] ?? '$status',
                statusColor(status),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Icon(Icons.schedule, size: 13, color: AppColors.textMuted),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  frDateTime(when),
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              ),
              if (atHome)
                Padding(
                  padding: EdgeInsets.only(left: 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.home_outlined, size: 13, color: AppColors.accentLight),
                      SizedBox(width: 3),
                      Text(
                        'À domicile',
                        style: TextStyle(fontSize: 11.5, color: AppColors.accentLight),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          if (reason.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              reason,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ],
          if (symptoms.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(
              symptoms,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12.5, color: AppColors.textSecondary),
            ),
          ],
          if (rejection.isNotEmpty && status == 'rejected') ...[
            const SizedBox(height: 6),
            Text(
              'Motif : $rejection',
              style: TextStyle(fontSize: 12, color: Colors.red.shade400),
            ),
          ],
          if (status == 'requested' ||
              status == 'accepted' ||
              status == 'rescheduled') ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (status == 'requested') ...[
                  actionButton(
                    'Accepter',
                    _busy ? null : () => _pickAndRespond(a, 'accept'),
                    icon: Icons.event_available_outlined,
                    dense: true,
                  ),
                  actionButton(
                    'Refuser',
                    _busy ? null : () => _rejectFlow(a),
                    color: Colors.red.shade700,
                    icon: Icons.close,
                    dense: true,
                  ),
                ] else ...[
                  actionButton(
                    'Reprogrammer',
                    _busy ? null : () => _pickAndRespond(a, 'reschedule'),
                    color: AppColors.accent,
                    icon: Icons.edit_calendar_outlined,
                    dense: true,
                  ),
                  actionButton(
                    'Terminer',
                    _busy
                        ? null
                        : () => _act(() => ApiService.instance
                            .practitionerRespond(a['id'] as String, complete: true)),
                    color: AppColors.success,
                    icon: Icons.done_all,
                    dense: true,
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final me = _me;
    final type = roleInfo((me?['type'] as String?) ?? '');

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
                  'Espace Praticien',
                  subtitle: me == null
                      ? null
                      : '${me['full_name'] ?? type.$1}',
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: StatCard(
                        label: 'Demandes',
                        value: '${_counts['requested'] ?? 0}',
                        icon: Icons.mark_unread_chat_alt_outlined,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: StatCard(
                        label: 'Aujourd’hui',
                        value: '${_counts['today'] ?? 0}',
                        color: AppColors.warning,
                        icon: Icons.today_outlined,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: StatCard(
                        label: 'À venir',
                        value: '${_counts['upcoming'] ?? 0}',
                        color: AppColors.accentLight,
                        icon: Icons.upcoming_outlined,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: StatCard(
                        label: 'Terminés',
                        value: '${_counts['completed'] ?? 0}',
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
                          : me == null
                              ? emptyView(
                                  'Aucun profil praticien lié à ce compte.\n\nContactez l’administration pour relié votre profil.',
                                )
                              : _appointments.isEmpty
                                  ? RefreshIndicator(
                                      onRefresh: _load,
                                      child: ListView(
                                        physics: const AlwaysScrollableScrollPhysics(),
                                        children: [
                                          SizedBox(
                                            height: 220,
                                            child: emptyView(
                                              'Aucun rendez-vous pour le moment.\n\nLes demandes des patients apparaîtront ici.',
                                            ),
                                          ),
                                        ],
                                      ),
                                    )
                                  : RefreshIndicator(
                                      onRefresh: _load,
                                      child: ListView.separated(
                                        physics: const AlwaysScrollableScrollPhysics(),
                                        itemCount: _appointments.length,
                                        separatorBuilder: (_, __) =>
                                            const SizedBox(height: 2),
                                        itemBuilder: (_, i) =>
                                            _appointmentCard(_appointments[i]),
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

