import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/models/practitioner.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/auth_service.dart';
import 'package:saha_sante/core/services/location_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/widgets/notification_bell.dart';

/// Montant en FCFA, arrondi et séparé par milliers (« 10 000 FCFA »).
String _frAmount(num amount) {
  final digits = amount.round().abs().toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(' ');
    buffer.write(digits[i]);
  }
  return '$buffer FCFA';
}

/// Libellés de repli : le triage renvoie un code de spécialité sans sa
/// traduction (contrairement à /practitioners).
String _specialtyLabel(String value) => switch (value) {
      'general' => L10n.c('spec.general'),
      'cardiology' => L10n.c('spec.cardiology'),
      'pediatrics' => L10n.c('spec.pediatrics'),
      'infectious' => L10n.c('spec.infectious'),
      'gynecology' => L10n.c('spec.gynecology'),
      'dermatology' => L10n.c('spec.dermatology'),
      'diabetology' => L10n.c('spec.diabetology'),
      'ophthalmology' => L10n.c('spec.ophthalmology'),
      'ent' => L10n.c('spec.ent'),
      'injection' => L10n.c('spec.injection'),
      'wound_care' => L10n.c('spec.woundCare'),
      'vaccination' => L10n.c('spec.vaccination'),
      'nursing' => L10n.c('spec.nursing'),
      _ => value,
    };

class HealthScreen extends StatefulWidget {
  const HealthScreen({super.key});

  @override
  State<HealthScreen> createState() => _HealthScreenState();
}

class _HealthScreenState extends State<HealthScreen> {
  final _symptomsController = TextEditingController();
  bool _homeVisit = false;
  bool _analyzing = false;
  bool _loading = true;
  List<Practitioner>? _practitioners;
  Map<String, dynamic>? _triage;
  String? _error;
  List<String> _specialties = [];
  String? _selectedSpecialty;
  double? _lat;
  double? _lng;

  @override
  void initState() {
    super.initState();
    _loadPractitioners();
  }

  @override
  void dispose() {
    _symptomsController.dispose();
    super.dispose();
  }

