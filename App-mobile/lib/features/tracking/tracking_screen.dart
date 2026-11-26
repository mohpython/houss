import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/config/app_config.dart';
import 'package:saha_sante/core/models/reservation.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/auth_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/saha3d.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/services/voice_service.dart';
import 'package:saha_sante/features/payments/orange_payment_screen.dart';

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

String _payLabel(String status) => switch (status) {
  'unpaid' => L10n.c('st.pay.unpaid'),
  'pending_verification' => L10n.c('trk.payPending'),
  'paid' => L10n.c('st.pay.paid'),
  'failed' => L10n.c('st.pay.failed'),
  _ => status,
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

class _TrackingScreenState extends State<TrackingScreen>
    with WidgetsBindingObserver {
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

  /// Numero du dernier changement de mode de remise demande. Une reponse qui
  /// arrive pour un numero anterieur est ignoree : sans cela, cliquer vite sur
  /// « retrait » puis « livraison » pouvait reafficher « retrait » alors que la
  /// derniere intention etait l'inverse.
  int _fulfillmentSeq = 0;

  @override
  void initState() {
    super.initState();
    // Voix : lit les étapes de la commande une fois les données chargées.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await _load();
      if (mounted) VoiceService.instance.speak(_voiceStepsText());
    });
  }

  Future<void> _verifyAfterOrangeReturn() async {
    await _load();
    if (!mounted) return;
    if (_reservation?.paymentStatus != 'paid') {
      await Future<void>.delayed(const Duration(seconds: 2));
      if (!mounted) return;
      await _load();
    }
    if (!mounted) return;
    if (_reservation?.paymentStatus == 'paid') {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(L10n.c('st.pay.paid')),
          backgroundColor: AppColors.success,
        ),
      );
    } else {
      _showError(L10n.c('trk.payNotConfirmed'));
    }
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
    WidgetsBinding.instance.removeObserver(this);
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
        final sorted = [...list]
          ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
        final ongoing = sorted.where(
          (r) =>
              r.status != ReservationStatus.completed &&
              r.status != ReservationStatus.cancelled,
        );
        id = ongoing.isNotEmpty ? ongoing.first.id : sorted.first.id;
      }

      final data = await ApiService.instance.getReservation(id);
      final reservation =
          (data['reservation'] as Map<String, dynamic>?) ?? const {};
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
        final phone =
            (reservation['patient_phone'] as String?) ??
            AuthService.instance.user?.phone;
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
        _error = L10n.c('trk.loadFailed');
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
  ///
  /// Le bouton bascule dans la meme image : on applique le nouveau mode en
  /// local avant d'appeler le serveur. Avant, chaque changement enchainait deux
  /// aller-retours (l'ecriture puis un rechargement complet de la commande) et
  /// la carte etait bloquee pendant ce temps, ce qui se voyait comme plusieurs
  /// secondes de latence entre le clic et le changement.
  ///
  /// [_fulfillmentSeq] sert quand l'utilisateur enchaîne les clics : seule la
  /// reponse la plus recente est acceptee, une reponse plus ancienne ne peut
  /// plus reafficher un mode deja abandonne.
  Future<void> _setFulfillment(String method) async {
    final id = _currentId;
    final current = _reservation;
    if (id == null || current == null) return;
    if (current.fulfillmentMethod == method) return;

    final seq = ++_fulfillmentSeq;
    final wasMethod = current.fulfillmentMethod;
    final wasTotal = current.totalPrice;

    setState(() {
      _busy = true;
      // Le retrait ne coute rien, la livraison ajoute les frais de livraison.
      final fee = AppConfig.deliveryFee.toDouble();
      final items = (wasTotal ?? 0) - (wasMethod == 'pickup' ? 0 : fee);
      _reservation = current.copyWith(
        fulfillmentMethod: method,
        totalPrice: method == 'pickup' ? items : items + fee,
      );
    });

    try {
      final saved = await ApiService.instance.setFulfillment(id, method);
      if (!mounted || seq != _fulfillmentSeq) return;
      setState(() {
        _reservation = saved;
        _busy = false;
      });
    } on ApiException catch (e) {
      if (!mounted || seq != _fulfillmentSeq) return;
      setState(() {
        _reservation = current.copyWith(
          fulfillmentMethod: wasMethod,
          totalPrice: wasTotal,
        );
        _busy = false;
      });
      _showError(e.message);
    } catch (_) {
      if (!mounted || seq != _fulfillmentSeq) return;
      setState(() {
        _reservation = current.copyWith(
          fulfillmentMethod: wasMethod,
          totalPrice: wasTotal,
        );
        _busy = false;
      });
      _showError(L10n.c('trk.modeFailed'));
    }
  }

  Future<void> _pay() async {
    final id = _currentId;
    if (id == null || _busy) return;
    final phone = _phoneController.text.trim();
    final reference = _referenceController.text.trim();
    if (phone.length < 8) {
      _showError(L10n.c('trk.errPhone'));
      return;
    }
    if (reference.length < 4) {
      _showError(L10n.c('trk.errRef'));
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
          content: Text(L10n.c('trk.payDeclared')),
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
      _showError(L10n.c('trk.payDeclareFailed'));
    }
  }

  /// Démarre un paiement en ligne Orange Money WebPay : la page de paiement
  /// s'ouvre DANS l'application (WebView) afin que l'app puisse surveiller la
  /// transaction et refermer la page automatiquement dès que le paiement est
  /// confirmé — le patient revient alors directement sur le suivi.
  ///
  /// L'argent (médicaments + livraison) est versé directement sur le compte
  /// Orange Money de la pharmacie.
  Future<void> _payOnline() async {
    final id = _currentId;
    if (id == null || _busy) return;

    setState(() => _busy = true);
    try {
      final result = await ApiService.instance.startOrangePayment(id);
      if (result.paymentUrl.isEmpty) {
        if (!mounted) return;
        setState(() => _busy = false);
        _showError(L10n.c('trk.payOpenFailed'));
        return;
      }
      if (!mounted) return;
      setState(() => _busy = false);
      final paid = await Navigator.of(context).push<bool>(
        MaterialPageRoute<bool>(
          builder: (_) => OrangePaymentScreen(
            reservationId: id,
            paymentUrl: result.paymentUrl,
          ),
        ),
      );
      if (!mounted) return;
      // Paiement confirmé : on recharge le suivi de la commande.
      if (paid == true) {
        await _load();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(L10n.c('st.pay.paid')),
            backgroundColor: AppColors.success,
          ),
        );
      } else {
        await _verifyAfterOrangeReturn();
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      _showError(L10n.c('trk.payOpenFailed'));
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
        title: Text(
          L10n.c('trk.cancelTitle'),
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
        ),
        content: Text(L10n.c('trk.cancelBody')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(L10n.c('trk.cancelKeep')),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(L10n.c('trk.cancelConfirm')),
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
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(L10n.c('trk.cancelled'))));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      _showError(L10n.c('trk.cancelFailed'));
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
    final enRoute =
        deliveryStatus == 'picked_up' || deliveryStatus == 'en_route';

    return [
      _TrackingItem(
        icon: Icons.receipt,
        status: L10n.c('trk.step.received'),
        time: _hour(createdAt),
        active: createdAt != null,
      ),
      _TrackingItem(
        icon: Icons.local_pharmacy,
        status: L10n.c('trk.step.preparing'),
        time: _hour(acceptedAt),
        active: acceptedAt != null,
      ),
      _TrackingItem(
        icon: pickup ? Icons.storefront : Icons.two_wheeler,
        status: pickup
            ? L10n.c('trk.step.readyPickup')
            : L10n.c('trk.step.delivering'),
        time: _hour(readyAt),
        active: readyAt != null || enRoute,
      ),
      _TrackingItem(
        icon: Icons.home,
        status: pickup
            ? L10n.c('trk.step.pickedUp')
            : L10n.c('trk.step.delivered'),
        time: _hour(deliveredAt),
        active: deliveredAt != null,
      ),
    ];
  }

  /// Texte lu à voix haute : les étapes de la commande et son état de
  /// paiement, dans la langue choisie.
  String _voiceStepsText() {
    final steps = _steps().map((s) => s.status).join('. ');
    final pay = switch (_reservation?.paymentStatus) {
      'paid' => L10n.c('st.pay.paid'),
      'pending_verification' => L10n.c('trk.payPending'),
      'failed' => L10n.c('st.pay.failed'),
      _ => L10n.c('st.pay.unpaid'),
    };
    return '${L10n.c('trk.title')}. $steps. $pay';
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    final reservation = _reservation;
    final raw = _raw ?? const <String, dynamic>{};
    final paymentStatus = reservation?.paymentStatus ?? 'unpaid';
    final active =
        reservation != null &&
        reservation.status != ReservationStatus.cancelled &&
        reservation.status != ReservationStatus.completed;
    final canCancel =
        active &&
        reservation.status != ReservationStatus.ready &&
        reservation.status != ReservationStatus.inTransit;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: Saha3D.bg,
      ),
      child: Scaffold(
        backgroundColor: Saha3D.bg,
        body: Stack(
          children: [
            const Positioned(
              top: -140,
              right: -100,
              child: Saha3DGlow(size: 340, color: Color(0x4434E3A4)),
            ),
            const Positioned(
              bottom: -120,
              left: -110,
              child: Saha3DGlow(size: 300, color: Color(0x2214B8A6)),
            ),
            SafeArea(
              child: RefreshIndicator(
                color: Saha3D.mint,
                backgroundColor: Saha3D.cardSolid,
                onRefresh: _load,
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(20, 10, 20, 120),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Saha3DHeader(
                        onSearch: () => context.push('/pharmacies'),
                        trailing: _voiceButton(),
                      ),
                      const SizedBox(height: 18),
                      _hero(reservation),
                      const SizedBox(height: 20),
                      if (_loading)
                        const Padding(
                          padding: EdgeInsets.only(top: 60),
                          child: Center(
                            child: CircularProgressIndicator(
                              color: Saha3D.mint,
                            ),
                          ),
                        )
                      else if (_error != null)
                        _Message(
                          icon: Icons.wifi_off_rounded,
                          text: _error!,
                          actionLabel: L10n.t(context, 'common.retry'),
                          onTap: _load,
                        )
                      else if (_empty || reservation == null)
                        _Message(
                          icon: Icons.local_shipping_outlined,
                          text: L10n.t(context, 'trk.empty'),
                          actionLabel: L10n.t(context, 'trk.scanAction'),
                          onTap: () => context.push('/scan'),
                        )
                      else ...[
                        _DetailCard(
                          reservation: reservation,
                          raw: raw,
                          courier: _courier,
                          steps: _steps(),
                        ),
                        // Tant que le paiement n'est pas déclaré, la pharmacie ne
                        // voit pas la commande : c'est l'étape à faire maintenant.
                        if (paymentStatus == 'unpaid' && active) ...[
                          const SizedBox(height: 16),
                          _FulfillmentCard(
                            method: reservation.fulfillmentMethod,
                            onChanged: _setFulfillment,
                          ),
                          const SizedBox(height: 16),
                          _PaymentCard(
                            raw: raw,
                            total: reservation.totalPrice ?? 0,
                            method: _method,
                            busy: _busy,
                            phoneController: _phoneController,
                            referenceController: _referenceController,
                            onMethodChanged: (m) => setState(() => _method = m),
                            onPay: _pay,
                            onPayOnline: _payOnline,
                          ),
                        ] else if (paymentStatus == 'pending_verification' &&
                            active) ...[
                          const SizedBox(height: 16),
                          _Notice(
                            icon: Icons.hourglass_bottom_rounded,
                            color: Saha3D.warning,
                            title: L10n.t(context, 'trk.payDeclaredTitle'),
                            message: L10n.tArgs(context, 'trk.payRegistered', {
                              'method':
                                  _methodLabels[raw['payment_method']
                                      as String?] ??
                                  'mobile money',
                            }),
                          ),
                        ] else if (paymentStatus == 'failed' && active) ...[
                          const SizedBox(height: 16),
                          _Notice(
                            icon: Icons.error_outline_rounded,
                            color: Saha3D.danger,
                            title: L10n.t(context, 'st.pay.failed'),
                            message: L10n.t(context, 'trk.payRefusedMsg'),
                          ),
                        ],
                        const SizedBox(height: 18),
                        SizedBox(
                          width: double.infinity,
                          height: 52,
                          child: OutlinedButton.icon(
                            onPressed: () => context.push('/reservations'),
                            icon: const Icon(
                              Icons.receipt_long_rounded,
                              size: 18,
                            ),
                            label: Text(L10n.t(context, 'trk.allOrders')),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Saha3D.text,
                              side: const BorderSide(
                                color: Saha3D.borderStrong,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(18),
                              ),
                            ),
                          ),
                        ),
                        if (canCancel) ...[
                          const SizedBox(height: 10),
                          SizedBox(
                            width: double.infinity,
                            height: 52,
                            child: OutlinedButton.icon(
                              onPressed: _busy ? null : _cancel,
                              icon: const Icon(
                                Icons.close_rounded,
                                size: 18,
                                color: Saha3D.danger,
                              ),
                              label: Text(
                                L10n.t(context, 'trk.cancelConfirm'),
                                style: const TextStyle(
                                  color: Saha3D.danger,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              style: OutlinedButton.styleFrom(
                                backgroundColor: Saha3D.danger.withValues(
                                  alpha: 0.06,
                                ),
                                side: BorderSide(
                                  color: Saha3D.danger.withValues(alpha: 0.45),
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(18),
                                ),
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
          ],
        ),
      ),
    );
  }

  /// Bouton d'écoute vocale adapté au fond sombre.
  Widget _voiceButton() {
    final voice = VoiceService.instance;
    return AnimatedBuilder(
      animation: voice,
      builder: (context, _) {
        if (!voice.enabled) return const SizedBox.shrink();
        return InkWell(
          onTap: () => voice.speak(_voiceStepsText()),
          borderRadius: BorderRadius.circular(15),
          child: Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: Saha3D.card,
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: Saha3D.borderStrong),
            ),
            child: Icon(
              voice.speaking
                  ? Icons.graphic_eq_rounded
                  : Icons.volume_up_rounded,
              color: Saha3D.mint,
              size: 21,
            ),
          ),
        );
      },
    );
  }

  /// Bandeau d'introduction : pastille, titre surligné et illustration 3D.
  Widget _hero(Reservation? reservation) {
    final pickup = reservation?.isPickup ?? false;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Positioned(
          right: -14,
          top: -6,
          child: Container(
            width: 170,
            height: 150,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                colors: [
                  Saha3D.mint.withValues(alpha: 0.16),
                  Saha3D.mint.withValues(alpha: 0),
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(right: 112),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Saha3DPill(
                label: L10n.t(context, 'trk.title'),
                asset: 'assets/icons3d/tracking.png',
              ),
              const SizedBox(height: 14),
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(text: '${L10n.t(context, 'trk.heroLead')} '),
                    TextSpan(
                      text: L10n.t(context, 'trk.heroHighlight'),
                      style: const TextStyle(color: Saha3D.yellow),
                    ),
                  ],
                ),
                style: const TextStyle(
                  fontSize: 29,
                  height: 1.08,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.8,
                  color: Saha3D.text,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                L10n.t(context, 'trk.heroDesc'),
                style: const TextStyle(
                  fontSize: 12.5,
                  height: 1.45,
                  color: Saha3D.mintSoft,
                ),
              ),
            ],
          ),
        ),
        Positioned(
          right: 0,
          top: 8,
          child: SizedBox(
            width: 124,
            height: 128,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Image.asset(
                    pickup
                        ? 'assets/icons3d/pharmacy.png'
                        : 'assets/icons3d/scooter.png',
                    width: 112,
                    height: 112,
                    fit: BoxFit.contain,
                  ),
                ),
                Positioned(
                  right: -4,
                  top: -4,
                  child: Container(
                    padding: const EdgeInsets.all(5),
                    decoration: BoxDecoration(
                      color: Saha3D.cardSolid,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: Saha3D.yellow.withValues(alpha: 0.55),
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Saha3D.yellow.withValues(alpha: 0.30),
                          blurRadius: 14,
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.location_on_rounded,
                      size: 17,
                      color: Saha3D.yellow,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _DetailCard extends StatelessWidget {
  final Reservation reservation;
  final Map<String, dynamic> raw;
  final Map<String, dynamic>? courier;
  final List<_TrackingItem> steps;

  const _DetailCard({
    required this.reservation,
    required this.raw,
    required this.steps,
    this.courier,
  });

  @override
  Widget build(BuildContext context) {
    final itemsTotal = (raw['items_total'] as num?)?.toDouble();
    final deliveryFee = (raw['delivery_fee'] as num?)?.toDouble();
    final unpaid = reservation.paymentStatus == 'unpaid';
    final orderNo = reservation.id.split('-').first.toUpperCase();

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: Saha3D.glass(radius: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  L10n.tArgs(context, 'trk.orderNo', {'num': orderNo}),
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: Saha3D.muted,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: reservation.status.color.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: reservation.status.color.withValues(alpha: 0.45),
                  ),
                ),
                child: Text(
                  reservation.status.label,
                  style: TextStyle(
                    fontSize: 10.5,
                    color: reservation.status.color,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Saha3D.border),
                ),
                child: Image.asset(
                  'assets/icons3d/pharmacy.png',
                  fit: BoxFit.contain,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      reservation.pharmacyName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700,
                        color: Saha3D.text,
                      ),
                    ),
                    if (reservation.pharmacyAddress.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        reservation.pharmacyAddress,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11.5,
                          color: Saha3D.muted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          if (reservation.medicines.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              reservation.medicines.join(', '),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                height: 1.4,
                color: Saha3D.mintSoft,
              ),
            ),
          ],
          const SizedBox(height: 18),
          _StepsRow(steps: steps),
          const SizedBox(height: 18),
          Divider(color: Saha3D.border, height: 1),
          const SizedBox(height: 14),
          _Line(
            label: reservation.isPickup
                ? L10n.t(context, 'trk.pickup')
                : L10n.t(context, 'trk.delivery'),
            value: reservation.totalPrice == null
                ? '—'
                : _frAmount(reservation.totalPrice!),
            highlight: true,
          ),
          // Le détail complet est repris dans le récapitulatif de paiement.
          if (!unpaid &&
              itemsTotal != null &&
              deliveryFee != null &&
              deliveryFee > 0)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                L10n.tArgs(context, 'trk.itemsPlusFee', {
                  'items': _frAmount(itemsTotal),
                  'fee': _frAmount(deliveryFee),
                }),
                style: const TextStyle(fontSize: 11.5, color: Saha3D.muted),
              ),
            ),
          const SizedBox(height: 10),
          _Line(
            label: L10n.t(context, 'common.payment'),
            value: _payLabel(reservation.paymentStatus),
          ),
          if (reservation.pickupCode != null &&
              reservation.pickupCode!.isNotEmpty) ...[
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: Saha3D.mint.withValues(alpha: 0.07),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Saha3D.mint.withValues(alpha: 0.28)),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.qr_code_2_rounded,
                    size: 20,
                    color: Saha3D.mint,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      L10n.t(context, 'trk.pickupCode'),
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: Saha3D.mintSoft,
                      ),
                    ),
                  ),
                  Text(
                    reservation.pickupCode!,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 2.5,
                      color: Saha3D.text,
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (courier != null) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.04),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Saha3D.border),
                  ),
                  child: Image.asset(
                    'assets/icons3d/scooter.png',
                    fit: BoxFit.contain,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        courier!['full_name'] as String? ??
                            L10n.t(context, 'role.courier'),
                        style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                          color: Saha3D.text,
                        ),
                      ),
                      Text(
                        (courier!['phone'] as String?) ??
                            L10n.t(context, 'trk.courierEnRoute'),
                        style: const TextStyle(
                          fontSize: 11.5,
                          color: Saha3D.muted,
                        ),
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

/// Frise horizontale des étapes de la commande (maquette Suivi).
class _StepsRow extends StatelessWidget {
  final List<_TrackingItem> steps;

  const _StepsRow({required this.steps});

  @override
  Widget build(BuildContext context) {
    final lastActive = steps.lastIndexWhere((step) => step.active);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < steps.length; i++)
          Expanded(
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        height: 2,
                        color: i == 0
                            ? Colors.transparent
                            : (steps[i].active
                                  ? Saha3D.mint
                                  : Saha3D.borderStrong),
                      ),
                    ),
                    _dot(
                      steps[i],
                      completed: i < lastActive,
                      current: i == lastActive,
                    ),
                    Expanded(
                      child: Container(
                        height: 2,
                        color: i == steps.length - 1
                            ? Colors.transparent
                            : (steps[i + 1].active
                                  ? Saha3D.mint
                                  : Saha3D.borderStrong),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 7),
                Text(
                  steps[i].status,
                  maxLines: 2,
                  textAlign: TextAlign.center,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 9.5,
                    height: 1.15,
                    fontWeight: steps[i].active
                        ? FontWeight.w700
                        : FontWeight.w500,
                    color: steps[i].active ? Saha3D.text : Saha3D.muted,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  steps[i].time,
                  style: const TextStyle(fontSize: 9, color: Saha3D.muted),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _dot(
    _TrackingItem item, {
    required bool completed,
    required bool current,
  }) {
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: item.active
            ? (completed ? Saha3D.mint : Saha3D.cardSolid)
            : Saha3D.bgDeep,
        border: Border.all(
          color: item.active ? Saha3D.mint : Saha3D.borderStrong,
          width: 1.5,
        ),
        boxShadow: current
            ? [
                BoxShadow(
                  color: Saha3D.mint.withValues(alpha: 0.35),
                  blurRadius: 12,
                ),
              ]
            : null,
      ),
      child: Icon(
        completed ? Icons.check_rounded : item.icon,
        size: 15,
        color: completed
            ? Saha3D.onMint
            : (item.active ? Saha3D.mint : Saha3D.muted),
      ),
    );
  }
}

