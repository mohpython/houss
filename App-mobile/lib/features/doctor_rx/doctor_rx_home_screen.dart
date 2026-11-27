import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/features/doctor_rx/doctor_rx_api.dart';
import 'package:saha_sante/features/spaces/space_widgets.dart';

/// Accueil natif « e-Ordonnance » : tableau de bord du médecin.
class DoctorRxHomeScreen extends StatefulWidget {
  const DoctorRxHomeScreen({super.key});

  @override
  State<DoctorRxHomeScreen> createState() => _DoctorRxHomeScreenState();
}

class _DoctorRxHomeScreenState extends State<DoctorRxHomeScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _dashboard = const {};
  String _access = 'missing';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _error = null);
    try {
      final session = await DoctorRxApi.session();
      final data = await DoctorRxApi.dashboard();
      if (!mounted) return;
      setState(() {
        _access = '${session['access'] ?? 'missing'}';
        _dashboard = data;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    final counts = (_dashboard['counts'] as Map?) ?? const {};
    final me = (_dashboard['me'] as Map?) ?? const {};
    final recent = ((_dashboard['recent'] as List?) ?? const []).cast<Map<String, dynamic>>();

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                spaceHeader(
                  L10n.t(context, 'erx.title'),
                  subtitle: L10n.c('erx.subtitle'),
                ),
                if (_loading)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 60),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (_error != null)
                  errorView(_error!, _load)
                else if (_access != 'ok')
                  SpaceCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          L10n.c('erx.gateTitle'),
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          L10n.c('erx.gateBody'),
                          style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
                        ),
                      ],
                    ),
                  )
                else ...[
                  SpaceCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${me['display_name'] ?? ''}',
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          [
                            me['specialty'],
                            me['establishment_name'],
                            me['license_number'],
                          ].where((x) => x != null && '$x'.isNotEmpty).join(' • '),
                          style: TextStyle(
                            fontSize: 12.5,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: StatCard(
                          label: L10n.c('erx.drafts'),
                          value: '${counts['drafts'] ?? 0}',
                          icon: Icons.edit_note,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: StatCard(
                          label: L10n.c('erx.signedCount'),
                          value: '${counts['signed'] ?? 0}',
                          icon: Icons.draw_outlined,
                          color: AppColors.success,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: StatCard(
                          label: L10n.c('erx.sentCount'),
                          value: '${counts['sent'] ?? 0}',
                          icon: Icons.send_outlined,
                          color: AppColors.accent,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: StatCard(
                          label: L10n.c('erx.patientsCount'),
                          value: '${counts['patients'] ?? 0}',
                          icon: Icons.people_outline,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  actionButton(
                    L10n.c('erx.newRx'),
                    () => context.push('/doctor-rx/patients'),
                    icon: Icons.add_circle_outline,
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: actionButton(
                          L10n.c('erx.myRx'),
                          () => context.push('/doctor-rx/list'),
                          icon: Icons.description_outlined,
                          color: AppColors.surface,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: actionButton(
                          L10n.c('erx.myPatients'),
                          () => context.push('/doctor-rx/patients'),
                          icon: Icons.people_outline,
                          color: AppColors.surface,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  actionButton(
                    L10n.c('erx.verifyRx'),
                    () => context.push('/doctor-rx/verify'),
                    icon: Icons.verified_outlined,
                    color: AppColors.surface,
                  ),
                  const SizedBox(height: 20),
                  sectionTitle(L10n.c('erx.myRx')),
                  const SizedBox(height: 10),
                  if (recent.isEmpty)
                    emptyView(L10n.c('erx.noRx'))
                  else
                    ...recent.map((rx) => _rxTile(context, rx)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _rxTile(BuildContext context, Map<String, dynamic> rx) {
    final status = '${rx['status'] ?? 'draft'}';
    final labelKey = switch (status) {
      'signed' => 'erx.statusSigned',
      'sent' => 'erx.statusSent',
      _ => 'erx.statusDraft',
    };
    final color = switch (status) {
      'sent' => AppColors.success,
      'signed' => AppColors.accent,
      _ => AppColors.textMuted,
    };
    return SpaceCard(
      margin: const EdgeInsets.only(bottom: 8),
      onTap: () => context.push('/doctor-rx/editor', extra: {
        'rxId': rx['id'],
        'patientId': rx['patient_id'],
        'patientName': rx['patient_name'],
      }),
      child: Row(
        children: [
          Icon(Icons.receipt_long_outlined, color: AppColors.primaryLight),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${rx['number'] ?? ''}',
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  '${rx['patient_name'] ?? ''}',
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          statusChip(L10n.c(labelKey), color),
        ],
      ),
    );
  }
}
