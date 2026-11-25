import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/delivery_location_store.dart';
import 'package:saha_sante/features/location/delivery_location_sheet.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/widgets/voice_button.dart';
import 'package:saha_sante/core/services/voice_service.dart';

/// Palette « SAHA 3D » de l'ecran de scan : identique a l'accueil pour que la
/// navigation reste dans le meme univers visuel (independent du theme clair /
/// sombre du reste de l'application).
class _ScanC {
  _ScanC._();

  static const bg = Color(0xFF04150F);
  static const card = Color(0xCC0A2A20);
  static const cardSolid = Color(0xFF0A2A20);
  static const border = Color(0x331F7A57);
  static const borderStrong = Color(0x661F7A57);
  static const mint = Color(0xFF34E3A4);
  static const mintSoft = Color(0xFF9AD9C2);
  static const text = Color(0xFFF4FBF7);
  static const muted = Color(0xFF8FB8A8);
  static const yellow = Color(0xFFFACC15);
  static const danger = Color(0xFFEF4444);
  static const warning = Color(0xFFF59E0B);
}

class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final _picker = ImagePicker();

  /// Lit les instructions de l'écran à voix haute dans la langue choisie.
  /// Appelé à l'ouverture de l'écran : le patient entend ce qu'il doit faire
  /// sans avoir à toucher quoi que ce soit.
  void _speakIntro() {
    VoiceService.instance.speak(
      '${L10n.c('scan.title')}. ${L10n.c('scan.subtitle')}',
    );
  }

  @override
  void initState() {
    super.initState();
    // Voix : lit l'introduction après le premier cadre.
    WidgetsBinding.instance.addPostFrameCallback((_) => _speakIntro());
    // Photo choisie avant qu'Android ne recycle l'application (galerie ouverte,
    // mémoire faible) : on la récupère au lieu de repartir de zéro.
    unawaited(_recoverLostPick());
  }

  File? _photo;
  ScanResult? _result;
  bool _uploading = false;
  bool _sending = false;

  /// Vrai pendant le traitement de la photo (rattrapage Android ou upload).
  /// Protège contre les doubles lancements pendant l'envoi IA.
  bool _handling = false;

  /// Vrai quand l'ordonnance affichee a ete transmise a l'equipe : le bouton
  /// de suite disparait, car commander sans relecture serait un contournement
  /// de la verification.
  bool _reviewSent = false;

  /// Au clic sur la caméra / galerie, le patient doit d'abord confirmer où il
  /// veut être livré (si son choix est déjà mémorisé pour cette session, on
  /// enchaîne directement pour ne pas le harceler).
  Future<void> _pick(ImageSource source) async {
    if (_uploading || _sending) return;
    if (!DeliveryLocationStore.instance.hasLocation) {
      final ok = await showDeliveryLocationSheet(context);
      if (ok != true) return; // annulé : on ne lance pas la capture
    }
    await _capture(source);
  }

  Future<void> _capture(ImageSource source) async {
    if (_uploading || _sending) return;
    XFile? picked;
    try {
      picked = await _picker.pickImage(
        source: source,
        imageQuality: 85,
        maxWidth: 2000,
      );
    } catch (_) {
      _showError(
        source == ImageSource.camera
            ? L10n.c('scan.cameraDenied')
            : L10n.c('scan.galleryDenied'),
      );
      return;
    }
    if (picked == null) return;
    await _handlePicked(picked);
  }

  /// Récupère la photo choisie quand Android a tué l'application pendant que
  /// la galerie était ouverte (mémoire faible, autre app au premier plan...).
  /// Sans cela, l'app se relançait sur l'accueil et le patient croyait qu'elle
  /// « sortait » toute seule de la partie scan.
  Future<void> _recoverLostPick() async {
    if (!Platform.isAndroid) return;
    try {
      final lost = await _picker.retrieveLostData();
      final file = lost.file;
      if (file == null || !mounted) return;
      if (!DeliveryLocationStore.instance.hasLocation) {
        final ok = await showDeliveryLocationSheet(context);
        if (ok != true || !mounted) return;
      }
      await _handlePicked(file);
    } catch (_) {
      // Rien à récupérer : on reste simplement sur l'écran de scan.
    }
  }

  /// Téléverse l'ordonnance choisie puis affiche la lecture de l'IA.
  Future<void> _handlePicked(XFile picked) async {
    if (_handling || _uploading || _sending) return;
    _handling = true;
    final file = File(picked.path);
    if (!mounted) {
      _handling = false;
      return;
    }
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
        // Ordonnance douteuse : on la transmet a l'equipe et on reste sur le
        // resultat (le patient est notifie quand elle est tranchee).
        if (result.needsReview) {
          await _flagForReview(result);
        }
        // Lecture normale : on RESTE sur l'ecran de resultat. Le patient voit
        // les medicaments lus puis appuie lui-meme sur « Choisir la
        // livraison ». Avant, l'app sautait directement a la liste des
        // pharmacies des qu'un lieu etait memorise, ce qui donnait l'impression
        // qu'elle « sortait » du scan toute seule.
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _uploading = false);
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _uploading = false);
      _showError(L10n.c('scan.uploadFailed'));
    } finally {
      _handling = false;
      if (mounted) setState(() => _uploading = false);
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
    final store = DeliveryLocationStore.instance;
    if (store.hasLocation) {
      final params = <String, String>{
        'fulfillment': store.fulfillment,
        if (store.detail.isNotEmpty) 'address': store.detail,
      };
      if (store.mode == 'gps') {
        params['mode'] = 'gps';
        params['lat'] = '${store.lat}';
        params['lng'] = '${store.lng}';
      } else {
        params['mode'] = 'neighborhood';
        params['neighborhoodId'] = store.neighborhoodId!;
      }
      context.push(
        '/pharmacies/${result.prescription.id}?${Uri(queryParameters: params).query}',
      );
    } else {
      context.push('/localisation/${result.prescription.id}');
    }
  }

  /// Transmet a l'equipe une ordonnance que l'IA n'a pas pu lire. Le patient
  /// n'a rien d'autre a faire : la notification « Ordonnance validee » le
  /// renverra vers le choix du lieu de livraison des que l'equipe tranche.
  Future<void> _flagForReview(ScanResult result) async {
    setState(() => _sending = true);
    try {
      await ApiService.instance.flagPrescriptionReview(
        prescriptionId: result.prescription.id,
        reasons: result.reasons.isNotEmpty
            ? result.reasons
            : [L10n.c('scan.aiUnreadable')],
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
      SnackBar(content: Text(message), backgroundColor: _ScanC.danger),
    );
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: _ScanC.bg,
      ),
      child: Scaffold(
        backgroundColor: _ScanC.bg,
        body: Stack(
          children: [
            const Positioned(
              top: -140,
              right: -100,
              child: _ScanGlow(size: 340, color: Color(0x4434E3A4)),
            ),
            const Positioned(
              bottom: -120,
              left: -110,
              child: _ScanGlow(size: 300, color: Color(0x2214B8A6)),
            ),
            SafeArea(
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _scanHeader(onSearch: () => context.push('/pharmacies')),
                    const SizedBox(height: 18),
                    _photo == null ? _buildIntro() : _buildResult(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// En-tete : logo + nom + sous-titre + recherche (comme la maquette).
  Widget _scanHeader({required VoidCallback onSearch}) {
    return Row(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Image.asset(
            'assets/branding/logo_mark.png',
            width: 48,
            height: 48,
            fit: BoxFit.cover,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'SAHA Santé',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: _ScanC.text,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.4,
                  height: 1.05,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                L10n.t(context, 'home.tagline'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: _ScanC.mintSoft,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        InkWell(
          onTap: onSearch,
          borderRadius: BorderRadius.circular(15),
          child: Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: _ScanC.card,
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: _ScanC.borderStrong),
            ),
            child: const Icon(
              Icons.search_rounded,
              color: _ScanC.text,
              size: 23,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildIntro() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            const Positioned(right: -14, top: 4, child: _ScanArt()),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 13,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0x1A34E3A4),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: const Color(0x5534E3A4)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Image.asset(
                        'assets/icons3d/camera.png',
                        width: 22,
                        height: 22,
                      ),
                      const SizedBox(width: 7),
                      Text(
                        L10n.t(context, 'scan.badge'),
                        style: const TextStyle(
                          color: _ScanC.mint,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 22),
                Padding(
                  padding: const EdgeInsets.only(right: 104),
                  child: _ScanTitle(),
                ),
                const SizedBox(height: 10),
                Padding(
                  padding: const EdgeInsets.only(right: 96),
                  child: Text(
                    L10n.t(context, 'scan.subtitle'),
                    style: const TextStyle(
                      color: _ScanC.mintSoft,
                      fontSize: 13,
                      height: 1.35,
                    ),
                  ),
                ),
                const SizedBox(height: 200),
              ],
            ),
          ],
        ),
        const SizedBox(height: 22),
        _ActionButton(
          label: L10n.t(context, 'scan.takePhoto'),
          icon: Icons.camera_alt_rounded,
          iconAsset: 'assets/icons3d/camera.png',
          primary: true,
          onTap: () => _pick(ImageSource.camera),
        ),
        const SizedBox(height: 12),
        _ActionButton(
          label: L10n.t(context, 'scan.fromGallery'),
          iconAsset: null,
          icon: Icons.photo_library_rounded,
          primary: false,
          onTap: () => _pick(ImageSource.gallery),
        ),
        const SizedBox(height: 20),
        _TipCard(text: L10n.t(context, 'scan.tipBody')),
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: VoiceButton(
            text:
                '${L10n.t(context, 'scan.title')}. ${L10n.t(context, 'scan.subtitle')}',
          ),
        ),
      ],
    );
  }

  Widget _buildResult() {
    final result = _result;
    final medicines = result?.prescription.medicines ?? const <String>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                L10n.t(context, 'scan.yourRx'),
                style: const TextStyle(
                  color: _ScanC.text,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            if (!_uploading && !_sending)
              TextButton.icon(
                onPressed: _reset,
                icon: const Icon(Icons.refresh, size: 18, color: _ScanC.mint),
                label: Text(
                  L10n.t(context, 'scan.retake'),
                  style: const TextStyle(color: _ScanC.mint),
                ),
              ),
          ],
        ),
        const SizedBox(height: 14),
        ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: Image.file(
            _photo!,
            height: 200,
            width: double.infinity,
            fit: BoxFit.cover,
          ),
        ),
        const SizedBox(height: 18),
        if (_uploading)
          _DarkCard(
            child: Column(
              children: [
                const CircularProgressIndicator(color: _ScanC.mint),
                const SizedBox(height: 14),
                Text(
                  L10n.t(context, 'scan.reading'),
                  style: const TextStyle(color: _ScanC.mintSoft, fontSize: 13),
                ),
              ],
            ),
          )
        else if (result != null) ...[
          if (result.error != null)
            _Notice(
              icon: Icons.error_outline,
              color: _ScanC.danger,
              title: L10n.c('scan.readFailed'),
              message: result.error!,
            )
          else if (medicines.isEmpty)
            _Notice(
              icon: Icons.help_outline,
              color: _ScanC.warning,
              title: L10n.c('scan.noMedicine'),
              message: L10n.c('scan.noMedicineHint'),
            )
          else
            _DarkCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.auto_awesome,
                        size: 18,
                        color: _ScanC.yellow,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        L10n.t(context, 'scan.medicinesFound'),
                        style: const TextStyle(
                          color: _ScanC.text,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const Spacer(),
                      if (result.prescription.aiConfidence != null)
                        Text(
                          '${result.prescription.aiConfidence}%',
                          style: const TextStyle(
                            fontSize: 12,
                            color: _ScanC.muted,
                          ),
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
                            child: Icon(
                              Icons.check_circle,
                              size: 16,
                              color: _ScanC.mint,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              m,
                              style: const TextStyle(
                                fontSize: 14,
                                color: _ScanC.mintSoft,
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
              color: _ScanC.warning,
              title: L10n.c('scan.pharmacistReview'),
              message: result.reasons.join('\n'),
            ),
          ],
          if (_reviewSent) ...[
            const SizedBox(height: 12),
            _Notice(
              icon: Icons.mark_email_read_outlined,
              color: _ScanC.mint,
              title: L10n.c('scan.transmitted'),
              message: L10n.c('scan.transmittedMsg'),
            ),
          ],
          const SizedBox(height: 22),
          // Tant que l'equipe n'a pas relu l'ordonnance, on ne propose pas
          // de continuer : commander sans relecture contournerait la
          // verification, avec des medicaments incertains.
          if (!_reviewSent) ...[
            _ActionButton(
              label: L10n.t(context, 'scan.chooseDelivery'),
              icon: Icons.arrow_forward_rounded,
              primary: true,
              onTap: _sending ? null : _goToLocation,
            ),
            const SizedBox(height: 12),
          ],
          if (!_reviewSent)
            _ActionButton(
              label: L10n.t(context, 'scan.retakePhoto'),
              icon: Icons.camera_alt_rounded,
              primary: false,
              onTap: _sending ? null : () => _pick(ImageSource.camera),
            ),
        ],
      ],
    );
  }
}

