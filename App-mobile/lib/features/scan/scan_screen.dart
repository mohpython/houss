import 'dart:io';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/location_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
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
          ? 'Impossible d\'ouvrir l\'appareil photo. Vérifiez les autorisations.'
          : 'Impossible d\'ouvrir la galerie. Vérifiez les autorisations.');
      return;
    }
    if (picked == null) return;

    final file = File(picked.path);
    if (!mounted) return;
    setState(() {
      _photo = file;
      _result = null;
      _uploading = true;
    });

    try {
      final result = await ApiService.instance.uploadPrescription(file);
      if (!mounted) return;
      setState(() {
        _result = result;
        _uploading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _uploading = false);
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _uploading = false);
      _showError('Envoi de l\'ordonnance impossible. Réessayez.');
    }
  }

  Future<void> _sendToPharmacy() async {
    final result = _result;
    if (result == null || _sending) return;
    setState(() => _sending = true);
    try {
      // La position est facultative : sans GPS, le serveur choisit par défaut.
      final position = await LocationService.current();
      final routing = await ApiService.instance.routePrescription(
        prescriptionId: result.prescription.id,
        lat: position?.latitude,
        lng: position?.longitude,
      );
      if (!mounted) return;
      setState(() => _sending = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Commande envoyée à ${routing.pharmacyName}')),
      );
      context.push('/suivi/${routing.reservationId}');
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _sending = false);
      _showError('Envoi à une pharmacie impossible. Réessayez.');
    }
  }

  void _reset() {
    setState(() {
      _photo = null;
      _result = null;
    });
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red.shade700),
    );
  }

  @override
  Widget build(BuildContext context) {
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
            gradient: const LinearGradient(
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
        const Text(
          'Scanner votre ordonnance',
          style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 12),
        const Text(
          'Prenez une photo nette de l\'ordonnance. Notre IA identifiera les médicaments demandés.',
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
            label: const Text('Prendre une photo'),
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
            label: const Text('Choisir depuis la galerie'),
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
              const Expanded(
                child: Text(
                  'Votre ordonnance',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                ),
              ),
              if (!_uploading && !_sending)
                TextButton.icon(
                  onPressed: _reset,
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Reprendre'),
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
              child: const Column(
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text(
                    'Lecture de l\'ordonnance en cours…',
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
                title: 'Lecture impossible',
                message: result.error!,
              )
            else if (medicines.isEmpty)
              const _Notice(
                icon: Icons.help_outline,
                color: AppColors.warning,
                title: 'Aucun médicament identifié',
                message: 'Reprenez une photo plus nette, ou commandez sans ordonnance.',
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
                        const Icon(Icons.auto_awesome, size: 18, color: AppColors.accent),
                        const SizedBox(width: 8),
                        const Text(
                          'Médicaments identifiés',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                        ),
                        const Spacer(),
                        if (result.prescription.aiConfidence != null)
                          Text(
                            '${result.prescription.aiConfidence}%',
                            style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
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
                            const Padding(
                              padding: EdgeInsets.only(top: 3),
                              child: Icon(Icons.check_circle,
                                  size: 16, color: AppColors.success),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                m,
                                style: const TextStyle(
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
                title: 'Vérification par un pharmacien',
                message: result.reasons.join('\n'),
              ),
            ],
            const SizedBox(height: 24),
            Container(
              width: double.infinity,
              height: 56,
              decoration: AppTheme.gradientButton,
              child: ElevatedButton.icon(
                onPressed: _sending ? null : _sendToPharmacy,
                icon: _sending
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.local_pharmacy, color: Colors.white),
                label: const Text('Envoyer à une pharmacie'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: OutlinedButton.icon(
                onPressed: _sending ? null : () => _pick(ImageSource.camera),
                icon: const Icon(Icons.camera_alt, size: 18),
                label: const Text('Reprendre une photo'),
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
                  style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
