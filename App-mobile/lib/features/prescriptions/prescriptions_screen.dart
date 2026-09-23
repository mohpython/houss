import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/models/prescription.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';

/// Date au format français, sans dépendre des données de locale d'intl.
String _frDate(DateTime date) {
  const months = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
  ];
  return '${date.day} ${months[date.month - 1]} ${date.year}';
}

class PrescriptionsScreen extends StatefulWidget {
  const PrescriptionsScreen({super.key});

  @override
  State<PrescriptionsScreen> createState() => _PrescriptionsScreenState();
}

class _PrescriptionsScreenState extends State<PrescriptionsScreen> {
  List<Prescription>? _items;
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
      final data = await ApiService.instance.getPrescriptions();
      if (!mounted) return;
      setState(() {
        _items = data;
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
        _error = 'Impossible de charger vos ordonnances.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
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
                    const SizedBox(width: 8),
                    const Text(
                      'Mes ordonnances',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'Historique et suivi de vos prescriptions scannées.',
                  style: TextStyle(color: AppColors.textSecondary),
                ),
                const SizedBox(height: 24),
                Expanded(
                  child: _loading
                      ? const Center(child: CircularProgressIndicator())
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: _error != null
                              ? _Message(
                                  icon: Icons.wifi_off,
                                  text: _error!,
                                  onTap: _load,
                                )
                              : (_items?.isEmpty ?? true)
                                  ? _Message(
                                      icon: Icons.description,
                                      text: 'Aucune ordonnance pour l\'instant',
                                      onTap: _load,
                                    )
                                  : ListView.separated(
                                      physics: const AlwaysScrollableScrollPhysics(),
                                      itemCount: _items!.length,
                                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                                      itemBuilder: (context, index) {
                                        return _PrescriptionCard(item: _items![index]);
                                      },
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

/// État vide ou en erreur, scrollable pour rester compatible avec
/// « tirer pour rafraîchir ».
class _Message extends StatelessWidget {
  final IconData icon;
  final String text;
  final VoidCallback onTap;

  const _Message({required this.icon, required this.text, required this.onTap});

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
                        style: const TextStyle(color: AppColors.textMuted),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextButton.icon(
                      onPressed: onTap,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Recharger'),
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

class _PrescriptionCard extends StatelessWidget {
  final Prescription item;

  const _PrescriptionCard({required this.item});

  @override
  Widget build(BuildContext context) {
    final date = _frDate(item.prescriptionDate ?? item.createdAt);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: AppTheme.glassCard,
      child: Row(
        children: [
          Container(
            height: 44,
            width: 44,
            decoration: BoxDecoration(
              color: AppColors.primary.withAlpha(30),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.description, color: AppColors.primary),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.doctorName ?? 'Ordonnance',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Text(
                  date,
                  style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                ),
                if (item.medicines.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      item.medicines.join(', '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: item.status.color.withAlpha(30),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              item.status.label,
              style: TextStyle(fontSize: 11, color: item.status.color, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
