import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/config/app_config.dart';
import 'package:saha_sante/core/models/reservation.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/auth_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/core/widgets/notification_bell.dart';

/// Montant en FCFA, arrondi et séparé par milliers (« 4 000 FCFA »).
String _frAmount(num amount) {
  final digits = amount.round().abs().toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(' ');
    buffer.write(digits[i]);
  }
  return '${amount < 0 ? '-' : ''}$buffer FCFA';
}

String _hour(DateTime? date) {
  if (date == null) return '--:--';
  final local = date.toLocal();
  return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}

DateTime? _date(Object? value) => DateTime.tryParse(value as String? ?? '');

const _paymentLabels = <String, String>{
  'unpaid': 'Non réglé',
  'pending_verification': 'En attente de confirmation',
  'paid': 'Réglé',
  'failed': 'Paiement refusé',
};

const _methodLabels = <String, String>{
  'orange_money': 'Orange Money',
  'moov_money': 'Moov Money',
};

class TrackingScreen extends StatefulWidget {
  /// Commande à suivre. Sans identifiant, la commande en cours la plus
  /// récente est affichée.
  final String? reservationId;

  const TrackingScreen({super.key, this.reservationId});

  @override
  State<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends State<TrackingScreen> {
  final _phoneController = TextEditingController();
  final _referenceController = TextEditingController();

  Map<String, dynamic>? _raw;
  Reservation? _reservation;
  Map<String, dynamic>? _courier;
  String? _currentId;
  String _method = 'orange_money';
  bool _loading = true;
  bool _busy = false;
  String? _error;
  bool _empty = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant TrackingScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.reservationId != widget.reservationId) {
      _currentId = null;
      _load();
    }
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _referenceController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _error = null;
        _empty = false;
      });
    }
    try {
      var id = widget.reservationId ?? _currentId;
      if (id == null) {
        // Sans identifiant : la commande en cours la plus récente.
        final list = await ApiService.instance.getReservations();
        if (list.isEmpty) {
          if (!mounted) return;
          setState(() {
            _empty = true;
            _loading = false;
          });
          return;
        }
        final sorted = [...list]..sort((a, b) => b.createdAt.compareTo(a.createdAt));
        final ongoing = sorted.where((r) =>
            r.status != ReservationStatus.completed && r.status != ReservationStatus.cancelled);
        id = ongoing.isNotEmpty ? ongoing.first.id : sorted.first.id;
      }

      final data = await ApiService.instance.getReservation(id);
      final reservation = (data['reservation'] as Map<String, dynamic>?) ?? const {};
      if (!mounted) return;
      setState(() {
        _currentId = id;
        _raw = reservation;
        _reservation = Reservation.fromJson(reservation);
        _courier = data['courier'] as Map<String, dynamic>?;
        _loading = false;
      });
      // Pré-remplit le téléphone du payeur avec celui déjà connu.
      if (_phoneController.text.trim().isEmpty) {
        final phone = (reservation['patient_phone'] as String?) ?? AuthService.instance.user?.phone;
        if (phone != null && phone.isNotEmpty) _phoneController.text = phone;
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Impossible de charger le suivi de la commande.';
        _loading = false;
      });
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red.shade700),
    );
  }

  /// Choix du mode de remise : la livraison ajoute les frais, le retrait non.
  Future<void> _setFulfillment(String method) async {
    final id = _currentId;
    if (id == null || _busy) return;
    if (_reservation?.fulfillmentMethod == method) return;
    setState(() => _busy = true);
    try {
      await ApiService.instance.setFulfillment(id, method);
      await _load();
      if (!mounted) return;
      setState(() => _busy = false);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      _showError('Impossible de changer le mode de remise. Réessayez.');
    }
  }

  Future<void> _pay() async {
    final id = _currentId;
    if (id == null || _busy) return;
    final phone = _phoneController.text.trim();
    final reference = _referenceController.text.trim();
    if (phone.length < 8) {
      _showError('Saisissez le numéro de téléphone utilisé pour le paiement');
      return;
    }
    if (reference.length < 4) {
      _showError('Saisissez la référence de la transaction (4 caractères minimum)');
      return;
    }

    setState(() => _busy = true);
    try {
      await ApiService.instance.declarePayment(
        reservationId: id,
        method: _method,
        reference: reference,
        phone: phone,
      );
      await _load();
      if (!mounted) return;
      setState(() => _busy = false);
      _referenceController.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Paiement déclaré, en attente de confirmation par la pharmacie'),
          backgroundColor: AppColors.success,
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      _showError('La déclaration de paiement a échoué. Réessayez.');
    }
  }

  Future<void> _cancel() async {
    final id = _currentId;
    if (id == null || _busy) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Text(
          'Annuler la commande ?',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
        ),
        content: const Text('La pharmacie sera prévenue et la commande ne sera pas préparée.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Non, garder'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Annuler la commande'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _busy = true);
    try {
      await ApiService.instance.cancelReservation(id);
      await _load();
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Commande annulée')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      _showError('L\'annulation a échoué. Réessayez.');
    }
  }

  List<_TrackingItem> _steps() {
    final raw = _raw ?? const {};
    final reservation = _reservation;
    final pickup = reservation?.isPickup ?? false;
    final deliveryStatus = raw['delivery_status'] as String?;
    final createdAt = _date(raw['created_at']);
    final acceptedAt = _date(raw['accepted_at']);
    final readyAt = _date(raw['ready_at']);
    final deliveredAt = _date(raw['delivered_at']);
    final enRoute = deliveryStatus == 'picked_up' || deliveryStatus == 'en_route';

    return [
      _TrackingItem(
        icon: Icons.receipt,
        status: 'Commande reçue',
        time: _hour(createdAt),
        active: createdAt != null,
      ),
      _TrackingItem(
        icon: Icons.local_pharmacy,
        status: 'Préparation en pharmacie',
        time: _hour(acceptedAt),
        active: acceptedAt != null,
      ),
      _TrackingItem(
        icon: pickup ? Icons.storefront : Icons.two_wheeler,
        status: pickup ? 'Prête à retirer' : 'En cours de livraison',
        time: _hour(readyAt),
        active: readyAt != null || enRoute,
      ),
      _TrackingItem(
        icon: Icons.home,
        status: pickup ? 'Retirée' : 'Livrée',
        time: _hour(deliveredAt),
        active: deliveredAt != null,
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final reservation = _reservation;
    final raw = _raw ?? const <String, dynamic>{};
    final canPop = Navigator.of(context).canPop();
    final paymentStatus = reservation?.paymentStatus ?? 'unpaid';
    final active = reservation != null &&
        reservation.status != ReservationStatus.cancelled &&
        reservation.status != ReservationStatus.completed;
    final canCancel = active &&
        reservation.status != ReservationStatus.ready &&
        reservation.status != ReservationStatus.inTransit;

    return Scaffold(
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: _load,
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (canPop)
                        IconButton(
                          onPressed: () => context.pop(),
                          icon: const Icon(Icons.arrow_back),
                        ),
                      const NotificationBell(),
                      const Expanded(
                        child: Text(
                          'Suivi de livraison',
                          style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    reservation == null
                        ? 'Vos commandes en cours'
                        : 'Commande n° ${reservation.id.split('-').first.toUpperCase()}',
                    style: TextStyle(color: AppColors.textMuted),
                  ),
                  const SizedBox(height: 28),
                  if (_loading)
                    const Padding(
                      padding: EdgeInsets.only(top: 60),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (_error != null)
                    _Message(
                      icon: Icons.wifi_off,
                      text: _error!,
                      actionLabel: 'Réessayer',
                      onTap: _load,
                    )
                  else if (_empty || reservation == null)
                    _Message(
                      icon: Icons.local_shipping_outlined,
                      text: 'Aucune commande à suivre pour l\'instant.',
                      actionLabel: 'Scanner une ordonnance',
                      onTap: () => context.push('/scan'),
                    )
                  else ...[
                    _DetailCard(
                      reservation: reservation,
                      raw: raw,
                      courier: _courier,
                    ),
                    // Tant que le paiement n'est pas déclaré, la pharmacie ne
                    // voit pas la commande : c'est l'étape à faire maintenant.
                    if (paymentStatus == 'unpaid' && active) ...[
                      const SizedBox(height: 20),
                      _FulfillmentCard(
                        method: reservation.fulfillmentMethod,
                        busy: _busy,
                        onChanged: _setFulfillment,
                      ),
                      const SizedBox(height: 20),
                      _PaymentCard(
                        raw: raw,
                        total: reservation.totalPrice ?? 0,
                        method: _method,
                        busy: _busy,
                        phoneController: _phoneController,
                        referenceController: _referenceController,
                        onMethodChanged: (m) => setState(() => _method = m),
                        onPay: _pay,
                      ),
                    ] else if (paymentStatus == 'pending_verification' && active) ...[
                      const SizedBox(height: 20),
                      _Notice(
                        icon: Icons.hourglass_bottom,
                        color: AppColors.warning,
                        title: 'Paiement déclaré',
                        message: 'Votre paiement '
                            '${_methodLabels[raw['payment_method'] as String?] ?? 'mobile money'} '
                            'a bien été enregistré. La pharmacie doit maintenant confirmer '
                            'qu\'elle l\'a reçu avant de préparer la commande.',
                      ),
                    ] else if (paymentStatus == 'failed' && active) ...[
                      const SizedBox(height: 20),
                      const _Notice(
                        icon: Icons.error_outline,
                        color: Colors.redAccent,
                        title: 'Paiement refusé',
                        message: 'La pharmacie n\'a pas retrouvé votre paiement. Contactez-la pour régulariser.',
                      ),
                    ],
                    const SizedBox(height: 20),
                    Builder(builder: (context) {
                      final steps = _steps();
                      return Container(
                        padding: const EdgeInsets.all(20),
                        decoration: AppTheme.glassCard,
                        child: Column(
                          children: [
                            ...steps.asMap().entries.map((entry) {
                              return _buildStep(
                                entry.value,
                                isLast: entry.key == steps.length - 1,
                              );
                            }),
                          ],
                        ),
                      );
                    }),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: OutlinedButton.icon(
                        onPressed: () => context.push('/reservations'),
                        icon: const Icon(Icons.list_alt, size: 18),
                        label: const Text('Toutes mes commandes'),
                      ),
                    ),
                    if (canCancel) ...[
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        height: 52,
                        child: OutlinedButton.icon(
                          onPressed: _busy ? null : _cancel,
                          icon: const Icon(Icons.close, size: 18, color: Colors.redAccent),
                          label: const Text(
                            'Annuler la commande',
                            style: TextStyle(color: Colors.redAccent),
                          ),
                        ),
                      ),
                    ],
                  ],
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStep(_TrackingItem item, {required bool isLast}) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                height: 40,
                width: 40,
                decoration: BoxDecoration(
                  color: item.active ? AppColors.accent.withAlpha(30) : AppColors.surfaceLight,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: item.active ? AppColors.accent : AppColors.border,
                  ),
                ),
                child: Icon(
                  item.icon,
                  size: 18,
                  color: item.active ? AppColors.accent : AppColors.textMuted,
                ),
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 2,
                    color: item.active ? AppColors.accent.withAlpha(60) : AppColors.border,
                  ),
                ),
            ],
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.status,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: item.active ? AppColors.textPrimary : AppColors.textMuted,
                    ),
                  ),
                  Text(
                    item.time,
                    style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailCard extends StatelessWidget {
  final Reservation reservation;
  final Map<String, dynamic> raw;
  final Map<String, dynamic>? courier;

  const _DetailCard({
    required this.reservation,
    required this.raw,
    this.courier,
  });

  @override
  Widget build(BuildContext context) {
    final itemsTotal = (raw['items_total'] as num?)?.toDouble();
    final deliveryFee = (raw['delivery_fee'] as num?)?.toDouble();
    final unpaid = reservation.paymentStatus == 'unpaid';

    return Container(
      padding: const EdgeInsets.all(20),
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
                  color: AppColors.accent.withAlpha(30),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.local_pharmacy, color: AppColors.accent),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      reservation.pharmacyName,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                    ),
                    if (reservation.pharmacyAddress.isNotEmpty)
                      Text(
                        reservation.pharmacyAddress,
                        style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                      ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: reservation.status.color.withAlpha(30),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  reservation.status.label,
                  style: TextStyle(
                    fontSize: 11,
                    color: reservation.status.color,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          if (reservation.medicines.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(
              reservation.medicines.join(', '),
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
          ],
          const SizedBox(height: 16),
          Divider(color: AppColors.border, height: 1),
          const SizedBox(height: 16),
          _Line(
            label: reservation.isPickup ? 'Retrait en pharmacie' : 'Livraison à domicile',
            value: reservation.totalPrice == null ? '—' : _frAmount(reservation.totalPrice!),
            highlight: true,
          ),
          // Le détail complet est repris dans le récapitulatif de paiement.
          if (!unpaid && itemsTotal != null && deliveryFee != null && deliveryFee > 0)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'Médicaments ${_frAmount(itemsTotal)} + livraison ${_frAmount(deliveryFee)}',
                style: TextStyle(fontSize: 12, color: AppColors.textMuted),
              ),
            ),
          const SizedBox(height: 10),
          _Line(
            label: 'Paiement',
            value: _paymentLabels[reservation.paymentStatus] ?? reservation.paymentStatus,
          ),
          if (reservation.pickupCode != null && reservation.pickupCode!.isNotEmpty) ...[
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: AppColors.surfaceLight,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  Icon(Icons.qr_code_2, size: 20, color: AppColors.accent),
                  const SizedBox(width: 12),
                  Text(
                    'Code de retrait',
                    style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                  ),
                  const Spacer(),
                  Text(
                    reservation.pickupCode!,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 3,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (courier != null) ...[
            const SizedBox(height: 16),
            Row(
              children: [
                Container(
                  height: 40,
                  width: 40,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withAlpha(30),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(Icons.two_wheeler, size: 20, color: AppColors.primaryLight),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        courier!['full_name'] as String? ?? 'Livreur',
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                      ),
                      Text(
                        (courier!['phone'] as String?) ?? 'Votre livreur est en route',
                        style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Choix entre livraison à domicile (avec frais) et retrait en pharmacie.
class _FulfillmentCard extends StatelessWidget {
  final String method;
  final bool busy;
  final ValueChanged<String> onChanged;

  const _FulfillmentCard({
    required this.method,
    required this.busy,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: AppTheme.glassCard,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Comment récupérer vos médicaments ?',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 14),
          _Option(
            icon: Icons.two_wheeler,
            title: 'Livraison à domicile',
            subtitle: '+ ${_frAmount(AppConfig.deliveryFee)} de frais',
            selected: method == 'delivery',
            onTap: busy ? null : () => onChanged('delivery'),
          ),
          const SizedBox(height: 10),
          _Option(
            icon: Icons.storefront,
            title: 'Je récupère en pharmacie',
            subtitle: 'Sans frais de livraison',
            selected: method == 'pickup',
            onTap: busy ? null : () => onChanged('pickup'),
          ),
        ],
      ),
    );
  }
}

class _Option extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback? onTap;

  const _Option({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary.withAlpha(30) : AppColors.surfaceLight,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: selected ? AppColors.primary : AppColors.border),
        ),
        child: Row(
          children: [
            Icon(icon, size: 20, color: selected ? AppColors.primaryLight : AppColors.textMuted),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                  ),
                ],
              ),
            ),
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              size: 20,
              color: selected ? AppColors.primary : AppColors.border,
            ),
          ],
        ),
      ),
    );
  }
}

