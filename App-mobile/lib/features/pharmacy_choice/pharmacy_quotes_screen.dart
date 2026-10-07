import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/models/reservation.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/core/widgets/notification_bell.dart';

/// Étape 2 du parcours ordonnance : pharmacies classées pour l'ordonnance —
/// celles qui ont tout en stock en premier — avec prix et suggestions.
/// Le patient choisit, la commande est créée chez elle (étape 3 = paiement
/// sur l'écran de suivi).
///
/// Paramètres d'URL (posés par l'étape 1) : `mode` (gps|neighborhood), `lat`,
/// `lng`, `address?`, `neighborhoodId?`, `fulfillment` (delivery|pickup).
class PharmacyQuotesScreen extends StatefulWidget {
  final String prescriptionId;
  final String mode;
  final double? lat;
  final double? lng;
  final String? address;
  final String? neighborhoodId;
  final String fulfillment;

  const PharmacyQuotesScreen({
    super.key,
    required this.prescriptionId,
    required this.mode,
    this.lat,
    this.lng,
    this.address,
    this.neighborhoodId,
    required this.fulfillment,
  });

  @override
  State<PharmacyQuotesScreen> createState() => _PharmacyQuotesScreenState();
}

class _PharmacyQuotesScreenState extends State<PharmacyQuotesScreen> {
  List<Map<String, dynamic>>? _quotes;
  bool _loading = true;
  String? _error;
  String? _creatingId;

  bool get _valid {
    if (widget.mode == 'neighborhood') {
      return (widget.neighborhoodId ?? '').isNotEmpty;
    }
    return widget.lat != null && widget.lng != null;
  }

  @override
  void initState() {
    super.initState();
    if (_valid) {
      _checkExisting();
      _load();
    } else {
      _loading = false;
      _error = L10n.t(context, 'delivery.error');
    }
  }

