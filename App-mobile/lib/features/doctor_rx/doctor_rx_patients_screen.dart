import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/features/doctor_rx/doctor_rx_api.dart';
import 'package:saha_sante/features/spaces/space_widgets.dart';

/// Recherche d'un patient dans le registre SAHA, avant rédaction.
class DoctorRxPatientsScreen extends StatefulWidget {
  const DoctorRxPatientsScreen({super.key});

  @override
  State<DoctorRxPatientsScreen> createState() => _DoctorRxPatientsScreenState();
}

class _DoctorRxPatientsScreenState extends State<DoctorRxPatientsScreen> {
  final _controller = TextEditingController();
  bool _loading = true;
  bool _searching = false;
  String? _error;
  List<Map<String, dynamic>> _patients = const [];

  @override
  void initState() {
    super.initState();
    _loadKnown();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _loadKnown() async {
    try {
      final rows = await DoctorRxApi.patients();
      if (!mounted) return;
      setState(() {
        _patients = rows;
        _loading = false;
        _error = null;
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
        _loading = false;
      });
    }
  }

  Future<void> _search() async {
    final q = _controller.text.trim();
    if (q.length < 2) return;
    setState(() => _searching = true);
    try {
      final rows = await DoctorRxApi.searchPatients(q);
      if (!mounted) return;
      setState(() {
        _patients = rows;
        _error = null;
        _searching = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _searching = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _searching = false);
    }
  }

  void _open(Map<String, dynamic> patient) {
    context.push('/doctor-rx/editor', extra: {
      'patientId': patient['id'],
      'patient': patient,
    });
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                spaceHeader(
                  L10n.t(context, 'erx.searchPatient'),
                  subtitle: L10n.c('erx.searchHint'),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _controller,
                  onSubmitted: (_) => _search(),
                  decoration: InputDecoration(
                    hintText: L10n.c('erx.searchHint'),
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _searching
                        ? const Padding(
                            padding: EdgeInsets.all(12),
                            child: SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          )
                        : IconButton(
                            icon: const Icon(Icons.arrow_forward),
                            onPressed: _search,
                          ),
                  ),
                ),
                const SizedBox(height: 14),
                if (_error != null)
                  Text(_error!, style: TextStyle(color: Colors.red.shade400))
                else if (_loading)
                  const Expanded(
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (_patients.isEmpty)
                  Expanded(child: emptyView(L10n.c('erx.noPatient')))
                else
                  Expanded(
                    child: ListView.builder(
                      itemCount: _patients.length,
                      itemBuilder: (_, index) => _patientTile(_patients[index]),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _patientTile(Map<String, dynamic> p) {
    final birth = p['birthDate'] as String?;
    final details = [
      p['sahaCode'],
      p['phone'],
      birth != null ? '${L10n.c('erx.patient')} · $birth' : null,
    ].where((x) => x != null && '$x'.isNotEmpty).join(' • ');
    return SpaceCard(
      margin: const EdgeInsets.only(bottom: 8),
      onTap: () => _open(p),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: AppColors.primary.withAlpha(35),
            child: Icon(Icons.person_outline, color: AppColors.primaryLight),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${p['fullName'] ?? ''}',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 3),
                Text(
                  details,
                  style: TextStyle(fontSize: 11.5, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          actionButton(
            L10n.c('erx.choosePatient'),
            () => _open(p),
            dense: true,
          ),
        ],
      ),
    );
  }
}