/// Halo radial decoratif du fond.
class _ScanGlow extends StatelessWidget {
  const _ScanGlow({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [color, color.withValues(alpha: 0)]),
        ),
      ),
    );
  }
}

/// Illustration 3D : ordonnance dans un cadre de scan + medicaments.
class _ScanArt extends StatelessWidget {
  const _ScanArt();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 178,
      height: 216,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Cadre de lecture (quatre coins menthe).
          ...[
            const _Corner(top: true, left: true),
            const _Corner(top: true, left: false),
            const _Corner(top: false, left: true),
            const _Corner(top: false, left: false),
          ],
          Positioned(
            top: 18,
            left: 26,
            child: Transform.rotate(
              angle: -0.06,
              child: Image.asset(
                'assets/icons3d/rx.png',
                width: 112,
                height: 112,
              ),
            ),
          ),
          Positioned(
            bottom: 8,
            right: 4,
            child: Image.asset(
              'assets/icons3d/bottle.png',
              width: 72,
              height: 72,
            ),
          ),
          Positioned(
            bottom: 12,
            left: 6,
            child: Transform.rotate(
              angle: -0.4,
              child: Image.asset(
                'assets/icons3d/pill.png',
                width: 48,
                height: 48,
              ),
            ),
          ),
          Positioned(
            bottom: 30,
            right: 40,
            child: Transform.rotate(
              angle: 0.3,
              child: Image.asset(
                'assets/icons3d/pill.png',
                width: 40,
                height: 40,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Corner extends StatelessWidget {
  const _Corner({required this.top, required this.left});

  final bool top;
  final bool left;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: top ? 0 : null,
      bottom: top ? null : 0,
      left: left ? 0 : null,
      right: left ? null : 0,
      child: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          border: Border(
            top: top
                ? const BorderSide(color: _ScanC.mint, width: 4)
                : BorderSide.none,
            bottom: !top
                ? const BorderSide(color: _ScanC.mint, width: 4)
                : BorderSide.none,
            left: left
                ? const BorderSide(color: _ScanC.mint, width: 4)
                : BorderSide.none,
            right: !left
                ? const BorderSide(color: _ScanC.mint, width: 4)
                : BorderSide.none,
          ),
          borderRadius: BorderRadius.only(
            topLeft: left && top ? const Radius.circular(12) : Radius.zero,
            topRight: !left && top ? const Radius.circular(12) : Radius.zero,
            bottomLeft: left && !top ? const Radius.circular(12) : Radius.zero,
            bottomRight: !left && !top
                ? const Radius.circular(12)
                : Radius.zero,
          ),
        ),
      ),
    );
  }
}

