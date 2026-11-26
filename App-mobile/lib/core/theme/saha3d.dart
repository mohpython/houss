import 'package:flutter/material.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';

/// Palette et composants du style « 3D vert profond » de la maquette
/// SAHA Santé : fonds nuit, verre teinté, accents menthe et jaune.
class Saha3D {
  Saha3D._();

  static const bg = Color(0xFF04150F);
  static const bgDeep = Color(0xFF02100B);
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
  static const onMint = Color(0xFF04291C);

  /// Carte en verre teinté, utilisée pour les blocs de contenu.
  static BoxDecoration glass({
    double radius = 22,
    Color? color,
    Color? borderColor,
    bool shadow = true,
  }) {
    return BoxDecoration(
      color: color ?? card,
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: borderColor ?? border),
      boxShadow: shadow
          ? [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.22),
                blurRadius: 24,
                offset: const Offset(0, 12),
              ),
            ]
          : null,
    );
  }
}

/// Halo radial décoratif du fond.
class Saha3DGlow extends StatelessWidget {
  const Saha3DGlow({super.key, required this.size, required this.color});

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

/// En-tête commun : logo, nom, sous-titre et recherche.
class Saha3DHeader extends StatelessWidget {
  const Saha3DHeader({super.key, this.onSearch, this.trailing});

  final VoidCallback? onSearch;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
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
                  color: Saha3D.text,
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
                  color: Saha3D.mintSoft,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        if (trailing != null) ...[trailing!, const SizedBox(width: 8)],
        if (onSearch != null)
          InkWell(
            onTap: onSearch,
            borderRadius: BorderRadius.circular(15),
            child: Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: Saha3D.card,
                borderRadius: BorderRadius.circular(15),
                border: Border.all(color: Saha3D.borderStrong),
              ),
              child: const Icon(
                Icons.search_rounded,
                color: Saha3D.text,
                size: 23,
              ),
            ),
          ),
      ],
    );
  }
}

/// Pastille arrondie avec une icône 3D optionnelle.
class Saha3DPill extends StatelessWidget {
  const Saha3DPill({
    super.key,
    required this.label,
    this.asset,
    this.icon,
    this.onTap,
  });

  final String label;
  final String? asset;
  final IconData? icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final content = Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
      decoration: BoxDecoration(
        color: Saha3D.mint.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Saha3D.mint.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (asset != null)
            Image.asset(asset!, width: 17, height: 17, fit: BoxFit.contain)
          else if (icon != null)
            Icon(icon, size: 16, color: Saha3D.mint),
          if (asset != null || icon != null) const SizedBox(width: 7),
          Text(
            label,
            style: const TextStyle(
              color: Saha3D.text,
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
    if (onTap == null) return content;
    return GestureDetector(onTap: onTap, child: content);
  }
}
