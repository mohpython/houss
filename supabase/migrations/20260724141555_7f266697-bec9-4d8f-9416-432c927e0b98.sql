
-- Tighten courier visibility to active deliveries only
CREATE OR REPLACE FUNCTION private.user_can_view_courier(_user_id uuid, _courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.courier_id = _courier_id
      AND r.delivery_status IN ('assigned','picked_up','en_route')
      AND (r.patient_id = _user_id OR private.is_pharmacy_member(_user_id, r.pharmacy_id))
  );
$$;

-- Tighten reservation visibility used by courier_positions realtime to active deliveries only.
-- Kept broader user_can_view_reservation for the reservations table; introduce a dedicated helper
-- specifically for live position streams.
CREATE OR REPLACE FUNCTION private.user_can_view_active_delivery(_user_id uuid, _reservation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.id = _reservation_id
      AND r.delivery_status IN ('assigned','picked_up','en_route')
      AND (r.patient_id = _user_id OR private.is_pharmacy_member(_user_id, r.pharmacy_id))
  );
$$;

REVOKE ALL ON FUNCTION private.user_can_view_active_delivery(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.user_can_view_active_delivery(uuid, uuid) TO authenticated;

-- Replace courier_positions SELECT policy to use the tighter active-delivery helper
DROP POLICY IF EXISTS "position read for related" ON public.courier_positions;
CREATE POLICY "position read for related"
ON public.courier_positions
FOR SELECT
TO authenticated
USING (
  private.is_user_courier(auth.uid(), courier_id)
  OR (reservation_id IS NOT NULL AND private.user_can_view_active_delivery(auth.uid(), reservation_id))
);
