import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Langues disponibles dans l'application.
enum SahaLang {
  fr('fr', 'FR', 'Français'),
  en('en', 'EN', 'English'),
  ar('ar', 'AR', 'العربية'),
  bm('bm', 'BM', 'Bamanankan');

  const SahaLang(this.code, this.badge, this.label);

  /// Code BCP-47.
  final String code;

  /// Court libellé affiché dans le sélecteur (FR / EN / AR / BM).
  final String badge;

  /// Nom de la langue dans sa propre langue.
  final String label;
}

/// Langue courante de l'application (mémorisée sur l'appareil).
class AppLocale extends ChangeNotifier {
  AppLocale._();
  static final AppLocale instance = AppLocale._();

  static const _prefsKey = 'saha.lang';

  SahaLang _current = SahaLang.fr;
  SahaLang get current => _current;
  Locale get locale => Locale(_current.code, _current == SahaLang.fr ? 'FR' : '');
  bool get isRtl => _current == SahaLang.ar;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_prefsKey);
    _current = SahaLang.values.firstWhere(
      (l) => l.code == saved,
      orElse: () => SahaLang.fr,
    );
    notifyListeners();
  }

  Future<void> setLang(SahaLang lang) async {
    if (_current == lang) return;
    _current = lang;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, lang.code);
  }
}

/// Traductions légères de l'application (FR / EN / AR / BM).
///
/// Les traductions bamanankan sont une première passe, à affiner avec un
/// locuteur natif.
class L10n {
  L10n._();

  /// Lie l'écran courant à la langue : **à appeler au début de `build()`**.
  ///
  /// Sans cet appel, un écran déjà affiché garde ses textes d'origine après un
  /// changement de langue (le routeur ne reconstruit pas le contenu des
  /// routes existantes). Volontairement hors de [t] : `dependOn…` n'est
  /// valable que depuis `build()`, alors que [t] est aussi appelé depuis des
  /// callbacks (SnackBar, dialogues, feuilles modales).
  static void bind(BuildContext context) {
    Localizations.maybeLocaleOf(context);
  }

  /// Traduit la clé dans la langue courante (retourne la clé si inconnue).
  static String t(BuildContext context, String key) {
    final table = _tables[AppLocale.instance.current] ?? _tables[SahaLang.fr]!;
    return table[key] ?? _tables[SahaLang.fr]![key] ?? key;
  }

  /// Traduit la clé en remplaçant les marqueurs `{name}`.
  static String tArgs(BuildContext context, String key, Map<String, String> args) {
    var s = t(context, key);
    args.forEach((k, v) => s = s.replaceAll('{$k}', v));
    return s;
  }