  Future<void> _loadPractitioners() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final position = await LocationService.current();
      _lat = position?.latitude;
      _lng = position?.longitude;
      final data = await ApiService.instance.getPractitioners(
        lat: _lat,
        lng: _lng,
        homeVisitsOnly: _homeVisit,
      );
      if (!mounted) return;
      setState(() {
        _practitioners = data;
        _triage = null;
        _selectedSpecialty = null;
        // Les spécialités proposées viennent des praticiens réellement inscrits.
        _specialties = {for (final p in data) p.specialty}.toList()..sort();
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
        _error = L10n.c('he.loadFailed');
        _loading = false;
      });
    }
  }

  Future<void> _analyze() async {
    final symptoms = _symptomsController.text.trim();
    if (symptoms.length < 5) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(L10n.c('he.describeMore'))),
      );
      return;
    }
    setState(() {
      _analyzing = true;
      _error = null;
      _selectedSpecialty = null;
    });
    try {
      final position = await LocationService.current();
      _lat = position?.latitude ?? _lat;
      _lng = position?.longitude ?? _lng;
      final result = await ApiService.instance.triage(
        symptoms: symptoms,
        lat: _lat,
        lng: _lng,
        homeVisitsOnly: _homeVisit,
      );
      if (!mounted) return;
      setState(() {
        _analyzing = false;
        _triage = result.triage;
        _practitioners = result.practitioners;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _analyzing = false);
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _analyzing = false);
      _showError(L10n.c('he.analyzeFailed'));
    }
  }

  void _bySpecialty(String specialty) {
    setState(() {
      _selectedSpecialty = _selectedSpecialty == specialty ? null : specialty;
    });
  }

  List<Practitioner> get _visible {
    var list = _practitioners ?? const <Practitioner>[];
    if (_homeVisit) list = list.where((p) => p.homeVisits).toList();
    if (_selectedSpecialty != null) {
      list = list.where((p) => p.specialty == _selectedSpecialty).toList();
    }
    return list;
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red.shade700),
    );
  }

  Future<void> _requestAppointment(Practitioner practitioner) async {
    final user = AuthService.instance.user;
    final reasonController = TextEditingController(text: _symptomsController.text.trim());
    final phoneController = TextEditingController(text: user?.phone ?? '');
    var atHome = practitioner.homeVisits && _homeVisit;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            return AlertDialog(
              backgroundColor: AppColors.surface,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
              title: Text(
                L10n.tArgs(context, 'he.appointmentWith', {'name': practitioner.displayName}),
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TextField(
                      controller: reasonController,
                      maxLines: 3,
                      decoration: InputDecoration(hintText: L10n.c('he.reasonHint')),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: phoneController,
                      keyboardType: TextInputType.phone,
                      decoration: InputDecoration(hintText: L10n.c('common.phone')),
                    ),
                    if (practitioner.homeVisits)
                      Row(
                        children: [
                          Checkbox(
                            value: atHome,
                            onChanged: (v) => setDialogState(() => atHome = v ?? false),
                            activeColor: AppColors.accent,
                          ),
                          Expanded(child: Text(L10n.c('he.homeConsult'))),
                        ],
                      ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(false),
                  child: Text(L10n.c('common.cancel')),
                ),
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(true),
                  child: Text(L10n.c('he.ask')),
                ),
              ],
            );
          },
        );
      },
    );

    final reason = reasonController.text.trim();
    final phone = phoneController.text.trim();
    reasonController.dispose();
    phoneController.dispose();
    if (confirmed != true || !mounted) return;

    try {
      await ApiService.instance.requestAppointment(
        practitionerId: practitioner.id,
        reason: reason,
        symptoms: _symptomsController.text.trim(),
        atHome: atHome,
        phone: phone.isEmpty ? null : phone,
        lat: _lat,
        lng: _lng,
        triage: _triage,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(L10n.tArgs(context, 'he.requestSent', {'name': practitioner.displayName})),
          backgroundColor: AppColors.success,
        ),
      );
    } on ApiException catch (e) {
      _showError(e.message);
    } catch (_) {
      _showError(L10n.c('he.requestFailed'));
    }
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    final practitioners = _visible;

    return Scaffold(
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: ListView(
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
                    Text(
                      L10n.t(context, 'he.title'),
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  L10n.t(context, 'he.subtitle'),
                  style: TextStyle(color: AppColors.textSecondary),
                ),
                const SizedBox(height: 24),
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: AppTheme.glassCard,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        L10n.t(context, 'he.symptoms'),
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _symptomsController,
                        maxLines: 4,
                        decoration: InputDecoration(
                          hintText: L10n.c('he.symptomsHint'),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Checkbox(
                            value: _homeVisit,
                            onChanged: (v) => setState(() => _homeVisit = v ?? false),
                            activeColor: AppColors.accent,
                          ),
                          Expanded(child: Text(L10n.t(context, 'he.homeOnly'))),
                        ],
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        height: 54,
                        child: ElevatedButton.icon(
                          onPressed: _analyzing ? null : _analyze,
                          icon: _analyzing
                              ? const SizedBox(
                                  height: 18,
                                  width: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : const Icon(Icons.auto_awesome, size: 18),
                          label: Text(L10n.t(context, 'he.analyze')),
                        ),
                      ),
                    ],
                  ),
                ),
                if (_triage != null) ...[
                  const SizedBox(height: 20),
                  _TriageCard(triage: _triage!),
                ],
                const SizedBox(height: 24),
                if (_specialties.isNotEmpty) ...[
                  Text(
                    L10n.t(context, 'he.specialties'),
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: _specialties.map((s) {
                      final selected = _selectedSpecialty == s;
                      return GestureDetector(
                        onTap: () => _bySpecialty(s),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          decoration: BoxDecoration(
                            color: selected ? AppColors.primary.withAlpha(40) : AppColors.card,
                            borderRadius: BorderRadius.circular(24),
                            border: Border.all(
                              color: selected ? AppColors.primary : AppColors.border,
                            ),
                          ),
                          child: Text(
                            _specialtyLabel(s),
                            style: TextStyle(
                              fontSize: 13,
                              color: selected ? AppColors.primaryLight : AppColors.textPrimary,
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 24),
                ],
                if (_loading)
                  const Padding(
                    padding: EdgeInsets.only(top: 24),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (_error != null)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(20),
                    decoration: AppTheme.glassCard,
                    child: Column(
                      children: [
                        Icon(Icons.wifi_off, size: 36, color: AppColors.textMuted),
                        const SizedBox(height: 12),
                        Text(
                          _error!,
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                        ),
                        TextButton.icon(
                          onPressed: _loadPractitioners,
                          icon: const Icon(Icons.refresh),
                          label: Text(L10n.t(context, 'common.retry')),
                        ),
                      ],
                    ),
                  )
                else ...[
                  Text(
                    L10n.t(context, 'he.available'),
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 14),
                  if (practitioners.isEmpty)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(20),
                      decoration: AppTheme.glassCard,
                      child: Text(
                        L10n.t(context, 'he.noMatch'),
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 13, color: AppColors.textMuted),
                      ),
                    )
                  else
                    ...practitioners.map(
                      (p) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _PractitionerCard(
                          practitioner: p,
                          onBook: () => _requestAppointment(p),
                        ),
                      ),
                    ),
                ],
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TriageCard extends StatelessWidget {
  final Map<String, dynamic> triage;

  const _TriageCard({required this.triage});

  static String _urgencyLabel(String? urgency) => switch (urgency) {
        'low' => L10n.c('urg.low'),
        'medium' => L10n.c('urg.medium'),
        'high' => L10n.c('urg.high'),
        'emergency' => L10n.c('urg.emergency'),
        _ => L10n.c('urg.unknown'),
      };

  Color get _urgencyColor {
    return switch (triage['urgency'] as String?) {
      'high' => AppColors.warning,
      'emergency' => Colors.redAccent,
      'low' => AppColors.success,
      _ => AppColors.accent,
    };
  }

  @override
  Widget build(BuildContext context) {
    final specialty = triage['specialty_code'] as String?;
    final advice = (triage['advice'] as String?)?.trim() ?? '';
    final conditions =
        ((triage['possible_conditions'] as List?) ?? const []).map((c) => '$c').toList();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: AppTheme.glassCard,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.auto_awesome, size: 18, color: AppColors.accent),
              const SizedBox(width: 8),
              Text(
                L10n.t(context, 'he.orientation'),
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: _urgencyColor.withAlpha(30),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _urgencyLabel(triage['urgency'] as String?),
                  style: TextStyle(fontSize: 11, color: _urgencyColor, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          if (specialty != null && specialty.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              _specialtyLabel(specialty),
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ],
          if (advice.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              advice,
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
          ],
          if (conditions.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              L10n.tArgs(context, 'he.possiblePaths', {'list': conditions.join(', ')}),
              style: TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
          ],
          const SizedBox(height: 10),
          Text(
            L10n.t(context, 'he.disclaimer'),
            style: TextStyle(fontSize: 11, color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }
}

class _PractitionerCard extends StatelessWidget {
  final Practitioner practitioner;
  final VoidCallback onBook;

  const _PractitionerCard({required this.practitioner, required this.onBook});

  @override
  Widget build(BuildContext context) {
    final distance = practitioner.distanceKm;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: AppTheme.glassCard,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                height: 44,
                width: 44,
                decoration: BoxDecoration(
                  color: AppColors.primary.withAlpha(30),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  practitioner.type == 'nurse' ? Icons.home : Icons.local_hospital,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      practitioner.displayName,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                    ),
                    Text(
                      '${_specialtyLabel(practitioner.specialty)}'
                      '${distance != null ? ' • ${distance.toStringAsFixed(1)} km' : ''}',
                      style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                    ),
                  ],
                ),
              ),
              if (practitioner.consultationFee != null)
                Text(
                  _frAmount(practitioner.consultationFee!),
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.accent,
                  ),
                ),
            ],
          ),
          if (practitioner.phone != null || practitioner.address != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (practitioner.phone != null)
                    Text(practitioner.phone!, style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                  if (practitioner.address != null)
                    Text(practitioner.address!, style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
                ],
              ),
            ),
          if (practitioner.homeVisits)
            Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text(
                L10n.t(context, 'he.homeVisitPossible'),
                style: TextStyle(fontSize: 12, color: AppColors.success),
              ),
            ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 44,
            child: OutlinedButton(
              onPressed: onBook,
              child: Text(L10n.t(context, 'he.book')),
            ),
          ),
        ],
      ),
    );
  }
}

