import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/features/spaces/space_widgets.dart';

/// Types de notification liés à une commande (suivi de livraison).
const Set<String> _reservationTypes = {
  'new_reservation',
  'reservation_created',
  'reservation_accepted',
  'reservation_rejected',
  'reservation_ready',
  'courier_assigned',
  'new_delivery',
  'courier_picked_up',
  'delivered',
};

/// Route à ouvrir quand on tape une notification, selon son type et ses
/// données de lien (`data.reservation_id`, `data.prescription_id`…).
String? _targetOf(String? type, Map<String, dynamic> data) {
  if (type == null) return null;
  if (_reservationTypes.contains(type)) {
    final id = data['reservation_id'] as String?;
    if (id != null && id.isNotEmpty) return '/suivi/$id';
    return '/suivi';
  }
  if (type == 'prescription_review') return '/prescriptions';
  if (type.startsWith('appointment')) return '/health';
  return null;
}

/// Icône + couleur d'expéditeur selon le type (visuel « message »).
(IconData, Color) _typeMeta(String? type) {
  if (_reservationTypes.contains(type)) {
    return (Icons.local_shipping_outlined, AppColors.accentLight);
  }
  if (type == 'prescription_review') {
    return (Icons.description_outlined, AppColors.warning);
  }
  if (type != null && type.startsWith('appointment')) {
    return (Icons.event_outlined, AppColors.success);
  }
  return (Icons.notifications_outlined, AppColors.primaryLight);
}

/// Notifications affichées comme une conversation SMS : chaque notification
/// est une « bulle » de SAHA Santé, la non-lue est surlignée, et un appui
/// ouvre la commande / l'ordonnance concernée puis marque la notification lue.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Map<String, dynamic>>? _items;
  String? _error;
  bool _markingAll = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final items = await ApiService.instance.getNotifications();
      if (!mounted) return;
      setState(() => _items = items);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Impossible de charger les notifications.');
    }
  }

  /// Ouvre la cible de la notification (commande, ordonnance…) puis la marque lue.
  Future<void> _open(Map<String, dynamic> n) async {
    final type = n['type'] as String?;
    final data = (n['data'] as Map<String, dynamic>?) ?? const {};
    final id = n['id'] as String?;
    final read = n['read_at'] != null;

    if (id != null && !read) {
      await ApiService.instance.markNotificationsRead(id: id);
      final items = _items;
      if (items != null && mounted) {
        for (final it in items) {
          if (it['id'] == id) it['read_at'] = DateTime.now().toIso8601String();
        }
        if (mounted) setState(() {});
      }
    }

    final target = _targetOf(type, data);
    if (target == null || !mounted) return;
    context.push(target);
  }

  Future<void> _markAll() async {
    if (_markingAll) return;
    setState(() => _markingAll = true);
    try {
      await ApiService.instance.markNotificationsRead();
      final items = _items;
      if (items != null && mounted) {
        for (final it in items) {
          it['read_at'] = DateTime.now().toIso8601String();
        }
        if (mounted) setState(() {});
      }
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Action impossible pour le moment.', error: true);
    } finally {
      if (mounted) setState(() => _markingAll = false);
    }
  }

  /// « Bulle » SMS : expéditeur, texte et horodatage, non-lues surlignées.
  Widget _bubble(Map<String, dynamic> n) {
    final title = (n['title'] as String?) ?? 'Notification';
    final body = (n['body'] as String?) ?? '';
    final unread = n['read_at'] == null;
    final created = parseDate(n['created_at']);
    final (icon, accent) = _typeMeta(n['type'] as String?);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: () => _open(n),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: accent.withAlpha(30),
                child: Icon(icon, size: 22, color: accent),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.fromLTRB(14, 10, 10, 8),
                  decoration: BoxDecoration(
                    color: unread ? accent.withAlpha(26) : AppColors.card,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: unread ? accent.withAlpha(120) : AppColors.border,
                      width: unread ? 1.2 : 1,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              title,
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: unread ? FontWeight.w700 : FontWeight.w600,
                              ),
                            ),
                          ),
                          if (unread) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.primaryLight,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: const Text(
                                'Nouveau',
                                style: TextStyle(
                                  fontSize: 9.5,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      if (body.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          body,
                          style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                        ),
                      ],
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Text(
                            created == null ? '' : frDateTime(created),
                            style: const TextStyle(fontSize: 10.5, color: AppColors.textMuted),
                          ),
                          const Spacer(),
                          Icon(
                            unread ? Icons.chevron_right : Icons.done_all,
                            size: 16,
                            color: unread ? accent : AppColors.textMuted,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _body() {
    final items = _items;
    if (_error != null && items == null) {
      return errorView(_error!, _load);
    }
    if (items == null) return const Center(child: CircularProgressIndicator());
    if (items.isEmpty) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(
              height: 380,
              child: emptyView(
                'Aucune notification pour le moment.\n\n'
                'Les nouvelles commandes, validations et messages apparaîtront ici.',
              ),
            ),
          ],
        ),
      );
    }
    final unread = items.where((n) => n['read_at'] == null).length;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(top: 6, bottom: 24),
        itemCount: items.length + 1,
        itemBuilder: (_, i) {
          if (i == 0) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                unread == 0
                    ? 'Tout est à jour.'
                    : '$unread non lue${unread > 1 ? 's' : ''}',
                style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
              ),
            );
          }
          return _bubble(items[i - 1]);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => context.pop(),
                      icon: const Icon(Icons.arrow_back),
                    ),
                    const SizedBox(width: 4),
                    // Expéditeur : SAHA Santé (façon fil SMS).
                    CircleAvatar(
                      radius: 20,
                      backgroundColor: AppColors.primary,
                      child: const Icon(Icons.local_pharmacy, size: 22, color: Colors.white),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'SAHA Santé',
                            style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
                          ),
                          Text(
                            'Notifications',
                            style: TextStyle(fontSize: 12.5, color: AppColors.textMuted),
                          ),
                        ],
                      ),
                    ),
                    TextButton(
                      onPressed: _markingAll ? null : _markAll,
                      child: _markingAll
                          ? const SizedBox(
                              height: 16,
                              width: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Tout lire'),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1, color: AppColors.border),
              Expanded(child: _body()),
            ],
          ),
        ),
      ),
    );
  }
}