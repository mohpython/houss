import 'package:flutter/material.dart';

/// Palette de l'application, alignee sur celle de WhatsApp.
///
/// Les couleurs ne sont plus des constantes figees mais des accesseurs qui se
/// resolvent sur la luminosite courante. C'est ce qui permet d'avoir un vrai
/// theme clair ET sombre : les 300+ appels `AppColors.x` repartis dans les
/// ecrans suivent le theme sans avoir ete reecrits un par un.
///
/// [AppColors.light] doit etre positionne AVANT la construction de l'arbre
/// (fait par `app.dart`, qui reconstruit tout des que le mode change).
class AppColors {
  AppColors._();

  /// `true` quand le theme clair est actif. Positionne par `app.dart`.
  static bool light = false;

  // ---------------------------------------------------------------- clair
  // Fonds reels de WhatsApp en theme jour.
  static const Color _lBackground = Color(0xFFF0F2F5);
  static const Color _lSurface = Color(0xFFFFFFFF);
  static const Color _lSurfaceLight = Color(0xFFE9EDEF);
  static const Color _lCard = Color(0xFFFFFFFF);
  static const Color _lBorder = Color(0xFFD9DEE3);

  /// #25D366 : le vert WhatsApp.
  static const Color _lPrimary = Color(0xFF25D366);
  /// #128C7E : le vert soutenu, lisible en texte sur fond clair.
  static const Color _lPrimaryDeep = Color(0xFF128C7E);
  /// Secondaire lisible : couleur d'icone, d'onglet actif, de libelle.
  ///
  /// On ne met PAS ici la bulle sortante #D9FDD3 : dans ce code `accent` est
  /// une couleur de *texte et d'icone* sur 40 ecrans, pas un fond. Un vert
  /// pale serait invisible sur une carte blanche.
  static const Color _lAccent = Color(0xFF128C7E);

  static const Color _lTextPrimary = Color(0xFF111B21);
  static const Color _lTextSecondary = Color(0xFF4A5A66);
  static const Color _lTextMuted = Color(0xFF7C8B95);

  static const Color _lSuccess = Color(0xFF128C7E);
  static const Color _lWarning = Color(0xFFB45309);
  static const Color _lDanger = Color(0xFFDC2626);

  // ---------------------------------------------------------------- sombre
  // Fonds reels de WhatsApp en theme nuit.
  static const Color _dBackground = Color(0xFF0B141A);
  static const Color _dSurface = Color(0xFF111B21);
  static const Color _dSurfaceLight = Color(0xFF202C33);
  static const Color _dCard = Color(0xFF182229);
  static const Color _dBorder = Color(0xFF2A3942);

  /// #00A884 : le vert d'eau de WhatsApp en mode nuit.
  static const Color _dPrimary = Color(0xFF00A884);
  static const Color _dPrimaryDeep = Color(0xFF005C4B);
  static const Color _dAccent = Color(0xFF005C4B);

  static const Color _dTextPrimary = Color(0xFFE9EDEF);
  static const Color _dTextSecondary = Color(0xFFAEBAC1);
  static const Color _dTextMuted = Color(0xFF8696A0);

  static const Color _dSuccess = Color(0xFF25D366);
  static const Color _dWarning = Color(0xFFF0A63A);
  static const Color _dDanger = Color(0xFFF15C6D);

  // ------------------------------------------------------------- accesseurs
  static Color get background => light ? _lBackground : _dBackground;
  static Color get surface => light ? _lSurface : _dSurface;
  static Color get surfaceLight => light ? _lSurfaceLight : _dSurfaceLight;
  static Color get card => light ? _lCard : _dCard;
  static Color get border => light ? _lBorder : _dBorder;

  static Color get primary => light ? _lPrimary : _dPrimary;
  static Color get primaryLight => light ? _lPrimaryDeep : _dPrimary;
  static Color get primaryDeep => light ? _lPrimaryDeep : _dPrimaryDeep;
  static Color get accent => light ? _lAccent : _dAccent;
  static Color get accentLight => light ? _lPrimaryDeep : _dPrimary;

  static Color get textPrimary => light ? _lTextPrimary : _dTextPrimary;
  static Color get textSecondary => light ? _lTextSecondary : _dTextSecondary;
  static Color get textMuted => light ? _lTextMuted : _dTextMuted;

  static Color get success => light ? _lSuccess : _dSuccess;
  static Color get warning => light ? _lWarning : _dWarning;
  static Color get danger => light ? _lDanger : _dDanger;

  /// Couleur de texte a poser sur [primary] : lisible dans les deux themes.
  static Color get onPrimary => light ? const Color(0xFF06301F) : Colors.white;

  /// Couleur de texte a poser sur [danger].
  ///
  /// En mode sombre, [danger] est un rouge clair (#F15C6D) : le blanc y
  /// descendrait a 3,2:1, insuffisant pour le chiffre de 10 px de la pastille
  /// de notifications. Le texte y est donc tres sombre (5,7:1).
  static Color get onDanger => light ? Colors.white : const Color(0xFF0B141A);
}