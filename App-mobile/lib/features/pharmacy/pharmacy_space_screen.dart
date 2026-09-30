import 'package:flutter/material.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/features/spaces/space_widgets.dart';

/// Espace Pharmacie : commandes reçues, paiements, expédition et stock.
class PharmacySpaceScreen extends StatefulWidget {
  const PharmacySpaceScreen({super.key});

  @override
  State<PharmacySpaceScreen> createState() => _PharmacySpaceScreenState();
}

class _PharmacySpaceScreenState extends State<PharmacySpaceScreen> {
  int _tab = 0;
  bool _loading = true;
  String? _error;
  bool _busy = false;

  Map<String, dynamic>? _me;
  List<Map<String, dynamic>> _orders = [];
  Map<String, dynamic> _rxUrls = const {};
  List<Map<String, dynamic>> _stock = [];
  String _search = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _error = null);
    try {
      final results = await Future.wait<Map<String, dynamic>>([
        ApiService.instance.pharmacyMe(),
        ApiService.instance.pharmacyOrders(),
        ApiService.instance.pharmacyInventory(),
      ]);
      if (!mounted) return;
      setState(() {
        _me = results[0];
        _orders = ((results[1]['rows'] as List?) ?? const []).cast<Map<String, dynamic>>();
        _rxUrls = (results[1]['rxUrls'] as Map<String, dynamic>?) ?? const {};
        _stock = ((results[2]['rows'] as List?) ?? const []).cast<Map<String, dynamic>>();
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
        _error = 'Impossible de charger votre espace pharmacie.';
        _loading = false;
      });
    }
  }

  /// Exécute une action puis recharge ; les erreurs métier passent en Snack.
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

  VoidCallback? _on(Future<void> Function() action) => _busy ? null : () => _act(action);

  /// Aperçu de l'ordonnance jointe à la commande.
  void _showRx(String? url) {
    if (url == null || url.isEmpty) {
      showSnack(context, 'Aucune ordonnance jointe.', error: true);
      return;
    }
    showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog(
        backgroundColor: Colors.black87,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 4),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(dialogContext).pop(),
                    icon: const Icon(Icons.close, color: Colors.white, size: 20),
                  ),
                  const Text(
                    'Ordonnance',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
            Flexible(
              child: InteractiveViewer(
                child: Image.network(
                  url,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => const Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'Image indisponible',
                      style: TextStyle(color: Colors.white70),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  // --- Commandes ------------------------------------------------------------

  Widget _orderCard(Map<String, dynamic> order) {
    final id = order['id'] as String;
    final status = order['status'] as String?;
    final payment = order['payment_status'] as String?;
    final isPickup = order['fulfillment_method'] == 'pickup';
    final fulfillment = isPickup ? 'Retrait' : 'Livraison';
    final total = (order['total_amount'] as num?) ?? 0;
    final items = ((order['reservation_items'] as List?) ?? const [])
        .cast<Map<String, dynamic>>();
    final rxUrl = _rxUrls[id] as String?;
    final patient = (order['patient_name'] as String?) ?? '';
    final closed =
        status == 'completed' || status == 'cancelled' || status == 'rejected';
    final pendingPayment = payment == 'pending_verification';

    return SpaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      patient.isEmpty ? 'Patient' : patient,
                      style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      frDateTime(parseDate(order['created_at'])),
                      style: const TextStyle(fontSize: 11.5, color: AppColors.textMuted),
                    ),
                  ],
                ),
              ),
              statusChip(
                reservationLabels[status] ?? '$status',
                statusColor(status),
              ),
            ],
          ),
          if (items.isNotEmpty) ...[
            const SizedBox(height: 10),
            sectionTitle('Articles'),
            const SizedBox(height: 6),
            ...items.map((it) {
              final pi = it['prescription_items'] as Map<String, dynamic>?;
              if (pi == null) return const SizedBox.shrink();
              final name = (pi['medicine_name_raw'] as String?) ?? 'Article';
              // `quantity` est un texte libre venant de l'IA (ex. « 2 »,
              // « 1 comprimé »). Le caster en `num?` plante la carte et vide
              // l'onglet Commandes : on accepte nombre ou texte libre.
              final rawQty = pi['quantity'];
              final parsedQty = rawQty is num ? rawQty : num.tryParse('$rawQty'.trim());
              final qtyLabel = parsedQty != null
                  ? (parsedQty == parsedQty.truncateToDouble()
                      ? '× ${parsedQty.toInt()}'
                      : '× $parsedQty')
                  : (rawQty is String && rawQty.trim().isNotEmpty ? rawQty : '× 1');
              final available = it['available'] != false;
              final price = ((it['unit_price'] as num?) ?? (it['price'] as num?)) ?? 0;
              return Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '$name $qtyLabel${available ? '' : ' — manquant'}',
                        style: available
                            ? const TextStyle(fontSize: 13)
                            : TextStyle(
                                fontSize: 13,
                                color: Colors.red.shade400,
                                decoration: TextDecoration.lineThrough,
                              ),
                      ),
                    ),
                    Text(
                      available ? frAmount(price) : '—',
                      style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                    ),
                  ],
                ),
              );
            }),
          ],
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(
                isPickup ? Icons.storefront : Icons.delivery_dining,
                size: 14,
                color: AppColors.textMuted,
              ),
              const SizedBox(width: 4),
              Text(
                fulfillment,
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
              const Spacer(),
              Text(
                frAmount(total),
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppColors.accentLight,
                ),
              ),
            ],
          ),
          if (payment != null && payment != 'unpaid') ...[
            const SizedBox(height: 6),
            Row(
              children: [
                Icon(Icons.payments_outlined, size: 14, color: statusColor(payment)),
                const SizedBox(width: 4),
                Text(
                  paymentLabels[payment] ?? payment,
                  style: TextStyle(
                    fontSize: 12,
                    color: statusColor(payment),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ],
          if (!closed) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (rxUrl != null)
                  actionButton(
                    'Ordonnance',
                    _on(() async => _showRx(rxUrl)),
                    color: AppColors.accent,
                    icon: Icons.description_outlined,
                    dense: true,
                  ),
                if (pendingPayment) ...[
                  actionButton(
                    'Paiement reçu',
                    _on(() =>
                        ApiService.instance.pharmacyDecision(id, payment: 'verify')),
                    color: AppColors.success,
                    icon: Icons.check_circle_outline,
                    dense: true,
                  ),
                  actionButton(
                    'Paiement refusé',
                    _on(() =>
                        ApiService.instance.pharmacyDecision(id, payment: 'reject')),
                    color: Colors.red.shade700,
                    dense: true,
                  ),
                ],
                if (status == 'pending') ...[
                  actionButton(
                    'Accepter',
                    _on(() =>
                        ApiService.instance.pharmacyDecision(id, decision: 'accepted')),
                    color: AppColors.success,
                    icon: Icons.check,
                    dense: true,
                  ),
                  actionButton(
                    'Refuser',
                    _on(() =>
                        ApiService.instance.pharmacyDecision(id, decision: 'rejected')),
                    color: Colors.red.shade700,
                    icon: Icons.close,
                    dense: true,
                  ),
                ],
                if (status == 'accepted')
                  actionButton(
                    'Marquer prête',
                    _on(() =>
                        ApiService.instance.pharmacyDecision(id, decision: 'ready')),
                    icon: Icons.inventory_2_outlined,
                    dense: true,
                  ),
                if (status == 'ready' && !isPickup)
                  actionButton(
                    'Assigner un livreur',
                    _on(() => ApiService.instance.pharmacyAssignCourier(id)),
                    color: AppColors.accent,
                    icon: Icons.delivery_dining,
                    dense: true,
                  ),
              ],
            ),
            if (status == 'ready' && isPickup)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'En attente du retrait par le client.',
                  style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _ordersView() {
    if (_orders.isEmpty) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(
              height: 240,
              child: emptyView(
                'Aucune commande pour le moment.\n\nLes commandes réglées par le patient apparaîtront ici.',
              ),
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: _orders.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) => _orderCard(_orders[i]),
      ),
    );
  }

  // --- Stock ----------------------------------------------------------------

  Widget _searchField() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: TextField(
        onChanged: (v) => setState(() => _search = v),
        decoration: const InputDecoration(
          hintText: 'Rechercher un médicament…',
          prefixIcon: Icon(Icons.search, size: 20, color: AppColors.textMuted),
          border: InputBorder.none,
          contentPadding: EdgeInsets.symmetric(vertical: 12),
          isDense: true,
        ),
      ),
    );
  }

  Widget _stockRow(Map<String, dynamic> row) {
    final med = (row['medicines'] as Map<String, dynamic>?) ?? const {};
    final qty = (row['stock_qty'] as num?)?.toInt() ?? 0;
    final price = row['price'] as num?;
    final form = (med['form'] as String?) ?? '';
    final stockColor =
        qty == 0 ? Colors.red.shade600 : qty <= 5 ? AppColors.warning : AppColors.success;
    final stockLabel = qty == 0 ? 'Rupture' : qty <= 5 ? 'Bas · $qty' : '$qty en stock';

    return SpaceCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      margin: const EdgeInsets.only(bottom: 8),
      onTap: () => _editStock(row),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  medicineLabel(med),
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 3),
                Text(
                  [
                    if (form.isNotEmpty) form,
                    if (price != null) frAmount(price),
                  ].join(' · '),
                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          statusChip(stockLabel, stockColor),
        ],
      ),
    );
  }

  Widget _stockView() {
    final q = _search.trim().toLowerCase();
    final rows = q.isEmpty
        ? _stock
        : _stock.where((r) {
            final m = (r['medicines'] as Map<String, dynamic>?) ?? const {};
            return '${m['normalized_name'] ?? ''} ${m['strength'] ?? ''}'
                .toLowerCase()
                .contains(q);
          }).toList();

    if (rows.isEmpty) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(
              height: 220,
              child: emptyView(
                q.isEmpty
                    ? 'Aucun médicament en stock.\nAppuyez sur « Ajouter » pour remplir votre inventaire.'
                    : 'Aucun résultat pour « $_search ».',
              ),
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: rows.length,
        itemBuilder: (_, i) => _stockRow(rows[i]),
      ),
    );
  }

  Future<void> _editStock(Map<String, dynamic> row) async {
    final med = (row['medicines'] as Map<String, dynamic>?) ?? const {};
    final qtyCtrl =
        TextEditingController(text: '${(row['stock_qty'] as num?)?.toInt() ?? 0}');
    final priceCtrl = TextEditingController(
      text: row['price'] == null ? '' : '${(row['price'] as num).round()}',
    );

    final action = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text(
          medicineLabel(med),
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: qtyCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(hintText: 'Quantité en stock'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: priceCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(hintText: 'Prix (FCFA)'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop('delete'),
            child: Text('Retirer', style: TextStyle(color: Colors.red.shade400)),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop('save'),
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );

    final qtyText = qtyCtrl.text.trim();
    final priceText = priceCtrl.text.trim();
    qtyCtrl.dispose();
    priceCtrl.dispose();
    if (action == null || !mounted) return;
    if (action == 'delete') {
      await _act(() => ApiService.instance.pharmacyDeleteStock(row['id'] as String));
      return;
    }
    final qty = int.tryParse(qtyText);
    final price = priceText.isEmpty ? null : double.tryParse(priceText);
    if (qty == null) {
      showSnack(context, 'Quantité invalide.', error: true);
      return;
    }
    if (priceText.isNotEmpty && price == null) {
      showSnack(context, 'Prix invalide.', error: true);
      return;
    }
    await _act(() => ApiService.instance.pharmacyUpdateStock(
          row['id'] as String,
          stockQty: qty,
          price: price,
        ));
  }

  Future<void> _addStock() async {
    final nameCtrl = TextEditingController();
    final strengthCtrl = TextEditingController();
    final qtyCtrl = TextEditingController();
    final priceCtrl = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Text(
          'Ajouter au stock',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameCtrl,
              decoration: const InputDecoration(hintText: 'Nom (ex : paracetamol)'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: strengthCtrl,
              decoration: const InputDecoration(hintText: 'Dosage (ex : 500 mg)'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: qtyCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(hintText: 'Quantité'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: priceCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(hintText: 'Prix (FCFA)'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Ajouter'),
          ),
        ],
      ),
    );

    final name = nameCtrl.text.trim();
    final strength = strengthCtrl.text.trim();
    final qtyText = qtyCtrl.text.trim();
    final priceText = priceCtrl.text.trim();
    nameCtrl.dispose();
    strengthCtrl.dispose();
    qtyCtrl.dispose();
    priceCtrl.dispose();
    if (ok != true || !mounted) return;

    final qty = int.tryParse(qtyText);
    final price = priceText.isEmpty ? null : double.tryParse(priceText);
    if (name.isEmpty || qty == null) {
      showSnack(context, 'Nom et quantité sont obligatoires.', error: true);
      return;
    }
    if (priceText.isNotEmpty && price == null) {
      showSnack(context, 'Prix invalide.', error: true);
      return;
    }
    await _act(() => ApiService.instance.pharmacyAddStock(
          name: name,
          stock: qty,
          price: price,
          strength: strength,
        ));
  }

  @override
  Widget build(BuildContext context) {
    final pharmacy = (_me?['pharmacy'] as Map<String, dynamic>?);
    final stats = (_me?['stats'] as Map<String, dynamic>?);
    final openOrders = _orders
        .where((o) =>
            o['status'] != 'completed' &&
            o['status'] != 'cancelled' &&
            o['status'] != 'rejected')
        .length;
    final address = (pharmacy?['address'] as String?) ?? '';

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
                  'Espace Pharmacie',
                  subtitle: pharmacy == null
                      ? null
                      : address.isEmpty
                          ? '${pharmacy['name']}'
                          : '${pharmacy['name']} · $address',
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: StatCard(
                        label: 'Commandes',
                        value: '$openOrders',
                        icon: Icons.receipt_long,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: StatCard(
                        label: 'Références',
                        value: '${stats?['stock'] ?? 0}',
                        color: AppColors.accentLight,
                        icon: Icons.storage_outlined,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: StatCard(
                        label: 'Stock bas',
                        value: '${stats?['low_stock'] ?? 0}',
                        color: AppColors.warning,
                        icon: Icons.warning_amber_outlined,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                segmentedTabs(
                  labels: const ['Commandes', 'Stock'],
                  icons: const [Icons.receipt_long_outlined, Icons.storage_outlined],
                  selected: _tab,
                  onChanged: (i) => setState(() => _tab = i),
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
                          : _tab == 0
                              ? _ordersView()
                              : Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    _searchField(),
                                    const SizedBox(height: 10),
                                    Expanded(child: _stockView()),
                                  ],
                                ),
                ),
              ],
            ),
          ),
        ),
      ),
      floatingActionButton: (!_loading && _error == null && _tab == 1)
          ? FloatingActionButton.extended(
              onPressed: _busy ? null : _addStock,
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: const Text('Ajouter'),
            )
          : null,
    );
  }
}
