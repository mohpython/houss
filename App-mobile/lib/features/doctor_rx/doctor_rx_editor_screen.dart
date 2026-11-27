import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/features/doctor_rx/doctor_rx_api.dart';
import 'package:saha_sante/features/spaces/space_widgets.dart';

class _RxItem {
  final medicine = TextEditingController();
  final dosage = TextEditingController();
  final form = TextEditingController();
  final quantity = TextEditingController();
  final posology = TextEditingController();
  final frequency = TextEditingController();
  final duration = TextEditingController();
  final route = TextEditingController();
  final instructions = TextEditingController();

  Map<String, dynamic> toJson() => {
        'medicineName': medicine.text.trim(),
        'dosage': dosage.text.trim(),
        'form': form.text.trim(),
        'quantity': quantity.text.trim(),
        'posology': posology.text.trim(),
        'frequency': frequency.text.trim(),
        'duration': duration.text.trim(),
        'route': route.text.trim(),
        'instructions': instructions.text.trim(),
      };

  void apply(Map<String, dynamic> json) {
    medicine.text = '${json['medicine_name'] ?? ''}';
    dosage.text = '${json['dosage'] ?? ''}';
    form.text = '${json['form'] ?? ''}';
    quantity.text = '${json['quantity'] ?? ''}';
    posology.text = '${json['posology'] ?? ''}';
    frequency.text = '${json['frequency'] ?? ''}';
    duration.text = '${json['duration'] ?? ''}';
    route.text = '${json['route'] ?? ''}';
    instructions.text = '${json['instructions'] ?? ''}';
  }

  void dispose() {
    for (final c in [
      medicine,
      dosage,
      form,
      quantity,
      posology,
      frequency,
      duration,
      route,
      instructions,
    ]) {
      c.dispose();
    }
  }
}

/// Éditeur natif : rédaction, signature par mot de passe, envoi, PDF et QR.
class DoctorRxEditorScreen extends StatefulWidget {
  const DoctorRxEditorScreen({super.key});

  @override
  State<DoctorRxEditorScreen> createState() => _DoctorRxEditorScreenState();
}

class _DoctorRxEditorScreenState extends State<DoctorRxEditorScreen> {
  final _diagnosis = TextEditingController();
  final _reason = TextEditingController();
  final _observations = TextEditingController();
  final _advice = TextEditingController();
  late final TextEditingController _dateController;
  final List<_RxItem> _items = [_RxItem()];

  String _patientId = '';
  String? _rxId;
  String _status = '';
  String _number = '';
  bool _identity = false;
  bool _loading = true;
  bool _busy = false;
  String? _error;
  Map<String, dynamic> _patient = const {};
  String _date = DateTime.now().toString().slice(10);

  @override
  void initState() {
    super.initState();
    _dateController = TextEditingController(text: _date);
    _load();
  }

