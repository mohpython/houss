-- Harden membership check: strict null guards + staff row must reference an existing pharmacy
CREATE OR REPLACE FUNCTION private.is_pharmacy_member(_user_id uuid, _pharmacy_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND _pharmacy_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pharmacies p
    WHERE p.id = _pharmacy_id AND p.owner_user_id IS NOT NULL AND p.owner_user_id = _user_id
    UNION ALL
    SELECT 1 FROM public.pharmacy_staff s
    JOIN public.pharmacies p2 ON p2.id = s.pharmacy_id
    WHERE s.pharmacy_id = _pharmacy_id AND s.user_id = _user_id
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_user_courier(_user_id uuid, _courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND _courier_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.couriers WHERE id = _courier_id AND user_id = _user_id
  );
$function$;

CREATE OR REPLACE FUNCTION private.user_can_view_courier(_user_id uuid, _courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND _courier_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.courier_id = _courier_id
      AND r.delivery_status IN ('assigned','picked_up','en_route')
      AND (
        (r.patient_id IS NOT NULL AND r.patient_id = _user_id)
        OR private.is_pharmacy_member(_user_id, r.pharmacy_id)
      )
  );
$function$;

-- Active delivery visibility must also be scoped to the specific courier of that reservation
CREATE OR REPLACE FUNCTION private.user_can_view_active_delivery(_user_id uuid, _reservation_id uuid, _courier_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND _reservation_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.id = _reservation_id
      AND r.delivery_status IN ('assigned','picked_up','en_route')
      AND r.courier_id IS NOT NULL
      AND (_courier_id IS NULL OR r.courier_id = _courier_id)
      AND (
        (r.patient_id IS NOT NULL AND r.patient_id = _user_id)
        OR private.is_pharmacy_member(_user_id, r.pharmacy_id)
      )
  );
$function$;

REVOKE ALL ON FUNCTION private.user_can_view_active_delivery(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Restrict courier realtime/PII reads to authenticated users only
DROP POLICY IF EXISTS "courier read for assigned reservation" ON public.couriers;
CREATE POLICY "courier read for assigned reservation"
ON public.couriers FOR SELECT TO authenticated
USING (private.user_can_view_courier(auth.uid(), id));

DROP POLICY IF EXISTS "courier read own" ON public.couriers;
CREATE POLICY "courier read own"
ON public.couriers FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "courier update own or admin" ON public.couriers;
CREATE POLICY "courier update own or admin"
ON public.couriers FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role));

-- GPS positions: viewer must be the courier, or tied to an active delivery served by THAT courier
DROP POLICY IF EXISTS "position read for related" ON public.courier_positions;
CREATE POLICY "position read for related"
ON public.courier_positions FOR SELECT TO authenticated
USING (
  private.is_user_courier(auth.uid(), courier_id)
  OR (
    reservation_id IS NOT NULL
    AND private.user_can_view_active_delivery(auth.uid(), reservation_id, courier_id)
  )
);
