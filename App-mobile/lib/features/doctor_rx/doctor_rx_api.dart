import 'package:saha_sante/core/api/api_client.dart';
import 'package:saha_sante/core/services/auth_service.dart';

/// Accès REST à l'e-ordonnance native : même moteur serveur que le portail web,
/// mais sans ouvrir le navigateur.
class DoctorRxApi {
  DoctorRxApi._();

  static ApiClient get _api => AuthService.instance.api;

  static Future<Map<String, dynamic>> session() => _api.get('/doctor-rx/session');

  static Future<Map<String, dynamic>> dashboard() => _api.get('/doctor-rx/dashboard');

  static Future<List<Map<String, dynamic>>> patients() async {
    final data = await _api.get('/doctor-rx/patients');
    return ((data['patients'] as List?) ?? const []).cast<Map<String, dynamic>>();
  }

  static Future<List<Map<String, dynamic>>> searchPatients(String query) async {
    final data = await _api.post('/doctor-rx/patients/search', {'query': query});
    return ((data['patients'] as List?) ?? const []).cast<Map<String, dynamic>>();
  }

  static Future<Map<String, dynamic>> getPatient(String id) =>
      _api.post('/doctor-rx/patients/get', {'patientId': id});

  static Future<List<Map<String, dynamic>>> listPrescriptions({
    String status = 'all',
    String query = '',
  }) async {
    final data = await _api.post('/doctor-rx/prescriptions/list', {
      'status': status,
      'query': query,
    });
    return ((data['prescriptions'] as List?) ?? const [])
        .cast<Map<String, dynamic>>();
  }

  static Future<Map<String, dynamic>> getPrescription(String id) =>
      _api.post('/doctor-rx/prescriptions/get', {'id': id});

  static Future<Map<String, dynamic>> save(Map<String, dynamic> input) =>
      _api.post('/doctor-rx/prescriptions/save', input);

  static Future<Map<String, dynamic>> sign(String id, String password) =>
      _api.post('/doctor-rx/prescriptions/sign', {'id': id, 'password': password});

  static Future<Map<String, dynamic>> send(String id) =>
      _api.post('/doctor-rx/prescriptions/send', {'id': id});

  static Future<Map<String, dynamic>> pdf(String id) =>
      _api.post('/doctor-rx/prescriptions/pdf', {'id': id});

  static Future<Map<String, dynamic>> qr(String id) =>
      _api.post('/doctor-rx/prescriptions/qr', {'id': id});

  static Future<Map<String, dynamic>> verify(String token) =>
      _api.post('/doctor-rx/verify', {'token': token});
}
