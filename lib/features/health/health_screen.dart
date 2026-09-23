import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/models/practitioner.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/auth_service.dart';
import 'package:saha_sante/core/services/location_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';

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
const _specialtyLabels = <String, String>{
  'general': 'Médecine générale',
  'cardiology': 'Cardiologie',
  'pediatrics': 'Pédiatrie',
  'infectious': 'Maladies infectieuses',
  'gynecology': 'Gynécologie-obstétrique',
  'dermatology': 'Dermatologie',
  'diabetology': 'Diabétologie',
  'ophthalmology': 'Ophtalmologie',
  'ent': 'ORL',
  'injection': 'Injections et perfusions',
  'wound_care': 'Soins de plaies et pansements',
  'vaccination': 'Vaccination',
  'nursing': 'Soins infirmiers à domicile',
};

String _specialtyLabel(String value) => _specialtyLabels[value] ?? value;

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
        _specialties = {for (final p in data) _specialtyLabel(p.specialty)}.toList()..sort();
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
        _error = 'Impossible de charger les praticiens.';
        _loading = false;
      });
    }
  }

  Future<void> _analyze() async {
    final symptoms = _symptomsController.text.trim();
    if (symptoms.length < 5) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Décrivez un peu plus vos symptômes')),
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
      _showError('L\'analyse des symptômes a échoué. Réessayez.');
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
      list = list.where((p) => _specialtyLabel(p.specialty) == _selectedSpecialty).toList();
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
                'Rendez-vous avec ${practitioner.displayName}',
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
                      decoration: const InputDecoration(hintText: 'Motif de la consultation'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: phoneController,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(hintText: 'Téléphone'),
                    ),
                    if (practitioner.homeVisits)
                      Row(
                        children: [
                          Checkbox(
                            value: atHome,
                            onChanged: (v) => setDialogState(() => atHome = v ?? false),
                            activeColor: AppColors.accent,
                          ),
                          const Expanded(child: Text('Consultation à domicile')),
                        ],
                      ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(false),
                  child: const Text('Annuler'),
                ),
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(true),
                  child: const Text('Demander'),
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
          content: Text('Demande envoyée à ${practitioner.displayName}'),
          backgroundColor: AppColors.success,
        ),
      );
    } on ApiException catch (e) {
      _showError(e.message);
    } catch (_) {
      _showError('La demande de rendez-vous a échoué. Réessayez.');
    }
  }

  @override
  Widget build(BuildContext context) {
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
                    const SizedBox(width: 8),
                    const Text(
                      'Consultation',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'Décrivez vos symptômes pour être orienté vers le bon praticien.',
                  style: TextStyle(color: AppColors.textSecondary),
                ),
                const SizedBox(height: 24),
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: AppTheme.glassCard,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Symptômes',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _symptomsController,
                        maxLines: 4,
                        decoration: const InputDecoration(
                          hintText: 'J\'ai de la fièvre et des maux de tête depuis 2 jours...',
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
                          const Expanded(child: Text('Visite à domicile uniquement')),
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
                          label: const Text('Analyser mes symptômes'),
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
                  const Text(
                    'Spécialités',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
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
                            s,
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
                        const Icon(Icons.wifi_off, size: 36, color: AppColors.textMuted),
                        const SizedBox(height: 12),
                        Text(
                          _error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                        ),
                        TextButton.icon(
                          onPressed: _loadPractitioners,
                          icon: const Icon(Icons.refresh),
                          label: const Text('Réessayer'),
                        ),
                      ],
                    ),
                  )
                else ...[
                  const Text(
                    'Praticiens disponibles',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 14),
                  if (practitioners.isEmpty)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(20),
                      decoration: AppTheme.glassCard,
                      child: const Text(
                        'Aucun praticien ne correspond à cette recherche.',
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

  static const _urgencyLabels = <String, String>{
    'low': 'Peu urgent',
    'medium': 'À voir rapidement',
    'high': 'Urgent',
    'emergency': 'Urgence — appelez les secours',
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
              const Icon(Icons.auto_awesome, size: 18, color: AppColors.accent),
              const SizedBox(width: 8),
              const Text(
                'Orientation proposée',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: _urgencyColor.withAlpha(30),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _urgencyLabels[triage['urgency'] as String?] ?? 'À évaluer',
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
              style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
          ],
          if (conditions.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              'Pistes possibles : ${conditions.join(', ')}',
              style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
          ],
          const SizedBox(height: 10),
          const Text(
            'Cette orientation ne remplace pas un avis médical.',
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
                      style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                    ),
                  ],
                ),
              ),
              if (practitioner.consultationFee != null)
                Text(
                  _frAmount(practitioner.consultationFee!),
                  style: const TextStyle(
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
                    Text(practitioner.phone!, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                  if (practitioner.address != null)
                    Text(practitioner.address!, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
                ],
              ),
            ),
          if (practitioner.homeVisits)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text(
                'Visite à domicile possible',
                style: TextStyle(fontSize: 12, color: AppColors.success),
              ),
            ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 44,
            child: OutlinedButton(
              onPressed: onBook,
              child: const Text('Prendre rendez-vous'),
            ),
          ),
        ],
      ),
    );
  }
}
