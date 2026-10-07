import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/models/prescription.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/core/widgets/notification_bell.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';

class PrescriptionsScreen extends StatefulWidget {
  const PrescriptionsScreen({super.key});

  @override
  State<PrescriptionsScreen> createState() => _PrescriptionsScreenState();
}

class _PrescriptionsScreenState extends State<PrescriptionsScreen> {
  List<Prescription>? _items;
  bool _loading = true;
  String? _error;

  /// Reprise au tap sur une ordonnance :
  /// - vérifiée -> choix du lieu de livraison (puis pharmacie) ;
  /// - en vérification -> on explique l'attente (la notification préviendra) ;
  /// - photo à reprendre / refusée -> retour au scan ;
  /// - autre état -> rien (la commande passe par le scan).
  void _openPrescription(Prescription item) {
    if (item.status == PrescriptionStatus.verified) {
      context.push('/localisation/${item.id}');
      return;
    }
    if (item.reviewPending) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(L10n.c('rx.checking')),
        ),
      );
      return;
    }
    if (item.reviewStatus == 'retake_requested' ||
        item.status == PrescriptionStatus.failed) {
      context.push('/scan');
    }
  }

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
        _error = L10n.c('rx.loadFailed');
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
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
                    const NotificationBell(),
                    const SizedBox(width: 8),
                    Text(
                      L10n.t(context, 'rx.title'),
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  L10n.t(context, 'rx.subtitle'),
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
                                      text: L10n.c('rx.empty'),
                                      onTap: _load,
                                    )
                                  : ListView.separated(
                                      physics: const AlwaysScrollableScrollPhysics(),
                                      itemCount: _items!.length,
                                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                                      itemBuilder: (context, index) {
                                        final item = _items![index];
                                        return _PrescriptionCard(
                                          item: item,
                                          onTap: () => _openPrescription(item),
                                        );
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
                        style: TextStyle(color: AppColors.textMuted),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextButton.icon(
                      onPressed: onTap,
                      icon: const Icon(Icons.refresh),
                      label: Text(L10n.c('common.reload')),
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
  final VoidCallback? onTap;

  const _PrescriptionCard({required this.item, this.onTap});

  @override
  Widget build(BuildContext context) {
    final date = L10n.date(item.prescriptionDate ?? item.createdAt);
    // Tant que l'équipe n'a pas tranché, la carte l'affiche : le patient
    // comprend pourquoi il ne peut pas encore commander.
    final badgeLabel = item.reviewPending ? L10n.c('rx.inReview') : item.status.label;
    final badgeColor = item.reviewPending ? AppColors.warning : item.status.color;
    final card = Container(
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
            child: Icon(Icons.description, color: AppColors.primary),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.doctorName ?? L10n.c('rx.fallbackTitle'),
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Text(
                  date,
                  style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                ),
                if (item.medicines.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      item.medicines.join(', '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: badgeColor.withAlpha(30),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              badgeLabel,
              style: TextStyle(fontSize: 11, color: badgeColor, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
    final tap = onTap;
    if (tap == null) return card;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: tap,
        child: card,
      ),
    );
  }
}

