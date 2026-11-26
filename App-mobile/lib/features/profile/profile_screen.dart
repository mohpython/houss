import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/l10n/language_picker.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/auth_service.dart';
import 'package:saha_sante/core/services/unread_store.dart';
import 'package:saha_sante/core/services/voice_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme_mode.dart';
import 'package:saha_sante/core/theme/saha3d.dart';
import 'package:saha_sante/core/theme/theme_picker.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _saving = false;

  /// Le téléphone est stocké côté profil : il n'est pas repris dans le
  /// compte renvoyé par AuthService.
  String? _phone;

  @override
  void initState() {
    super.initState();
    _loadProfile();
    if (!UnreadStore.instance.loaded) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) UnreadStore.instance.refresh();
      });
    }
  }

  Future<void> _loadProfile() async {
    try {
      final profile = await ApiService.instance.getProfile();
      if (!mounted) return;
      setState(() => _phone = profile['phone'] as String?);
    } catch (_) {
      // Le profil reste affiché avec les informations de session.
    }
  }

  String _initials(String name) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.characters.first.toUpperCase();
    return (parts.first.characters.first + parts[1].characters.first)
        .toUpperCase();
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red.shade700),
    );
  }

  Future<void> _editProfile() async {
    final user = AuthService.instance.user;
    final nameController = TextEditingController(text: user?.fullName ?? '');
    final phoneController = TextEditingController(
      text: _phone ?? user?.phone ?? '',
    );

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text(
          L10n.t(context, 'pf.personalInfo'),
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(hintText: L10n.c('pf.fullNameHint')),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: phoneController,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(hintText: L10n.c('common.phone')),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(L10n.c('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(L10n.c('common.save')),
          ),
        ],
      ),
    );

    final fullName = nameController.text.trim();
    final phone = phoneController.text.trim();
    nameController.dispose();
    phoneController.dispose();
    if (confirmed != true || !mounted) return;

    if (fullName.isEmpty) {
      _showError(L10n.c('pf.nameRequired'));
      return;
    }

    setState(() => _saving = true);
    try {
      await ApiService.instance.updateProfile(fullName: fullName, phone: phone);
      if (!mounted) return;
      setState(() {
        _saving = false;
        _phone = phone;
      });
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(L10n.c('pf.updated'))));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _saving = false);
      _showError(L10n.c('pf.updateFailed'));
    }
  }

  /// Ouvre le fil de notifications (style SMS, cliquable).
  void _showNotifications() {
    context.push('/notifications');
  }

  /// Feuille de réglage de la lecture vocale : activation, test et langue.
  Future<void> _showVoiceSheet(BuildContext context) async {
    final voice = VoiceService.instance;
    await voice.init();
    if (!mounted) return;
    if (!context.mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: AnimatedBuilder(
            animation: voice,
            builder: (context, _) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Text(
                      L10n.t(context, 'voice.title'),
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SwitchListTile(
                    value: voice.enabled,
                    onChanged: (v) => voice.setEnabled(v),
                    title: Text(L10n.t(context, 'voice.enable')),
                    subtitle: Text(
                      '${L10n.t(context, 'language')} — ${AppLocale.instance.current.label}',
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                  if (voice.usingFallback)
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 4,
                      ),
                      child: Text(
                        L10n.tArgs(context, 'voice.fallback', {
                          'lang': AppLocale.instance.current.label,
                        }),
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 8,
                    ),
                    child: OutlinedButton.icon(
                      onPressed: () =>
                          voice.speak(L10n.t(context, 'voice.testText')),
                      icon: const Icon(Icons.volume_up_outlined),
                      label: Text(L10n.t(context, 'voice.test')),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Future<void> _signOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text(
          L10n.t(context, 'pf.signOutTitle'),
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
        ),
        content: Text(L10n.t(context, 'pf.signOutBody')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(L10n.c('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(L10n.t(context, 'signOut')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    await AuthService.instance.signOut();
    if (!mounted) return;
    context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
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
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
                child: AnimatedBuilder(
                  animation: AuthService.instance,
                  builder: (context, _) {
                    final user = AuthService.instance.user;
                    final name = user?.displayName ?? L10n.c('pf.myAccount');
                    final phone = (_phone?.isNotEmpty ?? false)
                        ? _phone
                        : user?.phone;
                    final subtitle =
                        user?.email ?? phone ?? L10n.c('pf.accountFallback');

                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Saha3DHeader(onSearch: () => context.push('/otc')),
                        const SizedBox(height: 16),
                        Saha3DPill(
                          label: L10n.t(context, 'pf.badge'),
                          asset: 'assets/icons3d/person.png',
                        ),
                        const SizedBox(height: 16),
                        Expanded(
                          child: ListView(
                            padding: const EdgeInsets.only(bottom: 120),
                            children: [
                              _hero(name, phone, subtitle),
                              const SizedBox(height: 18),
                              _ProfileTile(
                                asset: 'assets/icons3d/person.png',
                                title: L10n.t(context, 'pf.personalInfo'),
                                trailing: _saving
                                    ? const SizedBox(
                                        height: 16,
                                        width: 16,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Saha3D.mint,
                                        ),
                                      )
                                    : null,
                                onTap: _saving ? null : _editProfile,
                              ),
                              _ProfileTile(
                                asset: 'assets/icons3d/rx.png',
                                title: L10n.t(context, 'pf.myPrescriptions'),
                                onTap: () => context.push('/prescriptions'),
                              ),
                              _ProfileTile(
                                asset: 'assets/icons3d/records.png',
                                title: L10n.t(context, 'pf.orderHistory'),
                                onTap: () => context.push('/reservations'),
                              ),
                              _ProfileTile(
                                asset: 'assets/icons3d/bell.png',
                                title: L10n.t(context, 'notifications'),
                                trailing: _unreadBadge(),
                                onTap: _showNotifications,
                              ),
                              _ProfileTile(
                                asset: 'assets/icons3d/globe.png',
                                title:
                                    '${L10n.t(context, 'language')} — '
                                    '${AppLocale.instance.current.badge}',
                                onTap: () => showLanguageSheet(context),
                              ),
                              _ProfileTile(
                                asset: 'assets/icons3d/palette.png',
                                title:
                                    '${L10n.t(context, 'theme')} — '
                                    '${L10n.t(context, 'theme.${AppThemeMode.instance.mode.code}')}',
                                onTap: () => showThemeSheet(context),
                              ),
                              _ProfileTile(
                                asset: 'assets/icons3d/speech.png',
                                title:
                                    '${L10n.t(context, 'voice')} — '
                                    '${VoiceService.instance.enabled ? L10n.t(context, 'voice.on') : L10n.t(context, 'voice.off')}',
                                onTap: () => _showVoiceSheet(context),
                              ),
                              _ProfileTile(
                                asset: 'assets/icons3d/stethoscope.png',
                                title: L10n.t(
                                  context,
                                  'pf.consultPractitioners',
                                ),
                                onTap: () => context.push('/health'),
                              ),
                              const SizedBox(height: 6),
                              SizedBox(
                                width: double.infinity,
                                height: 52,
                                child: OutlinedButton.icon(
                                  onPressed: _signOut,
                                  icon: const Icon(
                                    Icons.power_settings_new_rounded,
                                    size: 18,
                                    color: Color(0xFFF87171),
                                  ),
                                  label: Text(
                                    L10n.t(context, 'signOut'),
                                    style: const TextStyle(
                                      color: Color(0xFFF87171),
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  style: OutlinedButton.styleFrom(
                                    backgroundColor: const Color(0x14EF4444),
                                    side: const BorderSide(
                                      color: Color(0x66EF4444),
                                    ),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(18),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Carte d'identité : avatar, nom, téléphone et bouton « Modifier ».
  Widget _hero(String name, String? phone, String subtitle) {
    final hasPhone = phone != null && phone.isNotEmpty;
    final secondary = hasPhone ? phone : subtitle;
    final third = hasPhone && subtitle != phone ? subtitle : null;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: Saha3D.glass(radius: 24),
      child: Row(
        children: [
          Container(
            width: 62,
            height: 62,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(
                colors: [Saha3D.mint, Color(0xFF10B981)],
              ),
              boxShadow: [
                BoxShadow(
                  color: Saha3D.mint.withValues(alpha: 0.30),
                  blurRadius: 18,
                ),
              ],
            ),
            child: Text(
              _initials(name),
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: Saha3D.onMint,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Saha3D.text,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  secondary,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: Saha3D.mintSoft,
                  ),
                ),
                if (third != null)
                  Text(
                    third,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 10.5, color: Saha3D.muted),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: _saving ? null : _editProfile,
            style: OutlinedButton.styleFrom(
              foregroundColor: Saha3D.mint,
              side: BorderSide(color: Saha3D.mint.withValues(alpha: 0.50)),
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              shape: const StadiumBorder(),
            ),
            child: Text(
              L10n.t(context, 'pf.edit'),
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  /// Pastille rouge du nombre de notifications non lues.
  Widget _unreadBadge() {
    return ListenableBuilder(
      listenable: UnreadStore.instance,
      builder: (context, _) {
        final count = UnreadStore.instance.loaded
            ? UnreadStore.instance.count
            : 0;
        if (count <= 0) return const SizedBox.shrink();
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
          decoration: BoxDecoration(
            color: Saha3D.danger,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            count > 99 ? '99+' : '$count',
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
        );
      },
    );
  }
}

class _ProfileTile extends StatelessWidget {
  final String asset;
  final String title;
  final VoidCallback? onTap;
  final Widget? trailing;

  const _ProfileTile({
    required this.asset,
    required this.title,
    required this.onTap,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          decoration: Saha3D.glass(radius: 18),
          child: Row(
            children: [
              Image.asset(asset, width: 30, height: 30, fit: BoxFit.contain),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Saha3D.text,
                  ),
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 8), trailing!],
              const SizedBox(width: 4),
              const Icon(
                Icons.chevron_right_rounded,
                size: 20,
                color: Saha3D.muted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
