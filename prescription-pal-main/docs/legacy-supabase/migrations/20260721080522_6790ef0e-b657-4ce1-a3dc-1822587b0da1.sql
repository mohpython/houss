
-- Break recursion: reservations <-> couriers cross-reference via SECURITY DEFINER helpers
CREATE OR REPLACE FUNCTION private.is_user_courier(_user_id uuid, _courier_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.couriers WHERE id = _courier_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION private.user_can_view_courier(_user_id uuid, _courier_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.courier_id = _courier_id
      AND (r.patient_id = _user_id OR private.is_pharmacy_member(_user_id, r.pharmacy_id))
  );
$$;

CREATE OR REPLACE FUNCTION private.user_can_view_reservation(_user_id uuid, _reservation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.id = _reservation_id
      AND (r.patient_id = _user_id OR private.is_pharmacy_member(_user_id, r.pharmacy_id))
  );
$$;

REVOKE ALL ON FUNCTION private.is_user_courier(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.user_can_view_courier(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.user_can_view_reservation(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_user_courier(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_can_view_courier(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_can_view_reservation(uuid,uuid) TO authenticated;

DROP POLICY IF EXISTS "courier read assigned reservation" ON public.reservations;
DROP POLICY IF EXISTS "courier update assigned reservation" ON public.reservations;
CREATE POLICY "courier read assigned reservation" ON public.reservations
  FOR SELECT USING (private.is_user_courier(auth.uid(), courier_id));
CREATE POLICY "courier update assigned reservation" ON public.reservations
  FOR UPDATE USING (private.is_user_courier(auth.uid(), courier_id))
  WITH CHECK (private.is_user_courier(auth.uid(), courier_id));

DROP POLICY IF EXISTS "courier read for assigned reservation" ON public.couriers;
CREATE POLICY "courier read for assigned reservation" ON public.couriers
  FOR SELECT USING (private.user_can_view_courier(auth.uid(), id));

DROP POLICY IF EXISTS "position read for related" ON public.courier_positions;
CREATE POLICY "position read for related" ON public.courier_positions
  FOR SELECT USING (
    private.is_user_courier(auth.uid(), courier_id)
    OR (reservation_id IS NOT NULL AND private.user_can_view_reservation(auth.uid(), reservation_id))
  );

-- Allow pharmacy staff (and admins) to read prescription rows for their reservations
DROP POLICY IF EXISTS "Pharmacy reads prescription for reservation" ON public.prescriptions;
CREATE POLICY "Pharmacy reads prescription for reservation" ON public.prescriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.prescription_id = prescriptions.id
        AND (private.is_pharmacy_member(auth.uid(), r.pharmacy_id) OR private.has_role(auth.uid(), 'admin'))
    )
  );

-- Storage: allow pharmacy staff to read prescription files for their reservations
DROP POLICY IF EXISTS "Pharmacy read prescription files" ON storage.objects;
CREATE POLICY "Pharmacy read prescription files" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'prescriptions' AND EXISTS (
      SELECT 1 FROM public.prescriptions p
      JOIN public.reservations r ON r.prescription_id = p.id
      WHERE p.file_path = storage.objects.name
        AND (private.is_pharmacy_member(auth.uid(), r.pharmacy_id) OR private.has_role(auth.uid(), 'admin'))
    )
  );
