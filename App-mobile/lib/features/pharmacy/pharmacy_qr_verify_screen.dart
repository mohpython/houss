import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/features/doctor_rx/doctor_rx_api.dart';
import 'package:saha_sante/features/pharmacy/pharmacy_qr_token.dart';
import 'package:saha_sante/features/spaces/space_widgets.dart';

/// Scan natif du QR d'e-ordonnance (flavor pharmacie uniquement).
class PharmacyQrVerifyScreen extends StatefulWidget {
  const PharmacyQrVerifyScreen({super.key});

  @override
  State<PharmacyQrVerifyScreen> createState() => _PharmacyQrVerifyScreenState();
}

class _PharmacyQrVerifyScreenState extends State<PharmacyQrVerifyScreen>
    with WidgetsBindingObserver {
  late final MobileScannerController _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  )..addListener(_onControllerChanged);

  bool _handling = false;
  bool _cameraDenied = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!mounted) return;
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached ||
        state == AppLifecycleState.hidden) {
      unawaited(_controller.stop());
      return;
    }
    if (state == AppLifecycleState.resumed &&
        !_handling &&
        _error == null &&
        !_cameraDenied) {
      unawaited(_controller.start());
    }
  }

  void _onControllerChanged() {
    final error = _controller.value.error;
    if (error?.errorCode != MobileScannerErrorCode.permissionDenied) return;
    if (_cameraDenied || !mounted) return;
    setState(() {
      _cameraDenied = true;
      _error = L10n.c('scan.cameraDenied');
      _handling = false;
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller.removeListener(_onControllerChanged);
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    unawaited(_handleCapture(capture));
  }

  Future<void> _handleCapture(BarcodeCapture capture) async {
    if (_handling || _cameraDenied || !mounted || capture.barcodes.isEmpty) {
      return;
    }
    final barcode = capture.barcodes.first;
    final raw = barcode.displayValue ?? barcode.rawValue;
    if (raw == null || raw.trim().isEmpty) return;

    // Les detections en rafale sont ignorees le temps du traitement.
    setState(() => _handling = true);
    await _controller.stop();

    final token = extractSahaQrToken(raw);
    if (token == null) {
      if (!mounted) return;
      setState(() {
        _error = L10n.c('erx.qrInvalid');
        _handling = false;
      });
      return;
    }

    try {
      final data = await DoctorRxApi.verify(token);
      if (!mounted) return;
      // Le resultat est transmis a l'ecran de verification : une seule requete.
      await context.push<void>(
        '/doctor-rx/verify',
        extra: {'token': token, 'auto': true, 'result': data},
      );
      if (mounted) await _restart();
    } on ApiException catch (e) {
      if (!mounted) return;
      showSnack(context, e.message, error: true);
      setState(() {
        _error = e.message;
        _handling = false;
      });
    } catch (_) {
      if (!mounted) return;
      final message = L10n.c('api.unexpected');
      showSnack(context, message, error: true);
      setState(() {
        _error = message;
        _handling = false;
      });
    }
  }

  Future<void> _restart() async {
    if (_cameraDenied || !mounted) return;
    setState(() {
      _error = null;
      _handling = false;
    });
    await _controller.stop();
    if (mounted) await _controller.start();
  }

  Future<void> _openManual() async {
    await context.push<void>('/doctor-rx/verify');
    if (mounted) await _restart();
  }

  Widget _scannerErrorView(BuildContext context, MobileScannerException error) {
    final denied = error.errorCode == MobileScannerErrorCode.permissionDenied;
    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                denied ? Icons.no_photography_outlined : Icons.error_outline,
                color: Colors.white70,
                size: 44,
              ),
              const SizedBox(height: 12),
              Text(
                denied ? L10n.c('scan.cameraDenied') : L10n.c('api.unexpected'),
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 14),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final size = constraints.biggest;
              final side =
                  (size.width < size.height ? size.width : size.height) * 0.72;
              final scanWindow = Rect.fromCenter(
                center: size.center(Offset.zero),
                width: side,
                height: side,
              );
              return MobileScanner(
                controller: _controller,
                scanWindow: scanWindow,
                scanWindowUpdateThreshold: 4,
                onDetect: _onDetect,
                errorBuilder: _scannerErrorView,
                overlayBuilder: (_, __) => ScanWindowOverlay(
                  controller: _controller,
                  scanWindow: scanWindow,
                  borderRadius: BorderRadius.circular(18),
                  borderWidth: 3,
                  color: const Color(0x99000000),
                ),
              );
            },
          ),
          SafeArea(
            child: Column(
              children: [
                Row(
                  children: [
                    IconButton(
                      onPressed: () => context.pop(),
                      icon: const Icon(Icons.arrow_back, color: Colors.white),
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        L10n.c('erx.scanQr'),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
                const Spacer(),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: _errorBanner(_error!),
                  ),
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                  child: SpaceCard(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Icons.qr_code_scanner,
                              size: 18,
                              color: AppColors.accentLight,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                L10n.c('erx.scanQrHint'),
                                style: TextStyle(
                                  fontSize: 12.5,
                                  color: AppColors.textSecondary,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            actionButton(
                              L10n.c('erx.manualEntry'),
                              _openManual,
                              icon: Icons.edit_outlined,
                            ),
                            if (!_cameraDenied)
                              actionButton(
                                L10n.c('erx.scanAnother'),
                                _restart,
                                color: AppColors.accent,
                                icon: Icons.qr_code_2,
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
        ],
      ),
    );
  }

  Widget _errorBanner(String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.red.shade900.withAlpha(210),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: Colors.white, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: Colors.white, fontSize: 12.5),
            ),
          ),
        ],
      ),
    );
  }
}