  static const _tables = <SahaLang, Map<String, String>>{
    SahaLang.fr: {
      'brand': 'SAHA Santé',
      'tagline': 'Assistant IA + livraison',
      'hero1': 'Votre santé,',
      'hero2': 'facilitée.',
      'heroDesc':
          'Scannez vos ordonnances, trouvez les meilleures pharmacies et suivez votre livraison en quelques clics.',
      'getStarted': 'Commencer',
      'language': 'Langue',
      'loginTitle': 'Se connecter',
      'loginSub': 'Accédez à votre espace pour scanner, suivre et commander.',
      'methodEmail': 'Email',
      'methodPhone': 'Téléphone',
      'emailLabel': 'Email',
      'emailHint': 'vous@exemple.com',
      'passwordLabel': 'Mot de passe',
      'passwordHint': '••••••••',
      'signIn': 'Se connecter',
      'googleBtn': 'Continuer avec Google',
      'or': 'ou',
      'createAccount': 'Créer un nouveau compte',
      'phoneLabel': 'Téléphone',
      'phoneHint': '+223 76 12 34 56',
      'sendCode': 'Envoyer le code',
      'codeLabel': 'Code de vérification',
      'codeHint': '6 chiffres',
      'verify': 'Vérifier',
      'resend': 'Renvoyer le code',
      'otpSent': 'Un code a été envoyé au {phone}. Vérifiez vos SMS.',
      'phoneNotEnabled': 'La connexion par téléphone n’est pas activée.',
      'errFillLogin': 'Saisissez votre email et votre mot de passe',
      'errPassMin': 'Le mot de passe doit contenir au moins 6 caractères',
      'errGoogleToken': 'Impossible d’obtenir le jeton Google.',
      'errGoogle': 'Connexion Google impossible pour le moment. Réessayez dans quelques instants.',
      'errFillPhone': 'Saisissez votre numéro de téléphone',
      'errSmsNotEnabled': 'La connexion par SMS n’est pas disponible pour le moment.',
      'errFillCode': 'Saisissez les 6 chiffres du code',
      'registerTitle': 'Créer un compte',
      'registerSub': 'Créez votre compte avec Google : c\'est Google qui vérifie votre adresse e-mail, donc aucun faux compte ne peut se connecter.',
      'fullNameLabel': 'Nom complet',
      'fullNameHint': 'Votre nom',
      'createMyAccount': 'Créer mon compte',
      'alreadyRegistered': 'Déjà inscrit ? Se connecter',
      'alreadyHave': 'J’ai déjà un compte',
      'errFillRegister': 'Renseignez votre nom, votre email et un mot de passe',
      'navHome': 'Accueil',
      'navScan': 'Scanner',
      'navTrack': 'Suivi',
      'navProfile': 'Profil',
      'navAdmin': 'Admin',
      'navPharmacy': 'Pharmacie',
      'navCourier': 'Livreur',
      'navPractitioner': 'Praticien',
      'settings': 'Paramètres',
      'signOut': 'Se déconnecter',
    },
    SahaLang.en: {
      'brand': 'SAHA Santé',
      'tagline': 'AI assistant + delivery',
      'hero1': 'Your health,',
      'hero2': 'made easier.',
      'heroDesc':
          'Scan your prescriptions, find the best pharmacies and track your delivery in a few taps.',
      'getStarted': 'Get Started',
      'language': 'Language',
      'loginTitle': 'Log in',
      'loginSub': 'Access your space to scan, track and order.',
      'methodEmail': 'Email',
      'methodPhone': 'Phone',
      'emailLabel': 'Email',
      'emailHint': 'you@example.com',
      'passwordLabel': 'Password',
      'passwordHint': '••••••••',
      'signIn': 'Log in',
      'googleBtn': 'Continue with Google',
      'or': 'or',
      'createAccount': 'Create a new account',
      'phoneLabel': 'Phone',
      'phoneHint': '+223 76 12 34 56',
      'sendCode': 'Send code',
      'codeLabel': 'Verification code',
      'codeHint': '6 digits',
      'verify': 'Verify',
      'resend': 'Resend code',
      'otpSent': 'A code was sent to {phone}. Check your SMS.',
      'phoneNotEnabled': 'Phone login is not enabled.',
      'errFillLogin': 'Enter your email and password',
      'errPassMin': 'Password must be at least 6 characters',
      'errGoogleToken': 'Unable to get the Google token.',
      'errGoogle': 'Google login is unavailable right now. Please try again in a few moments.',
      'errFillPhone': 'Enter your phone number',
      'errSmsNotEnabled': 'SMS login is not available right now.',
      'errFillCode': 'Enter the 6-digit code',
      'registerTitle': 'Create an account',
      'registerSub': 'Create your account with Google: Google verifies your email address, so no fake account can sign in.',
      'fullNameLabel': 'Full name',
      'fullNameHint': 'Your name',
      'createMyAccount': 'Create my account',
      'alreadyRegistered': 'Already registered? Sign in',
      'alreadyHave': 'I already have an account',
      'errFillRegister': 'Enter your name, email and a password',
      'navHome': 'Home',
      'navScan': 'Scan',
      'navTrack': 'Track',
      'navProfile': 'Profile',
      'navAdmin': 'Admin',
      'navPharmacy': 'Pharmacy',
      'navCourier': 'Courier',
      'navPractitioner': 'Practitioner',
      'settings': 'Settings',
      'signOut': 'Sign out',
    },
    SahaLang.ar: {
      'brand': 'SAHA Santé',
      'tagline': 'مساعد ذكي + توصيل',
      'hero1': 'صحتك،',
      'hero2': 'بكل سهولة.',
      'heroDesc': 'امسح وصفاتك، ابحث عن أفضل الصيدليات وتابع توصيلك بسرعة.',
      'getStarted': 'ابدأ',
      'language': 'اللغة',
      'loginTitle': 'تسجيل الدخول',
      'loginSub': 'ادخل إلى مساحتك للمسح والمتابعة والطلب.',
      'methodEmail': 'البريد',
      'methodPhone': 'الهاتف',
      'emailLabel': 'البريد الإلكتروني',
      'emailHint': 'vous@exemple.com',
      'passwordLabel': 'كلمة المرور',
      'passwordHint': '••••••••',
      'signIn': 'تسجيل الدخول',
      'googleBtn': 'المتابعة باستخدام Google',
      'or': 'أو',
      'createAccount': 'إنشاء حساب جديد',
      'phoneLabel': 'الهاتف',
      'phoneHint': '+223 76 12 34 56',
      'sendCode': 'إرسال الرمز',
      'codeLabel': 'رمز التحقق',
      'codeHint': '6 أرقام',
      'verify': 'تحقق',
      'resend': 'إعادة إرسال الرمز',
      'otpSent': 'تم إرسال رمز إلى {phone}. تحقق من رسائلك.',
      'phoneNotEnabled': 'تسجيل الدخول بالهاتف غير مفعّل.',
      'errFillLogin': 'أدخل بريدك الإلكتروني وكلمة المرور',
      'errPassMin': 'كلمة المرور يجب أن تحتوي على 6 أحرف على الأقل',
      'errGoogleToken': 'تعذّر الحصول على رمز Google.',
      'errGoogle': 'تعذّر تسجيل الدخول عبر Google الآن. حاول مجددًا بعد قليل.',
      'errFillPhone': 'أدخل رقم هاتفك',
      'errSmsNotEnabled': 'تسجيل الدخول بالرسائل غير متاح الآن.',
      'errFillCode': 'أدخل الأرقام الستة للرمز',
      'registerTitle': 'إنشاء حساب',
      'registerSub': 'أنشئ حسابك عبر Google: يتحقق Google من بريدك الإلكتروني، لذلك لا يمكن لأي حساب مزيف الاتصال.',
      'fullNameLabel': 'الاسم الكامل',
      'fullNameHint': 'اسمك',
      'createMyAccount': 'إنشاء حسابي',
      'alreadyRegistered': 'لديك حساب بالفعل؟ سجّل الدخول',
      'alreadyHave': 'لديّ حساب بالفعل',
      'errFillRegister': 'أدخل اسمك وبريدك وكلمة مرور',
      'navHome': 'الرئيسية',
      'navScan': 'المسح',
      'navTrack': 'التتبع',
      'navProfile': 'الملف',
      'navAdmin': 'الإدارة',
      'navPharmacy': 'الصيدلية',
      'navCourier': 'المندوب',
      'navPractitioner': 'الطبيب',
      'settings': 'الإعدادات',
      'signOut': 'تسجيل الخروج',
    },
    SahaLang.bm: {
      'brand': 'SAHA Santé',
      'tagline': 'Dɛmɛni + nɛgɛso',
      'hero1': 'I ka kɛnɛya,',
      'hero2': 'nɔgɔya na.',
      'heroDesc': 'I ka ɔrdɔnansi jɛɲɛ, i ka faramasɔɲɔgɔn ɲini, i ka nɛgɛso tɛmɛkɔ.',
      'getStarted': 'Daminɛ',
      'language': 'Kan',
      'loginTitle': 'I don kɛ',
      'loginSub': 'Don i ka yɔrɔ la ka jɛɲɛ, ka lajɛ ani ka dilan.',
      'methodEmail': 'Imɛli',
      'methodPhone': 'Tɛlɛfɔni',
      'emailLabel': 'Imɛli',
      'emailHint': 'vous@exemple.com',
      'passwordLabel': 'Pasikodi',
      'passwordHint': '••••••••',
      'signIn': 'I don kɛ',
      'googleBtn': 'Google fɛ tɛmɛ',
      'or': 'Wala',
      'createAccount': 'Konti kura dilan',
      'phoneLabel': 'Tɛlɛfɔni',
      'phoneHint': '+223 76 12 34 56',
      'sendCode': 'Kodi ci',
      'codeLabel': 'Kodi lajɛ',
      'codeHint': 'Sagi 6',
      'verify': 'Lajɛ',
      'resend': 'Kodi ci tuun',
      'otpSent': 'Kodi ci ra i ka tɛlɛfɔni ma {phone}. I ka SMS lawaje.',
      'phoneNotEnabled': 'Tɛlɛfɔni don ma bɔ.',
      'errFillLogin': 'I ka imɛli ni pasikodi sɛbɛn',
      'errPassMin': 'Pasikodi ka bon sagi 6 la',
      'errGoogleToken': 'Google kodi sɔrɔ tɛ se.',
      'errGoogle': 'Google don tɛ se sisan. I ko tɛmɛ, i ka a kɛ tuun.',
      'errFillPhone': 'I ka tɛlɛfɔni nɔmɔrɔ sɛbɛn',
      'errSmsNotEnabled': 'SMS don tɛ sisan.',
      'errFillCode': 'Kodi sagi 6 sɛbɛn',
      'registerTitle': 'Konti kura dilan',
      'registerSub': 'I ka kɔnti si Google ye: Google ye bɛ na a ka ɔrɔsi sɛmɛntiya, o dɛmɛn bɛnnɛ bɛn ma a sɔrɔ waati.',
      'fullNameLabel': 'Tɔgɔ',
      'fullNameHint': 'I tɔgɔ',
      'createMyAccount': 'N ka konti kɛ',
      'alreadyRegistered': 'I bɛ konti ye? Sɛgɛma',
      'alreadyHave': 'N ka konti bɛ yen',
      'errFillRegister': 'I tɔgɔ, imɛli ani pasikodi sɛbɛn',
      'navHome': 'So',
      'navScan': 'Jɛɲɛ',
      'navTrack': 'Tɛmɛkɔ',
      'navProfile': 'N yɛrɛ',
      'navAdmin': 'Admin',
      'navPharmacy': 'Faramasɔ',
      'navCourier': 'Nɛgɛso',
      'navPractitioner': 'Dɔgɔtɔrɔ',
      'settings': 'Dilankɛw',
      'signOut': 'Bɔ',
    },
  };
}