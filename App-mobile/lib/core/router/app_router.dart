import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/features/admin/admin_reviews_screen.dart';
import 'package:saha_sante/features/auth/login_screen.dart';
import 'package:saha_sante/features/auth/register_screen.dart';
import 'package:saha_sante/features/health/health_screen.dart';
import 'package:saha_sante/features/home/home_screen.dart';
import 'package:saha_sante/features/home/patient_main_screen.dart';
import 'package:saha_sante/features/location/delivery_location_screen.dart';
import 'package:saha_sante/features/notifications/notifications_screen.dart';
import 'package:saha_sante/features/pharmacy_choice/pharmacy_quotes_screen.dart';
import 'package:saha_sante/features/otc/otc_screen.dart';
import 'package:saha_sante/features/prescriptions/prescriptions_screen.dart';
import 'package:saha_sante/features/profile/profile_screen.dart';
import 'package:saha_sante/features/reservations/reservations_screen.dart';
import 'package:saha_sante/features/scan/scan_screen.dart';
import 'package:saha_sante/features/splash/onboarding_screen.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/services/auth_service.dart';
import 'package:saha_sante/features/tracking/tracking_screen.dart';

class AppRouter {
  AppRouter._();

  static final _rootNavigatorKey = GlobalKey<NavigatorState>();

  /// Écrans accessibles uniquement une fois connecté.
  static const _protected = [
    '/app',
    '/home',
    '/scan',
    '/prescriptions',
    '/localisation',
    '/pharmacies',
    '/admin/reviews',
    '/reservations',
    '/suivi',
    '/profil',
    '/notifications',
    '/otc',
    '/health',
  ];

  /// Ouvre le fil des notifications sans casser la pile de
  /// navigation (cause de « le retour sort de l'app ») :
  ///
  /// - App en cours : on empile le fil, le bouton retour
  ///   revient a l'ecran precedent.
  /// - Demarrage a froid (notification systeme tappee avant
  ///   le premier rendu) : la pile n'existe pas encore, on
  ///   part de l'accueil puis on empile le fil ; le retour
  ///   atterrit sur l'accueil, pas sur une sortie.
  static Future<void> openNotifications() async {
    final nav = _rootNavigatorKey.currentState;
    if (nav != null && nav.canPop()) {
      router.push('/notifications');
      return;
    }
    try {
      router.go('/app');
    } catch (e) {
      debugPrint('push: ouverture du fil reportee : $e');
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      try {
        router.push('/notifications');
      } catch (e) {
        debugPrint('push: ouverture du fil impossible : $e');
      }
    });
  }
  static GoRouter? _instance;

  static GoRouter get router => _instance ??= GoRouter(
        navigatorKey: _rootNavigatorKey,
        initialLocation: '/',
        // La session (redirections / connexion) ET la langue (reconstruction
        // de l'écran affiché) déclenchent une reconstruction des routes.
        refreshListenable: Listenable.merge([AuthService.instance, AppLocale.instance]),
        redirect: (context, state) {
          final auth = AuthService.instance;
          if (auth.isLoading) return null;
          final path = state.uri.path;
          final needsAuth = _protected.any((p) => path == p || path.startsWith('$p/'));

          if (!auth.isLoggedIn && needsAuth) return '/login';
          // Déjà connecté : on saute l'accueil public et les écrans de connexion.
          if (auth.isLoggedIn && (path == '/' || path == '/login' || path == '/register')) {
            return '/app';
          }
          return null;
        },
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) => const OnboardingScreen(),
          ),
          GoRoute(
            path: '/login',
            builder: (context, state) => const LoginScreen(),
          ),
          GoRoute(
            path: '/register',
            builder: (context, state) => const RegisterScreen(),
          ),
          GoRoute(
            path: '/app',
            builder: (context, state) => const PatientMainScreen(),
          ),
          GoRoute(
            path: '/home',
            builder: (context, state) => const HomeScreen(),
          ),
          GoRoute(
            path: '/scan',
            builder: (context, state) => const ScanScreen(),
          ),
          GoRoute(
            path: '/prescriptions',
            builder: (context, state) => const PrescriptionsScreen(),
          ),
          GoRoute(
            path: '/localisation/:prescriptionId',
            builder: (context, state) => DeliveryLocationScreen(
              prescriptionId: state.pathParameters['prescriptionId'] ?? '',
            ),
          ),
          GoRoute(
            path: '/pharmacies/:prescriptionId',
            builder: (context, state) {
              final q = state.uri.queryParameters;
              return PharmacyQuotesScreen(
                prescriptionId: state.pathParameters['prescriptionId'] ?? '',
                mode: q['mode'] ?? '',
                lat: double.tryParse(q['lat'] ?? ''),
                lng: double.tryParse(q['lng'] ?? ''),
                address: q['address'],
                neighborhoodId: q['neighborhoodId'],
                fulfillment: q['fulfillment'] ?? 'delivery',
              );
            },
          ),
          GoRoute(
            path: '/admin/reviews',
            builder: (context, state) => const AdminReviewsScreen(),
          ),
          GoRoute(
            path: '/reservations',
            builder: (context, state) => const ReservationsScreen(),
          ),
          GoRoute(
            path: '/suivi',
            builder: (context, state) => const TrackingScreen(),
          ),
          GoRoute(
            path: '/suivi/:id',
            builder: (context, state) => TrackingScreen(reservationId: state.pathParameters['id']),
          ),
          GoRoute(
            path: '/profil',
            builder: (context, state) => const ProfileScreen(),
          ),
          GoRoute(
            path: '/notifications',
            builder: (context, state) => const NotificationsScreen(),
          ),
          GoRoute(
            path: '/otc',
            builder: (context, state) => const OtcScreen(),
          ),
          GoRoute(
            path: '/health',
            builder: (context, state) => const HealthScreen(),
          ),
        ],
      );
}