class _ScanTitle extends StatelessWidget {
  const _ScanTitle();

  @override
  Widget build(BuildContext context) {
    final title = L10n.t(context, 'scan.title');
    final highlight = L10n.t(context, 'scan.heroHighlight');
    const base = TextStyle(
      color: _ScanC.text,
      fontSize: 28,
      fontWeight: FontWeight.w800,
      height: 1.1,
      letterSpacing: -0.5,
    );
    final index = highlight.isEmpty ? -1 : title.indexOf(highlight);
    if (index < 0) return Text(title, style: base);
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(text: title.substring(0, index)),
          TextSpan(
            text: highlight,
            style: const TextStyle(color: _ScanC.yellow),
          ),
          TextSpan(text: title.substring(index + highlight.length)),
        ],
      ),
      style: base,
    );
  }
}

/// Bouton principal (degrade menthe) ou secondaire (verre sombre).
class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.icon,
    required this.primary,
    required this.onTap,
    this.iconAsset,
  });

  final String label;
  final IconData icon;
  final String? iconAsset;
  final bool primary;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final content = Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (iconAsset != null)
          Image.asset(iconAsset!, width: 27, height: 27)
        else
          Icon(
            icon,
            size: 24,
            color: primary ? const Color(0xFF04291C) : _ScanC.mint,
          ),
        const SizedBox(width: 11),
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: primary ? const Color(0xFF04291C) : _ScanC.text,
              fontSize: 15.5,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );

    if (!primary) {
      return Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(28),
          child: Container(
            height: 58,
            decoration: BoxDecoration(
              color: _ScanC.card,
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: _ScanC.borderStrong),
            ),
            child: Center(child: content),
          ),
        ),
      );
    }

    return Container(
      height: 58,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF34E3A4), Color(0xFF10B981)],
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: _ScanC.mint.withValues(alpha: 0.28),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(28),
          child: Center(child: content),
        ),
      ),
    );
  }
}

class _DarkCard extends StatelessWidget {
  const _DarkCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: _ScanC.card,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: _ScanC.border),
      ),
      child: child,
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
        color: _ScanC.cardSolid,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: color.withValues(alpha: 0.4)),
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
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: color,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  message,
                  style: const TextStyle(fontSize: 13, color: _ScanC.mintSoft),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Carte « conseil pour une bonne analyse » en bas de l'ecran d'accueil.
class _TipCard extends StatelessWidget {
  const _TipCard({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _ScanC.card,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: _ScanC.borderStrong),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: const Color(0x22FACC15),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(
              Icons.lightbulb_outline_rounded,
              color: _ScanC.yellow,
              size: 27,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  L10n.t(context, 'scan.tipTitle'),
                  style: const TextStyle(
                    color: _ScanC.text,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  text,
                  style: const TextStyle(
                    color: _ScanC.mintSoft,
                    fontSize: 12.5,
                    height: 1.3,
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
