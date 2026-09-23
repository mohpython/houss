REVOKE EXECUTE ON FUNCTION public.enforce_reservation_update_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_appointment_update_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.changed_columns(jsonb, jsonb) FROM PUBLIC, anon, authenticated;