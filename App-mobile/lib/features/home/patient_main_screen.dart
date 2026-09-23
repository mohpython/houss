import 'package:flutter/material.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/features/home/home_screen.dart';
import 'package:saha_sante/features/profile/profile_screen.dart';
import 'package:saha_sante/features/scan/scan_screen.dart';
import 'package:saha_sante/features/tracking/tracking_screen.dart';

class PatientMainScreen extends StatefulWidget {
  const PatientMainScreen({super.key});

  @override
  State<PatientMainScreen> createState() => _PatientMainScreenState();
}

class _PatientMainScreenState extends State<PatientMainScreen> {
  int _currentIndex = 0;

  final _pages = const [
    HomeScreen(),
    ScanScreen(),
    TrackingScreen(),
    ProfileScreen(),
  ];

  final _labels = ['Accueil', 'Scanner', 'Suivi', 'Profil'];
  final _icons = [
    Icons.home,
    Icons.camera_alt,
    Icons.local_shipping,
    Icons.person_outline,
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _pages[_currentIndex],
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          border: Border(
            top: BorderSide(color: AppColors.border),
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: List.generate(4, (index) {
                final selected = _currentIndex == index;
                return GestureDetector(
                  onTap: () => setState(() => _currentIndex = index),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(
                          color: selected ? AppColors.primary.withAlpha(40) : Colors.transparent,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Icon(
                          _icons[index],
                          color: selected ? AppColors.primaryLight : AppColors.textMuted,
                          size: 22,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _labels[index],
                        style: TextStyle(
                          fontSize: 11,
                          color: selected ? AppColors.primaryLight : AppColors.textMuted,
                          fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ),
          ),
        ),
      ),
    );
  }
}
