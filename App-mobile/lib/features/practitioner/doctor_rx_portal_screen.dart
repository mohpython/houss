import 'package:flutter/material.dart';
import 'package:saha_sante/features/doctor_rx/doctor_rx_home_screen.dart';

/// Entrée « e-Ordonnance » du menu : écran 100 % natif, sans portail web.
class DoctorRxPortalScreen extends StatelessWidget {
  const DoctorRxPortalScreen({super.key});

  @override
  Widget build(BuildContext context) => const DoctorRxHomeScreen();
}