/// Récapitulatif des montants et déclaration du paiement mobile money.
class _PaymentCard extends StatelessWidget {
  final Map<String, dynamic> raw;
  final double total;
  final String method;
  final bool busy;
  final TextEditingController phoneController;
  final TextEditingController referenceController;
  final ValueChanged<String> onMethodChanged;
  final VoidCallback onPay;

  const _PaymentCard({
    required this.raw,
    required this.total,
    required this.method,
    required this.busy,
    required this.phoneController,
    required this.referenceController,
    required this.onMethodChanged,
    required this.onPay,
  });

  @override
  Widget build(BuildContext context) {
    final itemsTotal = (raw['items_total'] as num?)?.toDouble() ?? 0;
    final deliveryFee = (raw['delivery_fee'] as num?)?.toDouble() ?? 0;
    final merchant = AppConfig.merchantNumbers[method];

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: AppTheme.glassCard,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Récapitulatif',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 14),
          _Line(label: 'Médicaments', value: _frAmount(itemsTotal)),
          const SizedBox(height: 8),
          _Line(
            label: 'Livraison',
            value: deliveryFee > 0 ? _frAmount(deliveryFee) : 'Offerte (retrait)',
          ),
          const SizedBox(height: 12),
          Divider(color: AppColors.border, height: 1),
          const SizedBox(height: 12),
          _Line(label: 'Total à payer', value: _frAmount(total), highlight: true),
          const SizedBox(height: 20),
          const Text(
            'Paiement mobile money',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          Text(
            'La pharmacie ne prépare la commande qu\'une fois le paiement déclaré.',
            style: TextStyle(fontSize: 12, color: AppColors.textMuted),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _MethodChip(
                  label: _methodLabels['orange_money']!,
                  selected: method == 'orange_money',
                  onTap: busy ? null : () => onMethodChanged('orange_money'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MethodChip(
                  label: _methodLabels['moov_money']!,
                  selected: method == 'moov_money',
                  onTap: busy ? null : () => onMethodChanged('moov_money'),
                ),
              ),
            ],
          ),
          if (merchant != null) ...[
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: AppColors.surfaceLight,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  Icon(Icons.smartphone, size: 18, color: AppColors.accent),
                  const SizedBox(width: 12),
                  Text(
                    'Numéro marchand',
                    style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                  ),
                  const Spacer(),
                  Flexible(
                    child: Text(
                      merchant,
                      textAlign: TextAlign.end,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 14),
          TextField(
            controller: phoneController,
            keyboardType: TextInputType.phone,
            enabled: !busy,
            decoration: InputDecoration(
              hintText: 'Votre numéro de téléphone',
              prefixIcon: Icon(Icons.call, size: 18, color: AppColors.textMuted),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: referenceController,
            textCapitalization: TextCapitalization.characters,
            enabled: !busy,
            decoration: InputDecoration(
              hintText: 'Référence de la transaction',
              prefixIcon: Icon(Icons.confirmation_number_outlined, size: 18, color: AppColors.textMuted),
            ),
          ),
          const SizedBox(height: 18),
          Container(
            width: double.infinity,
            height: 56,
            decoration: AppTheme.gradientButton,
            child: ElevatedButton.icon(
              onPressed: busy ? null : onPay,
              icon: busy
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.lock_outline, size: 18, color: Colors.white),
              label: Text('Payer · ${_frAmount(total)}'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.transparent,
                shadowColor: Colors.transparent,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MethodChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback? onTap;

  const _MethodChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? AppColors.accent.withAlpha(30) : AppColors.surfaceLight,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: selected ? AppColors.accent : AppColors.border),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: selected ? AppColors.accentLight : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  final String label;
  final String value;
  final bool highlight;

  const _Line({required this.label, required this.value, this.highlight = false});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: highlight ? 16 : 13,
            fontWeight: highlight ? FontWeight.bold : FontWeight.w500,
            color: highlight ? AppColors.accent : AppColors.textPrimary,
          ),
        ),
      ],
    );
  }
}

class _Notice extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String message;

  const _Notice({
    required this.icon,
    required this.color,
    required this.title,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: color.withAlpha(90)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: color),
                ),
                const SizedBox(height: 4),
                Text(
                  message,
                  style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Message extends StatelessWidget {
  final IconData icon;
  final String text;
  final String actionLabel;
  final VoidCallback onTap;

  const _Message({
    required this.icon,
    required this.text,
    required this.actionLabel,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: AppTheme.glassCard,
      child: Column(
        children: [
          Icon(icon, size: 44, color: AppColors.textMuted),
          const SizedBox(height: 16),
          Text(
            text,
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textMuted),
          ),
          const SizedBox(height: 12),
          TextButton(onPressed: onTap, child: Text(actionLabel)),
        ],
      ),
    );
  }
}

class _TrackingItem {
  final IconData icon;
  final String status;
  final String time;
  final bool active;

  _TrackingItem({
    required this.icon,
    required this.status,
    required this.time,
    required this.active,
  });
}

