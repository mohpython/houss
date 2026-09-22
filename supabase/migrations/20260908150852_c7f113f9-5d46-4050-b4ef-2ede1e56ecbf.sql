GRANT EXECUTE ON FUNCTION private.is_user_courier(uuid,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.user_can_view_courier(uuid,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.user_can_view_reservation(uuid,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.user_can_view_active_delivery(uuid, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_user_practitioner(uuid,uuid) TO anon, authenticated;