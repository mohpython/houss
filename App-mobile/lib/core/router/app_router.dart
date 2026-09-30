import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/features/auth/login_screen.dart';
import 'package:saha_sante/features/auth/register_screen.dart';
import 'package:saha_sante/features/health/health_screen.dart';
import 'package:saha_sante/features/home/home_screen.dart';
import 'package:saha_sante/features/home/patient_main_screen.dart';
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
    '/reservations',
    '/suivi',
    '/profil',
    '/otc',
    '/health',
  ];

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
