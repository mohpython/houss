import 'package:flutter/material.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/features/doctor_rx/doctor_rx_api.dart';
import 'package:saha_sante/features/spaces/space_widgets.dart';

/// Vérification locale d'une ordonnance à partir du code lisible dans le QR.
class DoctorRxVerifyScreen extends StatefulWidget {
  const DoctorRxVerifyScreen({
    super.key,
    this.initialToken,
    this.autoVerify = false,
    this.initialResult,
  });

  /// Code issues du QR, affiché dans le champ (toujours modifiable).
  final String? initialToken;

  /// Lance la vérification une fois au premier rendu.
  final bool autoVerify;

  /// Résultat déjà obtenu par le scanner pharmacie : évite un second appel.
  final Map<String, dynamic>? initialResult;

  @override
  State<DoctorRxVerifyScreen> createState() => _DoctorRxVerifyScreenState();
}

class _DoctorRxVerifyScreenState extends State<DoctorRxVerifyScreen> {
  final _controller = TextEditingController();
  bool _busy = false;
  Map<String, dynamic>? _result;
  String? _error;

  @override
  void initState() {
    super.initState();
    final token = widget.initialToken?.trim();
    if (token != null && token.isNotEmpty) {
      _controller.text = token;
    }
    if (widget.initialResult != null) {
      _result = Map<String, dynamic>.from(widget.initialResult!);
    }
    // Le scan pharmacie a déjà vérifié le jeton : on affiche seulement sa carte.
    if (widget.autoVerify && _result == null && _controller.text.trim().isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _verify();
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (_busy) return;
    final token = _controller.text.trim();
    if (token.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
      _result = null;
    });
    try {
      final data = await DoctorRxApi.verify(token);
      if (!mounted) return;
      setState(() {
        _result = data;
        _busy = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    final result = _result;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                spaceHeader(
                  L10n.t(context, 'erx.verifyRx'),
                  subtitle: L10n.c('erx.verifyCode'),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _controller,
                  onSubmitted: (_) => _verify(),
                  decoration: InputDecoration(
                    labelText: L10n.c('erx.verifyCode'),
                    prefixIcon: const Icon(Icons.qr_code_2),
                  ),
                ),
                const SizedBox(height: 12),
                actionButton(
                  L10n.c('erx.verifyAction'),
                  _busy ? null : _verify,
                  icon: Icons.verified_outlined,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 14),
                  Text(_error!, style: TextStyle(color: Colors.red.shade400)),
                ],
                if (result != null) ...[
                  const SizedBox(height: 18),
                  _resultCard(result),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _resultCard(Map<String, dynamic> result) {
    final found = result['found'] == true;
    final valid = result['valid'] == true;
    final revoked = result['revoked'] == true;
    final color = !found || !valid ? Colors.red.shade400 : AppColors.success;
    final title = !found
        ? L10n.c('erx.notFoundRx')
        : revoked
            ? L10n.c('erx.revokedRx')
            : valid
                ? L10n.c('erx.validRx')
                : L10n.c('erx.invalidRx');
    final rx = result['rx'] is Map
        ? Map<String, dynamic>.from(result['rx'] as Map)
        : <String, dynamic>{};
    return SpaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                found && valid ? Icons.verified : Icons.gpp_bad_outlined,
                color: color,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: color),
                ),
              ),
            ],
          ),
          if (!found || rx.isEmpty) ...[
            const SizedBox(height: 8),
            Text(
              '${result['reason'] ?? ''}',
              style: TextStyle(fontSize: 12.5, color: AppColors.textSecondary),
            ),
          ] else ...[
            const SizedBox(height: 12),
            _line(L10n.c('erx.newRx'), '${rx['number'] ?? ''}'),
            _line(L10n.c('erx.patient'), '${rx['patientName'] ?? ''}'),
            _line(L10n.c('erx.medicine'), '${rx['doctorName'] ?? ''}'),
            _line(L10n.c('erx.consultDate'), '${rx['consultationDate'] ?? ''}'),
            _line(L10n.c('erx.signatureLabel'), '${rx['signatureHash'] ?? ''}'),
            if (result['reason'] != null) ...[
              const SizedBox(height: 8),
              Text(
                '${result['reason']}',
                style: TextStyle(fontSize: 12, color: Colors.red.shade400),
              ),
            ],
          ],
        ],
      ),
    );
  }

  Widget _line(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 90,
            child: Text(
              label,
              style: TextStyle(fontSize: 11.5, color: AppColors.textSecondary),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
