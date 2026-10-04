import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/location_service.dart';
import 'package:saha_sante/core/theme/app_colors.dart';
import 'package:saha_sante/core/theme/app_theme.dart';
import 'package:saha_sante/core/widgets/notification_bell.dart';

class OtcScreen extends StatefulWidget {
  const OtcScreen({super.key});

  @override
  State<OtcScreen> createState() => _OtcScreenState();
}

class _OtcScreenState extends State<OtcScreen> {
  final _controllers = <TextEditingController>[];
  List<String> _suggestions = [];
  bool _loading = true;
  bool _submitting = false;
  Timer? _debounce;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _controllers.add(_newController());
    _loadSuggestions();
  }

  TextEditingController _newController({String text = ''}) {
    final controller = TextEditingController(text: text);
    controller.addListener(() => _onTyped(controller.text));
    return controller;
  }

  /// Recherche des suggestions pendant la saisie (avec un court délai).
  void _onTyped(String value) {
    final query = value.trim();
    if (query == _query) return;
    _query = query;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _loadSuggestions(query: query);
    });
  }

  Future<void> _loadSuggestions({String query = ''}) async {
    try {
      final data = await ApiService.instance.getOtcSuggestions(query: query);
      if (!mounted) return;
      setState(() {
        _suggestions = data;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    for (final c in _controllers) {
      c.dispose();
    }
    super.dispose();
  }

  void _addRow() {
    setState(() {
      _controllers.add(_newController());
    });
  }

  void _removeRow(int index) {
    if (_controllers.length == 1) return;
    setState(() {
      _controllers[index].dispose();
      _controllers.removeAt(index);
    });
  }

  Future<void> _submit() async {
    final medicines = _controllers.map((c) => c.text.trim()).where((t) => t.isNotEmpty).toList();
    if (medicines.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ajoutez au moins un médicament')),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      // La position est facultative : sans GPS, le serveur choisit par défaut.
      final position = await LocationService.current();
      final routing = await ApiService.instance.orderOtc(
        medicines: medicines,
        lat: position?.latitude,
        lng: position?.longitude,
      );
      if (!mounted) return;
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Commande envoyée à ${routing.pharmacyName}')),
      );
      context.push('/suivi/${routing.reservationId}');
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _showError(e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _showError('Commande impossible pour le moment. Réessayez.');
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red.shade700),
    );
  }

  void _fill(String name) {
    final empty = _controllers.indexWhere((c) => c.text.isEmpty);
    if (empty >= 0) {
      _controllers[empty].text = name;
      setState(() {});
    } else if (_controllers.length < 10) {
      _controllers.add(_newController(text: name));
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: AppTheme.subtleGradient,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
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
                    const NotificationBell(),
                    const SizedBox(width: 8),
                    const Text(
                      'Sans ordonnance',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Commandez des médicaments sans ordonnance auprès d\'une pharmacie proche.',
                  style: TextStyle(color: AppColors.textSecondary),
                ),
                const SizedBox(height: 24),
                if (_loading)
                  const Center(child: CircularProgressIndicator())
                else if (_suggestions.isEmpty)
                  Text(
                    'Aucune suggestion pour cette recherche.',
                    style: TextStyle(fontSize: 13, color: AppColors.textMuted),
                  )
                else
                  _Suggestions(
                    items: _suggestions,
                    onTap: _fill,
                  ),
                const SizedBox(height: 24),
                Expanded(
                  child: ListView.builder(
                    itemCount: _controllers.length,
                    itemBuilder: (context, index) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _controllers[index],
                                decoration: InputDecoration(
                                  hintText: 'Nom du médicament',
                                  suffixIcon: index == 0
                                      ? null
                                      : IconButton(
                                          onPressed: () => _removeRow(index),
                                          icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                                        ),
                                ),
                              ),
                            ),
                            if (index == _controllers.length - 1) ...[
                              const SizedBox(width: 8),
                              IconButton(
                                onPressed: _addRow,
                                icon: Icon(Icons.add_circle_outline, color: AppColors.accent),
                              ),
                            ],
                          ],
                        ),
                      );
                    },
                  ),
                ),
                Container(
                  width: double.infinity,
                  height: 56,
                  decoration: AppTheme.gradientButton,
                  child: ElevatedButton.icon(
                    onPressed: _submitting ? null : _submit,
                    icon: _submitting
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.search, color: Colors.white),
                    label: const Text('Trouver une pharmacie'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.transparent,
                      shadowColor: Colors.transparent,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
                    ),
                  ),
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Suggestions extends StatelessWidget {
  final List<String> items;
  final void Function(String) onTap;

  const _Suggestions({required this.items, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: items.map((s) {
        return GestureDetector(
          onTap: () => onTap(s),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: AppColors.surfaceLight,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.border),
            ),
            child: Text(
              s,
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
          ),
        );
      }).toList(),
    );
  }
}