  /// Une commande existe-t-elle déjà ? Si oui, on ouvre son suivi au lieu de
  /// proposer une liste qui créerait un doublon.
  Future<void> _checkExisting() async {
    try {
      final orders = await ApiService.instance.getReservations();
      if (!mounted) return;
      for (final o in orders) {
        if (o.prescriptionId == widget.prescriptionId &&
            o.status != ReservationStatus.cancelled) {
          context.pushReplacement('/suivi/${o.id}');
          return;
        }
      }
    } catch (_) {
      // Vérification seulement : l'étape 2 reste utilisable hors-ligne partiel.
    }
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _error = null;
        if (_quotes == null) _loading = true;
      });
    }
    try {
      final quotes = await ApiService.instance.quoteReservations(
        prescriptionId: widget.prescriptionId,
        lat: widget.lat,
        lng: widget.lng,
        address: widget.address,
        neighborhoodId: widget.neighborhoodId,
        fulfillmentMethod: widget.fulfillment,
      );
      if (!mounted) return;
      setState(() {
        _quotes = quotes;
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
        _error = L10n.t(context, 'delivery.error');
        _loading = false;
      });
    }
  }

  Future<void> _choose(String pharmacyId, String name) async {
    if (_creatingId != null) return;
    setState(() => _creatingId = pharmacyId);
    try {
      final routing = await ApiService.instance.createReservation(
        prescriptionId: widget.prescriptionId,
        pharmacyId: pharmacyId,
        lat: widget.lat,
        lng: widget.lng,
        address: widget.address,
        neighborhoodId: widget.neighborhoodId,
        fulfillmentMethod: widget.fulfillment,
      );
      if (!mounted) return;
      setState(() => _creatingId = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(L10n.tArgs(context, 'otc.orderSent', {'name': routing.pharmacyName})),
        ),
      );
      context.pushReplacement('/suivi/${routing.reservationId}');
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _creatingId = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Colors.red.shade700),
      );
      // Le stock a pu changer : on recalcule les disponibilités.
      await _load();
    } catch (_) {
      if (!mounted) return;
      setState(() => _creatingId = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(L10n.t(context, 'delivery.error')),
          backgroundColor: Colors.red.shade700,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    final quotes = _quotes;
    return Scaffold(
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
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
                    Expanded(
                      child: Text(
                        L10n.t(context, 'pharmacy.title'),
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  L10n.t(context, 'pharmacy.hint'),
                  style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: _loading
                      ? const Center(child: CircularProgressIndicator())
                      : _error != null
                          ? _QuotesError(
                              message: _error!,
                              onRetry: _load,
                              onBack: () => context.pop(),
                            )
                          : (quotes == null || quotes.isEmpty)
                              ? _QuotesError(
                                  message: L10n.t(context, 'pharmacy.empty'),
                                  onRetry: _load,
                                  onBack: () => context.pop(),
                                )
                              : RefreshIndicator(
                                  onRefresh: _load,
                                  child: ListView.separated(
                                    physics: const AlwaysScrollableScrollPhysics(),
                                    itemCount: quotes.length,
                                    separatorBuilder: (_, __) => const SizedBox(height: 14),
                                    itemBuilder: (context, i) {
                                      final q = quotes[i];
                                      final id = q['pharmacyId'] as String;
                                      return _QuoteCard(
                                        quote: q,
                                        choosing: _creatingId == id,
                                        busy: _creatingId != null,
                                        onChoose: () => _choose(
                                          id,
                                          (q['name'] as String?) ?? '',
                                        ),
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

class _QuotesError extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  final VoidCallback onBack;

  const _QuotesError({
    required this.message,
    required this.onRetry,
    required this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 60),
        Icon(Icons.storefront, size: 48, color: AppColors.textMuted),
        const SizedBox(height: 16),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textMuted),
          ),
        ),
        const SizedBox(height: 16),
        Center(
          child: TextButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: Text(L10n.t(context, 'delivery.retryGeo')),
          ),
        ),
        Center(
          child: TextButton(
            onPressed: onBack,
            child: Text(L10n.t(context, 'pharmacy.retry')),
          ),
        ),
      ],
    );
  }
}

class _QuoteCard extends StatelessWidget {
  final Map<String, dynamic> quote;
  final bool choosing;
  final bool busy;
  final VoidCallback onChoose;

  const _QuoteCard({
    required this.quote,
    required this.choosing,
    required this.busy,
    required this.onChoose,
  });

  @override
  Widget build(BuildContext context) {
    final full = (quote['isFull'] as bool?) ?? false;
    final matched = (quote['matchedCount'] as num?)?.toInt() ?? 0;
    final missing = (quote['missingCount'] as num?)?.toInt() ?? 0;
    final missingItems =
        ((quote['missingItems'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final accent = full ? AppColors.success : AppColors.warning;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: AppTheme.glassCard.copyWith(
        border: Border.all(
          color: full ? accent.withAlpha(120) : AppColors.border,
          width: full ? 1.2 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      (quote['name'] as String?) ?? '',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${_km(quote['distanceKm'])} km'
                      '${((quote['address'] as String?)?.isNotEmpty == true) ? ' · ${quote['address']}' : ''}',
                      style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: accent.withAlpha(30),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  full
                      ? L10n.t(context, 'pharmacy.full')
                      : '$matched/${matched + missing}',
                  style: TextStyle(
                    fontSize: 11,
                    color: accent,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _TotalRow(
            label: L10n.t(context, 'pharmacy.items'),
            value: _amount(quote['itemsTotal']),
          ),
          _TotalRow(
            label: L10n.t(context, 'pharmacy.delivery'),
            value: _amount(quote['deliveryFee']),
          ),
          _TotalRow(
            label: L10n.t(context, 'pharmacy.total'),
            value: _amount(quote['totalAmount']),
            bold: true,
          ),
          if (missingItems.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              L10n.t(context, 'pharmacy.missing'),
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 4),
            for (final m in missingItems)
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Text.rich(
                  TextSpan(
                    style: const TextStyle(fontSize: 12),
                    children: [
                      TextSpan(text: '• ${(m['name'] as String?) ?? ''}'),
                      ..._alternativesSpan(context, m),
                    ],
                  ),
                ),
              ),
          ],
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton.icon(
              onPressed: busy ? null : onChoose,
              icon: choosing
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.check, size: 18, color: Colors.white),
              label: Text(L10n.t(context, 'pharmacy.choose')),
            ),
          ),
        ],
      ),
    );
  }

  static List<InlineSpan> _alternativesSpan(
    BuildContext context,
    Map<String, dynamic> missing,
  ) {
    final alts = ((missing['alternatives'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .take(3)
        .toList();
    if (alts.isEmpty) return const [];
    final text = alts
        .map((a) =>
            '${a['name']} (${_amount(a['price'])} · ${_km(a['distanceKm'])} km)')
        .join(', ');
    return [
      TextSpan(
        text: ' — ${L10n.t(context, 'pharmacy.availableAt')} $text',
        style: TextStyle(color: AppColors.textSecondary),
      ),
    ];
  }

  static String _amount(dynamic v) {
    final n = (v as num?) ?? 0;
    final rounded = n.round();
    final s = rounded.toString();
    final grouped = s.replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+$)'),
      (m) => '${m[1]} ',
    );
    return '$grouped FCFA';
  }

  static String _km(dynamic v) {
    final n = (v as num?) ?? 0;
    return (n % 1 == 0) ? n.toInt().toString() : n.toStringAsFixed(1);
  }
}

class _TotalRow extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;

  const _TotalRow({required this.label, required this.value, this.bold = false});

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontSize: 13,
      fontWeight: bold ? FontWeight.w700 : FontWeight.normal,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
          Text(value, style: style),
        ],
      ),
    );
  }
}
