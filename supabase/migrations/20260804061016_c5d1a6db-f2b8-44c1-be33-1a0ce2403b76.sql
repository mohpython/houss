
-- 1. practitioners.claim_email : privilèges au niveau colonne (comme pharmacies.claim_email)
REVOKE SELECT ON public.practitioners FROM anon, authenticated;
GRANT SELECT (
  id, user_id, type, full_name, specialty_code, license_number, phone, address, city,
  lat, lng, opening_hours, home_visits, consultation_fee, is_available, status, bio,
  created_at, updated_at
) ON public.practitioners TO anon, authenticated;

-- 2. Tables WhatsApp : service role uniquement (fail-closed pour anon/authenticated)
REVOKE ALL ON public.whatsapp_events FROM anon, authenticated;
REVOKE ALL ON public.whatsapp_sessions FROM anon, authenticated;
GRANT ALL ON public.whatsapp_events TO service_role;
GRANT ALL ON public.whatsapp_sessions TO service_role;
ALTER TABLE public.whatsapp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- 3. Fonctions SECURITY DEFINER de trigger : non appelables par anon/authenticated
REVOKE EXECUTE ON FUNCTION public.guard_practitioner_exclusivity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_courier_role_exclusivity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_pharmacy_owner_exclusivity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_pharmacy_staff_exclusivity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.appointments_notify() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.reservations_notify() FROM PUBLIC, anon, authenticated;