  @override
  void dispose() {
    _dateController.dispose();
    _diagnosis.dispose();
    _reason.dispose();
    _observations.dispose();
    _advice.dispose();
    for (final item in _items) {
      item.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final extra = GoRouterState.of(context).extra;
      final map = extra is Map ? Map<String, dynamic>.from(extra) : <String, dynamic>{};
      _patientId = '${map['patientId'] ?? ''}';
      _rxId = map['rxId'] as String?;
      if (_rxId != null) {
        final rx = await DoctorRxApi.getPrescription(_rxId!);
        if (!mounted) return;
        _applyRx(rx);
      } else if (map['patient'] is Map) {
        _patient = Map<String, dynamic>.from(map['patient'] as Map);
      } else {
        final p = await DoctorRxApi.getPatient(_patientId);
        if (!mounted) return;
        _patient = p;
      }
      if (!mounted) return;
      setState(() => _loading = false);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _applyRx(Map<String, dynamic> rx) {
    _status = '${rx['status'] ?? 'draft'}';
    _number = '${rx['number'] ?? ''}';
    _date = '${rx['consultation_date'] ?? _date}'.slice(10);
    _dateController.text = _date;
    _diagnosis.text = '${rx['diagnosis'] ?? ''}';
    _reason.text = '${rx['reason'] ?? ''}';
    _observations.text = '${rx['observations'] ?? ''}';
    _advice.text = '${rx['advice'] ?? ''}';
    _identity = rx['identity_verified'] == true;
    _patient = {
      'id': rx['patient_id'],
      'fullName': rx['patient_name'],
      'email': rx['patient_email'],
      'phone': rx['patient_phone'],
      'sahaCode': rx['sahaCode'],
    };
    final items = ((rx['items'] as List?) ?? const []).cast<Map<String, dynamic>>();
    if (items.isNotEmpty) {
      for (final item in _items) {
        item.dispose();
      }
      _items.clear();
      for (final item in items) {
        final form = _RxItem()..apply(item);
        _items.add(form);
      }
    }
  }

  bool get _locked => _rxId != null && _status != 'draft';

  Future<void> _act(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } catch (e) {
      if (mounted) showSnack(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Map<String, dynamic> get _payload => {
        if (_rxId != null) 'id': _rxId,
        'patientId': _patientId,
        'consultationDate': _date,
        'diagnosis': _diagnosis.text.trim(),
        'reason': _reason.text.trim(),
        'observations': _observations.text.trim(),
        'advice': _advice.text.trim(),
        'identityVerified': _identity,
        'items': _items.map((i) => i.toJson()).toList(),
      };

  Future<void> _save() async {
    await _act(() async {
      final saved = await DoctorRxApi.save(_payload);
      if (!mounted) return;
      setState(() {
        _rxId = saved['id'] as String? ?? _rxId;
        _number = '${saved['number'] ?? _number}';
        _status = 'draft';
      });
      showSnack(context, L10n.c('erx.saveDraft'));
    });
  }

  Future<void> _sign() async {
    final controller = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(L10n.c('erx.sign')),
        content: TextField(
          controller: controller,
          obscureText: true,
          autofocus: true,
          decoration: InputDecoration(
            labelText: L10n.c('erx.passwordSign'),
            prefixIcon: const Icon(Icons.lock_outline),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(L10n.c('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(L10n.c('erx.sign')),
          ),
        ],
      ),
    );
    final password = controller.text;
    controller.dispose();
    if (ok != true || password.isEmpty || !mounted) return;
    await _act(() async {
      if (_rxId == null) {
        final saved = await DoctorRxApi.save(_payload);
        _rxId = saved['id'] as String?;
      }
      await DoctorRxApi.sign(_rxId!, password);
      if (!mounted) return;
      setState(() => _status = 'signed');
      showSnack(context, L10n.c('erx.signedOk'));
    });
  }

  Future<void> _send() async {
    await _act(() async {
      await DoctorRxApi.send(_rxId!);
      if (!mounted) return;
      setState(() => _status = 'sent');
      showSnack(context, L10n.c('erx.sentOk'));
    });
  }

  Future<void> _sharePdf() async {
    await _act(() async {
      final data = await DoctorRxApi.pdf(_rxId!);
      final dir = await getTemporaryDirectory();
      final filename = '${data['filename'] ?? 'ordonnance.pdf'}';
      final file = File('${dir.path}/$filename');
      await file.writeAsBytes(base64Decode('${data['base64'] ?? ''}'));
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/pdf')],
        subject: _number.isNotEmpty ? _number : L10n.c('erx.title'),
      );
    });
  }

  Future<void> _showQr() async {
    await _act(() async {
      final data = await DoctorRxApi.qr(_rxId!);
      if (!mounted) return;
      final bytes = base64Decode('${data['base64'] ?? ''}');
      showDialog(
        context: context,
        builder: (dialogContext) => AlertDialog(
          backgroundColor: AppColors.surface,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Text(L10n.c('erx.qr')),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  color: Colors.white,
                  padding: const EdgeInsets.all(10),
                  child: Image.memory(bytes, width: 220, height: 220),
                ),
                const SizedBox(height: 12),
                Text(
                  L10n.c('erx.qrHint'),
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
                const SizedBox(height: 10),
                SelectableText(
                  '${data['token'] ?? ''}',
                  style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: Text(L10n.c('common.close')),
            ),
          ],
        ),
      );
    });
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final initial = DateTime.tryParse(_date) ?? now;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year - 2),
      lastDate: now,
    );
    if (picked == null || !mounted) return;
    setState(() {
      _date =
          '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      _dateController.text = _date;
    });
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    final name = '${_patient['fullName'] ?? L10n.c('erx.patient')}';
    final details = [
      _patient['sahaCode'],
      _patient['email'],
      _patient['phone'],
    ].where((x) => x != null && '$x'.isNotEmpty).join(' • ');

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(_number.isNotEmpty ? _number : L10n.c('erx.newRx')),
        actions: [
          if (_rxId != null)
            IconButton(
              icon: const Icon(Icons.qr_code_2),
              tooltip: L10n.c('erx.qr'),
              onPressed: _showQr,
            ),
        ],
      ),
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? errorView(_error!, _load)
                  : SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SpaceCard(
                            child: Row(
                              children: [
                                Icon(Icons.person_outline, color: AppColors.primaryLight),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        name,
                                        style: const TextStyle(
                                          fontSize: 15,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      const SizedBox(height: 3),
                                      Text(
                                        details,
                                        style: TextStyle(
                                          fontSize: 11.5,
                                          color: AppColors.textSecondary,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (_status.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 10),
                              child: statusChip(
                                _status == 'sent'
                                    ? L10n.c('erx.statusSent')
                                    : _status == 'signed'
                                        ? L10n.c('erx.statusSigned')
                                        : L10n.c('erx.statusDraft'),
                                _status == 'sent' ? AppColors.success : AppColors.primaryLight,
                              ),
                            ),
                          const SizedBox(height: 16),
                          _field(
                            L10n.c('erx.consultDate'),
                            _dateController,
                            readOnly: true,
                            onTap: _locked ? null : _pickDate,
                            suffix: const Icon(Icons.calendar_today_outlined, size: 18),
                          ),
                          const SizedBox(height: 12),
                          _field(L10n.c('erx.diagnosis'), _diagnosis, readOnly: _locked),
                          const SizedBox(height: 12),
                          _field(
                            L10n.c('erx.reason'),
                            _reason,
                            readOnly: _locked,
                            maxLines: 2,
                          ),
                          const SizedBox(height: 16),
                          sectionTitle(L10n.c('erx.medicine')),
                          const SizedBox(height: 10),
                          ...List.generate(_items.length, (index) {
                            return _itemCard(_items[index], index);
                          }),
                          if (!_locked)
                            TextButton.icon(
                              onPressed: () => setState(() => _items.add(_RxItem())),
                              icon: const Icon(Icons.add),
                              label: Text(L10n.c('erx.addMedicine')),
                            ),
                          const SizedBox(height: 12),
                          _field(
                            L10n.c('erx.observations'),
                            _observations,
                            readOnly: _locked,
                            maxLines: 3,
                          ),
                          const SizedBox(height: 12),
                          _field(L10n.c('erx.advice'), _advice, readOnly: _locked, maxLines: 3),
                          const SizedBox(height: 14),
                          SwitchListTile.adaptive(
                            value: _identity,
                            onChanged: _locked
                                ? null
                                : (v) => setState(() => _identity = v),
                            title: Text(
                              L10n.c('erx.identity'),
                              style: const TextStyle(fontSize: 12.5),
                            ),
                          ),
                          const SizedBox(height: 12),
                          if (!_locked) ...[
                            Row(
                              children: [
                                Expanded(
                                  child: actionButton(
                                    L10n.c('erx.saveDraft'),
                                    _busy ? null : _save,
                                    icon: Icons.save_outlined,
                                    color: AppColors.surface,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: actionButton(
                                    L10n.c('erx.sign'),
                                    _busy ? null : _sign,
                                    icon: Icons.draw_outlined,
                                  ),
                                ),
                              ],
                            ),
                            if (_status == 'signed') ...[
                              const SizedBox(height: 10),
                              actionButton(
                                L10n.c('erx.send'),
                                _busy ? null : _send,
                                icon: Icons.send_outlined,
                              ),
                            ],
                          ],
                          if (_rxId != null) ...[
                            const SizedBox(height: 10),
                            actionButton(
                              L10n.c('erx.pdf'),
                              _busy ? null : _sharePdf,
                              icon: Icons.share_outlined,
                              color: AppColors.accent,
                            ),
                          ],
                        ],
                      ),
                    ),
        ),
      ),
    );
  }

  Widget _field(
    String label,
    TextEditingController controller, {
    bool readOnly = false,
    int maxLines = 1,
    VoidCallback? onTap,
    Widget? suffix,
  }) {
    return TextField(
      controller: controller,
      readOnly: readOnly,
      onTap: onTap,
      maxLines: maxLines,
      decoration: InputDecoration(
        labelText: label,
        suffixIcon: suffix,
        filled: true,
      ),
    );
  }

  Widget _itemCard(_RxItem item, int index) {
    return SpaceCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${L10n.c('erx.medicine')} ${index + 1}',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                ),
              ),
              if (!_locked && _items.length > 1)
                IconButton(
                  icon: const Icon(Icons.delete_outline, size: 18),
                  onPressed: () {
                    item.dispose();
                    setState(() => _items.removeAt(index));
                  },
                ),
            ],
          ),
          _field(L10n.c('erx.medicine'), item.medicine, readOnly: _locked),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _field(L10n.c('erx.dosage'), item.dosage, readOnly: _locked),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _field(L10n.c('erx.form'), item.form, readOnly: _locked),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _field(L10n.c('erx.quantity'), item.quantity, readOnly: _locked),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _field(L10n.c('erx.duration'), item.duration, readOnly: _locked),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _field(L10n.c('erx.posology'), item.posology, readOnly: _locked, maxLines: 2),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _field(L10n.c('erx.frequency'), item.frequency, readOnly: _locked),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _field(L10n.c('erx.route'), item.route, readOnly: _locked),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _field(L10n.c('erx.instructions'), item.instructions, readOnly: _locked, maxLines: 2),
        ],
      ),
    );
  }
}

extension on String {
  String slice(int end) => length <= end ? this : substring(0, end);
}
