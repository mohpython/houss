import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/l10n/language_picker.dart';
import 'package:saha_sante/core/services/auth_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:url_launcher/url_launcher.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();

  bool _obscure = true;
  bool _loading = false;
  bool _googleLoading = false;
  int _method = 0; // 0 = email, 1 = téléphone
  bool _otpSent = false;
  bool _otpLoading = false;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _phoneController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    final name = _nameController.text.trim();
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (name.isEmpty || email.isEmpty || password.isEmpty) {
      _showError(L10n.t(context, 'errFillRegister'));
      return;
    }
    setState(() => _loading = true);
    try {
      await AuthService.instance.register(
        email: email,
        password: password,
        fullName: name,
      );
      if (mounted) context.go('/app');
    } on ApiException catch (e) {
      _showError(e.message);
    } catch (_) {
      _showError('Inscription impossible. Réessayez.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Création de compte via le site web (Google) — même flux que la connexion.
  Future<void> _signUpWithGoogle() async {
    setState(() => _googleLoading = true);
    try {
      final url = 'https://sahasantemali.com/api/auth/google/?redirect=%2Fapp&mobile=1';
      debugPrint('GSI[WEB] launch $url');
      final ok = await launchUrl(
        Uri.parse(url),
        mode: LaunchMode.inAppBrowserView,
        webOnlyWindowName: '_self',
      );
      debugPrint('GSI[WEB] launch ok=$ok');
    } catch (e) {
      debugPrint('GSI[ERREUR] ${e.runtimeType}: $e');
      if (mounted) _showError(L10n.t(context, 'errGoogle'));
    } finally {
      if (mounted) setState(() => _googleLoading = false);
    }
  }

  Future<void> _sendOtp() async {
    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) {
      _showError(L10n.t(context, 'errFillPhone'));
      return;
    }
    setState(() => _otpLoading = true);
    try {
      await AuthService.instance.api
          .post('/auth/otp/send', {'phone': phone, if (name.isNotEmpty) 'full_name': name});
      if (!mounted) return;
      setState(() => _otpSent = true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(L10n.tArgs(context, 'otpSent', {'phone': phone})),
          backgroundColor: AppColors.success,
        ),
      );
    } on ApiException catch (e) {
      _showError(e.message);
    } catch (_) {
      _showError(L10n.t(context, 'errSmsNotEnabled'));
    } finally {
      if (mounted) setState(() => _otpLoading = false);
    }
  }

  Future<void> _verifyOtp() async {
    final phone = _phoneController.text.trim();
    final code = _codeController.text.trim();
    if (code.isEmpty || code.length < 6) {
      _showError(L10n.t(context, 'errFillCode'));
      return;
    }
    setState(() => _otpLoading = true);
    try {
      await AuthService.instance.verifyOtp(phone, code);
      if (mounted) context.go('/app');
    } on ApiException catch (e) {
      _showError(e.message);
    } catch (_) {
      _showError('Code invalide. Réessayez.');
    } finally {
      if (mounted) setState(() => _otpLoading = false);
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
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: CustomScrollView(
              slivers: [
                SliverFillRemaining(
                  hasScrollBody: false,
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
                          const SizedBox(width: 8),
                          Text(
                            L10n.t(context, 'brand'),
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                          ),
                          const Spacer(),
                          const LanguageChip(),
                        ],
                      ),
                      const SizedBox(height: 20),
                      Text(
                        L10n.t(context, 'registerTitle'),
                        style: const TextStyle(fontSize: 36, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        L10n.t(context, 'registerSub'),
                        style: const TextStyle(fontSize: 15, color: AppColors.textSecondary),
                      ),
                      const SizedBox(height: 20),
                      SizedBox(
                        width: double.infinity,
                        height: 52,
                        child: OutlinedButton.icon(
                          onPressed: _loading || _googleLoading ? null : _signUpWithGoogle,
                          style: OutlinedButton.styleFrom(
                            // Fond sombre : `AppColors.textPrimary` est quasi
                            // blanc, un fond blanc rendait le bouton invisible.
                            backgroundColor: AppColors.surfaceLight,
                            foregroundColor: AppColors.textPrimary,
                            side: const BorderSide(color: AppColors.border),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(26),
                            ),
                          ),
                          icon: _googleLoading
                              ? const SizedBox(
                                  height: 18,
                                  width: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.g_mobiledata, size: 28, color: AppColors.primary),
                          label: Text(
                            L10n.t(context, 'googleBtn'),
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),
                      Row(
                        children: [
                          const Expanded(child: Divider(color: AppColors.border)),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: Text(
                              L10n.t(context, 'or'),
                              style: const TextStyle(fontSize: 13, color: AppColors.textMuted),
                            ),
                          ),
                          const Expanded(child: Divider(color: AppColors.border)),
                        ],
                      ),
                      const SizedBox(height: 20),
                      _MethodToggle(
                        index: _method,
                        onChanged: (i) => setState(() => _method = i),
                      ),
                      const SizedBox(height: 20),
                      Text(
                        L10n.t(context, 'fullNameLabel'),
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _nameController,
                        textCapitalization: TextCapitalization.words,
                        decoration: InputDecoration(hintText: L10n.t(context, 'fullNameHint')),
                      ),
                      const SizedBox(height: 16),
                      if (_method == 0) ...[
                        Text(
                          L10n.t(context, 'emailLabel'),
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _emailController,
                          keyboardType: TextInputType.emailAddress,
                          decoration: InputDecoration(hintText: L10n.t(context, 'emailHint')),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          L10n.t(context, 'passwordLabel'),
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _passwordController,
                          obscureText: _obscure,
                          onSubmitted: (_) => _register(),
                          textInputAction: TextInputAction.done,
                          decoration: InputDecoration(
                            hintText: L10n.t(context, 'passwordHint'),
                            suffixIcon: IconButton(
                              onPressed: () => setState(() => _obscure = !_obscure),
                              icon: Icon(
                                _obscure ? Icons.visibility_off : Icons.visibility,
                                size: 20,
                              ),
                            ),
                          ),
                        ),
                      ] else ...[
                        Text(
                          L10n.t(context, 'phoneLabel'),
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _phoneController,
                          keyboardType: TextInputType.phone,
                          enabled: !_otpSent,
                          decoration: InputDecoration(hintText: L10n.t(context, 'phoneHint')),
                        ),
                      ],
                      const SizedBox(height: 24),
                      if (_method == 0) ...[
                        _PrimaryButton(
                          loading: _loading,
                          label: L10n.t(context, 'createMyAccount'),
                          onPressed: _register,
                        ),
                      ] else if (!_otpSent) ...[
                        _PrimaryButton(
                          loading: _otpLoading,
                          label: L10n.t(context, 'sendCode'),
                          onPressed: _sendOtp,
                        ),
                      ] else ...[
                        Text(
                          L10n.t(context, 'codeLabel'),
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _codeController,
                          keyboardType: TextInputType.number,
                          maxLength: 6,
                          onSubmitted: (_) => _verifyOtp(),
                          textInputAction: TextInputAction.done,
                          decoration: InputDecoration(
                            hintText: L10n.t(context, 'codeHint'),
                            counterText: '',
                          ),
                        ),
                        const SizedBox(height: 16),
                        _PrimaryButton(
                          loading: _otpLoading,
                          label: L10n.t(context, 'verify'),
                          onPressed: _verifyOtp,
                        ),
                        const SizedBox(height: 8),
                        Center(
                          child: TextButton(
                            onPressed: _otpLoading
                                ? null
                                : () {
                                    setState(() => _otpSent = false);
                                    _codeController.clear();
                                  },
                            child: Text(
                              L10n.t(context, 'resend'),
                              style: const TextStyle(color: AppColors.primaryLight),
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 20),
                      Center(
                        child: TextButton(
                          onPressed: () => context.go('/login'),
                          child: Text(
                            L10n.t(context, 'alreadyHave'),
                            style: const TextStyle(color: AppColors.primaryLight),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
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

class _PrimaryButton extends StatelessWidget {
  final bool loading;
  final String label;
  final VoidCallback onPressed;

  const _PrimaryButton({
    required this.loading,
    required this.label,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: 56,
      decoration: AppTheme.gradientButton,
      child: ElevatedButton(
        onPressed: loading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.transparent,
          shadowColor: Colors.transparent,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
        ),
        child: loading
            ? const SizedBox(
                height: 22,
                width: 22,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : Text(label),
      ),
    );
  }
}

class _MethodToggle extends StatelessWidget {
  final int index;
  final ValueChanged<int> onChanged;

  const _MethodToggle({required this.index, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          _MethodButton(
            label: L10n.t(context, 'methodEmail'),
            selected: index == 0,
            onTap: () => onChanged(0),
          ),
          _MethodButton(
            label: L10n.t(context, 'methodPhone'),
            selected: index == 1,
            onTap: () => onChanged(1),
          ),
        ],
      ),
    );
  }
}

class _MethodButton extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _MethodButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: selected ? AppColors.primary.withAlpha(50) : null,
            borderRadius: BorderRadius.circular(24),
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: selected ? AppColors.textPrimary : AppColors.textMuted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}