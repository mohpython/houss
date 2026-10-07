import 'dart:io';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/theme/app_theme.dart';

class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final _picker = ImagePicker();

  File? _photo;
  ScanResult? _result;
  bool _uploading = false;
  bool _sending = false;
  /// Vrai quand l'ordonnance affichee a ete transmise a l'equipe : le bouton
  /// de suite disparait, car commander sans relecture serait un contournement
  /// de la verification.
  bool _reviewSent = false;

  Future<void> _pick(ImageSource source) async {
    if (_uploading || _sending) return;
    XFile? picked;
    try {
      picked = await _picker.pickImage(
        source: source,
        imageQuality: 85,
        maxWidth: 2000,
      );
    } catch (_) {
      _showError(source == ImageSource.camera
          ? L10n.c('scan.cameraDenied')
          : L10n.c('scan.galleryDenied'));
      return;
    }
    if (picked == null) return;

    final file = File(picked.path);
    if (!mounted) return;
    setState(() {
      _photo = file;
      _result = null;
      _uploading = true;
      _reviewSent = false;
    });

    try {
      final result = await ApiService.instance.uploadPrescription(file);
      if (!mounted) return;
      setState(() {
        _result = result;
        _uploading = false;
      });

      // Lecture OK : on passe à l'étape 1 (lieu + domicile/retrait sur le
      // même écran), puis l'étape 2 listera les pharmacies classées.
      //
      // Lecture bloquee (needsReview) : on ne connait pas les medicaments, donc
      // on transmet l'ordonnance a l'equipe au lieu de rester sans rien faire.
      // Le patient est notifie des que l'equipe tranche, et le message
      // « Ordonnance validee » l'envoie vers le choix du lieu de livraison.
      // Sans medicament identifie, il n'y a rien a commander : on laisse le
      // patient reprendre une photo.
      if (result.error == null && result.prescription.medicines.isNotEmpty) {
        if (result.needsReview) {
          await _flagForReview(result);
        } else if (mounted) {
          context.push('/localisation/${result.prescription.id}');
        }
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _uploading = false);
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _uploading = false);
      _showError(L10n.c('scan.uploadFailed'));
    }
  }

  void _reset() {
    setState(() {
      _photo = null;
      _result = null;
      _reviewSent = false;
    });
  }

  /// Étape 1 : lieu de livraison + domicile/retrait pour l'ordonnance lue.
  void _goToLocation() {
    final result = _result;
    if (result == null) return;
    context.push('/localisation/${result.prescription.id}');
  }

  /// Transmet a l'equipe une ordonnance que l'IA n'a pas pu lire. Le patient
  /// n'a rien d'autre a faire : la notification « Ordonnance validee » le
  /// renverra vers le choix du lieu de livraison des que l'equipe tranche.
  Future<void> _flagForReview(ScanResult result) async {
    setState(() => _sending = true);
    try {
      await ApiService.instance.flagPrescriptionReview(
        prescriptionId: result.prescription.id,
        reasons: result.reasons.isNotEmpty ? result.reasons : [L10n.c('scan.aiUnreadable')],
      );
      if (!mounted) return;
      setState(() {
        _sending = false;
        _reviewSent = true;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _sending = false);
      _showError(L10n.c('scan.reviewFailed'));
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red.shade700),
    );
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    return Scaffold(
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: _photo == null ? _buildIntro() : _buildResult(),
          ),
        ),
      ),
    );
  }

  Widget _buildIntro() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Spacer(),
        Container(
          height: 180,
          width: 180,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              colors: [AppColors.primary, AppColors.accent],
            ),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withAlpha(60),
                blurRadius: 40,
                spreadRadius: 10,
              ),
            ],
          ),
          child: const Icon(Icons.camera_alt, size: 72, color: Colors.white),
        ),
        const SizedBox(height: 40),
        Text(
          L10n.t(context, 'scan.title'),
          style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 12),
        Text(
          L10n.t(context, 'scan.subtitle'),
          style: TextStyle(fontSize: 15, color: AppColors.textSecondary),
          textAlign: TextAlign.center,
        ),
        const Spacer(),
        Container(
          width: double.infinity,
          height: 56,
          decoration: AppTheme.gradientButton,
          child: ElevatedButton.icon(
            onPressed: () => _pick(ImageSource.camera),
            icon: const Icon(Icons.camera_alt, color: Colors.white),
            label: Text(L10n.t(context, 'scan.takePhoto')),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.transparent,
              shadowColor: Colors.transparent,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
            ),
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          height: 56,
          child: OutlinedButton.icon(
            onPressed: () => _pick(ImageSource.gallery),
            icon: const Icon(Icons.photo_library),
            label: Text(L10n.t(context, 'scan.fromGallery')),
          ),
        ),
      ],
    );
  }

  Widget _buildResult() {
    final result = _result;
    final medicines = result?.prescription.medicines ?? const <String>[];

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  L10n.t(context, 'scan.yourRx'),
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                ),
              ),
              if (!_uploading && !_sending)
                TextButton.icon(
                  onPressed: _reset,
                  icon: const Icon(Icons.refresh, size: 18),
                  label: Text(L10n.t(context, 'scan.retake')),
                ),
            ],
          ),
          const SizedBox(height: 16),
          ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: Image.file(
              _photo!,
              height: 220,
              width: double.infinity,
              fit: BoxFit.cover,
            ),
          ),
          const SizedBox(height: 20),
          if (_uploading)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: AppTheme.glassCard,
              child: Column(
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text(
                    L10n.t(context, 'scan.reading'),
                    style: TextStyle(color: AppColors.textSecondary),
                  ),
                ],
              ),
            )
          else if (result != null) ...[
            if (result.error != null)
              _Notice(
                icon: Icons.error_outline,
                color: Colors.redAccent,
                title: L10n.c('scan.readFailed'),
                message: result.error!,
              )
            else if (medicines.isEmpty)
              _Notice(
                icon: Icons.help_outline,
                color: AppColors.warning,
                title: L10n.c('scan.noMedicine'),
                message: L10n.c('scan.noMedicineHint'),
              )
            else
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: AppTheme.glassCard,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.auto_awesome, size: 18, color: AppColors.accent),
                        const SizedBox(width: 8),
                        Text(
                          L10n.t(context, 'scan.medicinesFound'),
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                        ),
                        const Spacer(),
                        if (result.prescription.aiConfidence != null)
                          Text(
                            '${result.prescription.aiConfidence}%',
                            style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                          ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    ...medicines.map(
                      (m) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Padding(
                              padding: EdgeInsets.only(top: 3),
                              child: Icon(Icons.check_circle,
                                  size: 16, color: AppColors.success),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                m,
                                style: TextStyle(
                                  fontSize: 14,
                                  color: AppColors.textSecondary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            if (result.needsReview && result.reasons.isNotEmpty) ...[
              const SizedBox(height: 12),
              _Notice(
                icon: Icons.verified_user_outlined,
                color: AppColors.warning,
                title: L10n.c('scan.pharmacistReview'),
                message: result.reasons.join('\n'),
              ),
            ],
            if (_reviewSent) ...[
              const SizedBox(height: 12),
              // Pas de `const` : la couleur vient d'un accesseur qui depend du
              // theme, il n'est donc pas connu a la compilation.
              _Notice(
                icon: Icons.mark_email_read_outlined,
                color: AppColors.primaryDeep,
                title: L10n.c('scan.transmitted'),
                message: L10n.c('scan.transmittedMsg'),
              ),
            ],
            const SizedBox(height: 24),
            // Tant que l'equipe n'a pas relu l'ordonnance, on ne propose pas
            // de continuer : commander sans relecture contournerait la
            // verification, avec des medicaments incertains.
            if (!_reviewSent)
              Container(
                width: double.infinity,
                height: 56,
                decoration: AppTheme.gradientButton,
                child: ElevatedButton.icon(
                  onPressed: _sending ? null : _goToLocation,
                  icon: _sending
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.arrow_forward, color: Colors.white),
                  label: Text(L10n.t(context, 'scan.chooseDelivery')),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.transparent,
                    shadowColor: Colors.transparent,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
                  ),
                ),
              ),
            if (!_reviewSent) const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: OutlinedButton.icon(
                onPressed: _sending ? null : () => _pick(ImageSource.camera),
                icon: const Icon(Icons.camera_alt, size: 18),
                label: Text(L10n.t(context, 'scan.retakePhoto')),
              ),
            ),
          ],
          const SizedBox(height: 24),
        ],
      ),
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

