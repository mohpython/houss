import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/l10n/app_locale.dart';
import 'package:saha_sante/core/models/pharmacy.dart';
import 'package:saha_sante/core/services/api_service.dart';
import 'package:saha_sante/core/services/location_service.dart';

/// Annuaire des pharmacies partenaires, dans le meme langage visuel que le
/// nouvel accueil (fond vert profond + icones 3D).
class PharmaciesScreen extends StatefulWidget {
  const PharmaciesScreen({super.key});

  @override
  State<PharmaciesScreen> createState() => _PharmaciesScreenState();
}

class _PharmaciesScreenState extends State<PharmaciesScreen> {
  List<Pharmacy>? _items;
  bool _loading = true;
  String? _error;
  String _query = '';
  final _search = TextEditingController();

  static const _bg = Color(0xFF04150F);
  static const _card = Color(0xCC0A2A20);
  static const _border = Color(0x331F7A57);
  static const _mint = Color(0xFF34E3A4);
  static const _mintSoft = Color(0xFF9AD9C2);
  static const _text = Color(0xFFF4FBF7);
  static const _muted = Color(0xFF8FB8A8);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final position = await LocationService.current();
      final data = await ApiService.instance.getPharmacies(
        lat: position?.latitude,
        lng: position?.longitude,
      );
      if (!mounted) return;
      setState(() {
        _items = data;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = L10n.c('home.loadFailed');
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    L10n.bind(context);
    final q = _query.trim().toLowerCase();
    final items = (_items ?? const <Pharmacy>[])
        .where(
          (p) =>
              q.isEmpty ||
              p.name.toLowerCase().contains(q) ||
              p.address.toLowerCase().contains(q) ||
              p.neighborhood.toLowerCase().contains(q),
        )
        .toList(growable: false);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: _bg,
      ),
      child: Scaffold(
        backgroundColor: _bg,
        body: Stack(
          children: [
            Positioned(
              top: -140,
              right: -100,
              child: _glow(const Color(0x5534E3A4), 320),
            ),
            Positioned(
              bottom: -120,
              left: -100,
              child: _glow(const Color(0x2210B981), 280),
            ),
            SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 8, 18, 0),
                    child: Row(
                      children: [
                        _circleButton(
                          icon: Icons.arrow_back_rounded,
                          onTap: () => context.pop(),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                L10n.t(context, 'home.pharmacies'),
                                style: const TextStyle(
                                  color: _text,
                                  fontSize: 22,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              Text(
                                L10n.tArgs(context, 'home.nearby', {
                                  'count': '${_items?.length ?? 0}',
                                }),
                                style: const TextStyle(
                                  color: _mintSoft,
                                  fontSize: 11.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Image.asset(
                          'assets/icons3d/pharmacy.png',
                          width: 42,
                          height: 42,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 18),
                    child: TextField(
                      controller: _search,
                      onChanged: (v) => setState(() => _query = v),
                      style: const TextStyle(color: _text, fontSize: 14),
                      decoration: InputDecoration(
                        hintText: L10n.t(context, 'home.searchHint'),
                        hintStyle: const TextStyle(color: _muted, fontSize: 13),
                        prefixIcon: const Icon(
                          Icons.search_rounded,
                          color: _muted,
                        ),
                        filled: true,
                        fillColor: _card,
                        contentPadding: const EdgeInsets.symmetric(
                          vertical: 12,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                          borderSide: const BorderSide(color: _border),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                          borderSide: const BorderSide(color: _border),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                          borderSide: const BorderSide(color: _mint),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: RefreshIndicator(
                      color: _mint,
                      backgroundColor: _card,
                      onRefresh: _load,
                      child: _loading
                          ? const Center(
                              child: CircularProgressIndicator(color: _mint),
                            )
                          : _error != null
                          ? ListView(
                              padding: const EdgeInsets.fromLTRB(
                                18,
                                20,
                                18,
                                30,
                              ),
                              children: [_emptyCard(_error!, retry: _load)],
                            )
                          : items.isEmpty
                          ? ListView(
                              padding: const EdgeInsets.fromLTRB(
                                18,
                                20,
                                18,
                                30,
                              ),
                              children: [
                                _emptyCard(
                                  L10n.t(context, 'home.noPharmacy'),
                                  retry: _load,
                                ),
                              ],
                            )
                          : ListView.separated(
                              padding: const EdgeInsets.fromLTRB(18, 4, 18, 30),
                              itemCount: items.length + 1,
                              separatorBuilder: (_, __) =>
                                  const SizedBox(height: 10),
                              itemBuilder: (context, index) {
                                if (index == 0) {
                                  return Padding(
                                    padding: const EdgeInsets.only(bottom: 4),
                                    child: _scanCard(context),
                                  );
                                }
                                return _PharmacyTile(
                                  pharmacy: items[index - 1],
                                );
                              },
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _scanCard(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0F5E43), Color(0xFF0A3527)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0x552EE59D)),
      ),
      child: Row(
        children: [
          Image.asset('assets/icons3d/robot.png', width: 38, height: 38),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              L10n.t(context, 'home.heroDesc'),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: _mintSoft,
                fontSize: 11.5,
                height: 1.3,
              ),
            ),
          ),
          const SizedBox(width: 8),
          InkWell(
            onTap: () => context.push('/scan'),
            borderRadius: BorderRadius.circular(20),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: _mint,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Icon(
                Icons.camera_alt_rounded,
                color: Color(0xFF04291C),
                size: 20,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _emptyCard(String message, {required VoidCallback retry}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: _card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _border),
      ),
      child: Column(
        children: [
          const Icon(Icons.wifi_off_rounded, size: 32, color: _muted),
          const SizedBox(height: 10),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: _mintSoft, fontSize: 12.5),
          ),
          TextButton.icon(
            onPressed: retry,
            icon: const Icon(Icons.refresh_rounded, color: _mint),
            label: Text(
              L10n.c('common.retry'),
              style: const TextStyle(color: _mint),
            ),
          ),
        ],
      ),
    );
  }

  Widget _circleButton({required IconData icon, required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: _card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _border),
        ),
        child: Icon(icon, color: _text, size: 21),
      ),
    );
  }

  Widget _glow(Color color, double size) {
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

class _PharmacyTile extends StatelessWidget {
  const _PharmacyTile({required this.pharmacy});

  final Pharmacy pharmacy;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: const Color(0xCC0A2A20),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0x331F7A57)),
      ),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Image.asset('assets/icons3d/pharmacy.png'),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  pharmacy.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Color(0xFFF4FBF7),
                    fontSize: 14.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  pharmacy.address.isEmpty
                      ? pharmacy.neighborhood
                      : pharmacy.address,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Color(0xFF8FB8A8),
                    fontSize: 11.5,
                  ),
                ),
                const SizedBox(height: 5),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 7,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: pharmacy.statusColor.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        pharmacy.statusLabel,
                        style: TextStyle(
                          color: pharmacy.statusColor,
                          fontSize: 9.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    if (pharmacy.distanceKm > 0) ...[
                      const SizedBox(width: 8),
                      const Icon(
                        Icons.location_on_rounded,
                        size: 12,
                        color: Color(0xFF34E3A4),
                      ),
                      Text(
                        pharmacy.distanceLabel,
                        style: const TextStyle(
                          color: Color(0xFF34E3A4),
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: Color(0xFF8FB8A8)),
        ],
      ),
    );
  }
}