/// Choix entre livraison à domicile (avec frais) et retrait en pharmacie.
class _FulfillmentCard extends StatelessWidget {
  final String method;
  final ValueChanged<String> onChanged;

  const _FulfillmentCard({required this.method, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: Saha3D.glass(radius: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            L10n.t(context, 'trk.howToGet'),
            style: const TextStyle(
              fontSize: 14.5,
              fontWeight: FontWeight.w700,
              color: Saha3D.text,
            ),
          ),
          const SizedBox(height: 14),
          _Option(
            icon: Icons.two_wheeler,
            title: L10n.t(context, 'trk.delivery'),
            subtitle: L10n.tArgs(context, 'trk.deliveryFee', {
              'fee': _frAmount(AppConfig.deliveryFee),
            }),
            selected: method == 'delivery',
            // Le bouton n'est pas bloque pendant l'appel : la selection est
            // deja affichee, et la commande de l'utilisateur prime sur la
            // reponse en cours. Le serveur confirme derriere.
            onTap: () => onChanged('delivery'),
          ),
          const SizedBox(height: 10),
          _Option(
            icon: Icons.storefront,
            title: L10n.t(context, 'trk.pickupTitle'),
            subtitle: L10n.t(context, 'trk.noFee'),
            selected: method == 'pickup',
            onTap: () => onChanged('pickup'),
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
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        decoration: BoxDecoration(
          color: selected
              ? Saha3D.mint.withValues(alpha: 0.10)
              : Colors.white.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: selected
                ? Saha3D.mint.withValues(alpha: 0.55)
                : Saha3D.border,
          ),
        ),
        child: Row(
          children: [
            Icon(icon, size: 20, color: selected ? Saha3D.mint : Saha3D.muted),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: Saha3D.text,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: const TextStyle(fontSize: 11.5, color: Saha3D.muted),
                  ),
                ],
              ),
            ),
            Icon(
              selected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              size: 20,
              color: selected ? Saha3D.mint : Saha3D.borderStrong,
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
  final VoidCallback onPayOnline;

  const _PaymentCard({
    required this.raw,
    required this.total,
    required this.method,
    required this.busy,
    required this.phoneController,
    required this.referenceController,
    required this.onMethodChanged,
    required this.onPay,
    required this.onPayOnline,
  });

  @override
  Widget build(BuildContext context) {
    final itemsTotal = (raw['items_total'] as num?)?.toDouble() ?? 0;
    final deliveryFee = (raw['delivery_fee'] as num?)?.toDouble() ?? 0;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: Saha3D.glass(radius: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            L10n.t(context, 'trk.summary'),
            style: const TextStyle(
              fontSize: 14.5,
              fontWeight: FontWeight.w700,
              color: Saha3D.text,
            ),
          ),
          const SizedBox(height: 14),
          _Line(
            label: L10n.t(context, 'trk.medicines'),
            value: _frAmount(itemsTotal),
          ),
          const SizedBox(height: 8),
          _Line(
            label: L10n.t(context, 'trk.deliveryLabel'),
            value: deliveryFee > 0
                ? _frAmount(deliveryFee)
                : L10n.t(context, 'trk.freePickup'),
          ),
          const SizedBox(height: 12),
          Divider(color: Saha3D.border, height: 1),
          const SizedBox(height: 12),
          _Line(
            label: L10n.t(context, 'trk.totalToPay'),
            value: _frAmount(total),
            highlight: true,
          ),
          const SizedBox(height: 18),
          Container(
            width: double.infinity,
            height: 54,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Saha3D.mint, Color(0xFF10B981)],
              ),
              borderRadius: BorderRadius.circular(27),
              boxShadow: [
                BoxShadow(
                  color: Saha3D.mint.withValues(alpha: 0.32),
                  blurRadius: 22,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: ElevatedButton.icon(
              onPressed: busy ? null : onPayOnline,
              icon: busy
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Saha3D.onMint,
                      ),
                    )
                  : const Icon(
                      Icons.lock_outline_rounded,
                      size: 18,
                      color: Saha3D.onMint,
                    ),
              label: Text(
                L10n.tArgs(context, 'trk.payWith', {
                  'amount': _frAmount(total),
                }),
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.transparent,
                shadowColor: Colors.transparent,
                foregroundColor: Saha3D.onMint,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(27),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  final String label;
  final String value;
  final bool highlight;

  const _Line({
    required this.label,
    required this.value,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 12.5, color: Saha3D.muted),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: highlight ? 16 : 12.5,
            fontWeight: highlight ? FontWeight.w800 : FontWeight.w600,
            color: highlight ? Saha3D.mint : Saha3D.text,
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
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Saha3D.cardSolid,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.45)),
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
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: color,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  message,
                  style: const TextStyle(
                    fontSize: 12.5,
                    height: 1.4,
                    color: Saha3D.mintSoft,
                  ),
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
      decoration: Saha3D.glass(radius: 24),
      child: Column(
        children: [
          Icon(icon, size: 44, color: Saha3D.mint),
          const SizedBox(height: 16),
          Text(
            text,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Saha3D.mintSoft),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: onTap,
            child: Text(
              actionLabel,
              style: const TextStyle(
                color: Saha3D.mint,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
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
