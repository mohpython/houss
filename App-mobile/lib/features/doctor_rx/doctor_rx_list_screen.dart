import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/features/doctor_rx/doctor_rx_api.dart';
import 'package:saha_sante/features/spaces/space_widgets.dart';

/// Liste des ordonnances rédigées par le médecin (tous statuts).
class DoctorRxListScreen extends StatefulWidget {
  const DoctorRxListScreen({super.key});

  @override
  State<DoctorRxListScreen> createState() => _DoctorRxListScreenState();
}

class _DoctorRxListScreenState extends State<DoctorRxListScreen> {
  String _status = 'all';
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _rows = const [];

  static const _filters = ['all', 'draft', 'signed', 'sent'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      final rows = await DoctorRxApi.listPrescriptions(status: _status);
      if (!mounted) return;
      setState(() {
        _rows = rows;
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
      setState(() => _loading = false);
    }
  }

  String _label(String key) {
    switch (key) {
      case 'all':
        return L10n.c('erx.total');
      case 'draft':
        return L10n.c('erx.statusDraft');
      case 'signed':
        return L10n.c('erx.statusSigned');
      case 'sent':
        return L10n.c('erx.statusSent');
      default:
        return key;
    }
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
                  L10n.t(context, 'erx.myRx'),
                  subtitle: L10n.c('erx.subtitle'),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  height: 36,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _filters.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (_, i) {
                      final key = _filters[i];
                      final selected = key == _status;
                      return ChoiceChip(
                        label: Text(_label(key)),
                        selected: selected,
                        onSelected: (_) {
                          setState(() => _status = key);
                          _load();
                        },
                      );
                    },
                  ),
                ),
                const SizedBox(height: 14),
                if (_error != null)
                  Text(_error!, style: TextStyle(color: Colors.red.shade400))
                else if (_loading)
                  const Expanded(child: Center(child: CircularProgressIndicator()))
                else if (_rows.isEmpty)
                  Expanded(child: emptyView(L10n.c('erx.noRx')))
                else
                  Expanded(
                    child: ListView.builder(
                      itemCount: _rows.length,
                      itemBuilder: (_, index) {
                        final rx = _rows[index];
                        final status = '${rx['status'] ?? 'draft'}';
                        return SpaceCard(
                          margin: const EdgeInsets.only(bottom: 8),
                          onTap: () => context.push('/doctor-rx/editor', extra: {
                            'rxId': rx['id'],
                            'patientId': rx['patient_id'],
                            'patientName': rx['patient_name'],
                          }),
                          child: Row(
                            children: [
                              Icon(Icons.description_outlined, color: AppColors.primaryLight),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${rx['number'] ?? ''}',
                                      style: const TextStyle(
                                        fontSize: 13.5,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      '${rx['patient_name'] ?? ''}',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: AppColors.textSecondary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              statusChip(_label(status), AppColors.primaryLight),
                            ],
                          ),
                        );
                      },
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
