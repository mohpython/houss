import 'dart:async';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/services/voice_service.dart';
import '../../core/l10n/app_locale.dart';
import '../../core/services/api_service.dart';
import '../../core/theme/app_colors.dart';

/// Écran de paiement Orange Money intégré à l'application.
///
/// La page Orange s'ouvre dans une WebView (et non dans le navigateur du
/// téléphone) : l'application garde ainsi la main pendant tout le paiement.
/// Elle surveille la transaction ; dès que le paiement est confirmé, la page
/// se referme toute seule et l'application revient sur le suivi de la
/// commande. Si le patient annule, l'écran se referme également.
class OrangePaymentScreen extends StatefulWidget {
  const OrangePaymentScreen({
    super.key,
    required this.reservationId,
    required this.paymentUrl,
  });

  final String reservationId;
  final String paymentUrl;

  @override
  State<OrangePaymentScreen> createState() => _OrangePaymentScreenState();
}

class _OrangePaymentScreenState extends State<OrangePaymentScreen> {
  late final WebViewController _controller;
  Timer? _poll;
  /// Vrai tant que la transaction n'est pas confirmée (pastille d'attente).
  final bool _checking = true;
  bool _closing = false;

  @override
  void initState() {
    super.initState();
    // Voix : explique au patient ce qu'il doit faire.
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => VoiceService.instance.speak(L10n.c('trk.payOnlineHint')),
    );
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            // Orange renvoie le patient vers l'URL de retour du marchand :
            // on ne charge pas cette page web dans la WebView, on referme et
            // on laisse l'application vérifier le paiement.
            if (request.url.contains('/app/payments/orange/return')) {
              _finish();
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
          onWebResourceError: (_) {},
        ),
      )
      ..loadRequest(Uri.parse(widget.paymentUrl));

    _poll = Timer.periodic(const Duration(seconds: 3), (_) => _checkStatus());
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  /// Interroge le serveur : le statut réel du paiement vient d'Orange.
  Future<void> _checkStatus() async {
    if (_closing || !mounted) return;
    try {
      final data = await ApiService.instance.getReservation(widget.reservationId);
      final status = data['reservation'] is Map
          ? ((data['reservation'] as Map)['payment_status'] as String?)
          : data['payment_status'] as String?;
      if (status == 'paid') {
        _finish(paid: true);
      } else if (status == 'failed') {
        _finish(paid: false);
      }
    } catch (_) {
      // Erreur réseau passagère : on continue de scruter.
    }
  }

  void _finish({bool? paid}) {
    if (_closing) return;
    _closing = true;
    _poll?.cancel();
    if (mounted) Navigator.of(context).pop(paid);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        title: Text(
          L10n.c('trk.payOnline'),
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => _finish(),
          tooltip: L10n.c('trk.payClose'),
        ),
      ),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            color: AppColors.surface,
            child: Row(
              children: [
                if (_checking)
                  const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  Icon(Icons.info_outline, size: 16, color: AppColors.textMuted),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    L10n.c('trk.payAutoClose'),
                    style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: WebViewWidget(controller: _controller),
          ),
        ],
      ),
    );
  }
}
