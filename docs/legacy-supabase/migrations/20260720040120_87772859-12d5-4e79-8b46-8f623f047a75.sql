
-- 1) Private schema for security-definer helpers (not exposed via PostgREST)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- 2) Recreate helpers in private schema
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION private.is_pharmacy_member(_user_id uuid, _pharmacy_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pharmacies WHERE id = _pharmacy_id AND owner_user_id = _user_id
    UNION
    SELECT 1 FROM public.pharmacy_staff WHERE pharmacy_id = _pharmacy_id AND user_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_pharmacy_member(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 3) Recreate all policies to reference private.* helpers
-- user_roles
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- pharmacies
DROP POLICY IF EXISTS "Anyone signed in sees approved pharmacies" ON public.pharmacies;
CREATE POLICY "Anyone signed in sees approved pharmacies" ON public.pharmacies
  FOR SELECT USING (
    status = 'approved'::public.pharmacy_status
    OR owner_user_id = auth.uid()
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Owner or admin updates pharmacy" ON public.pharmacies;
CREATE POLICY "Owner or admin updates pharmacy" ON public.pharmacies
  FOR UPDATE USING (owner_user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (owner_user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admin deletes pharmacy" ON public.pharmacies;
CREATE POLICY "Admin deletes pharmacy" ON public.pharmacies
  FOR DELETE USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- pharmacy_staff
DROP POLICY IF EXISTS "Staff read own memberships" ON public.pharmacy_staff;
CREATE POLICY "Staff read own memberships" ON public.pharmacy_staff
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.pharmacies p WHERE p.id = pharmacy_staff.pharmacy_id AND p.owner_user_id = auth.uid())
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Owner manages staff" ON public.pharmacy_staff;
CREATE POLICY "Owner manages staff" ON public.pharmacy_staff
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.pharmacies p WHERE p.id = pharmacy_staff.pharmacy_id AND p.owner_user_id = auth.uid())
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.pharmacies p WHERE p.id = pharmacy_staff.pharmacy_id AND p.owner_user_id = auth.uid())
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- medicines
DROP POLICY IF EXISTS "Admins manage medicines" ON public.medicines;
CREATE POLICY "Admins manage medicines" ON public.medicines
  FOR ALL USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- inventory
DROP POLICY IF EXISTS "Signed-in users read inventory of approved pharmacies" ON public.inventory;
CREATE POLICY "Signed-in users read inventory of approved pharmacies" ON public.inventory
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.pharmacies p
      WHERE p.id = inventory.pharmacy_id
      AND (p.status = 'approved'::public.pharmacy_status OR p.owner_user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

DROP POLICY IF EXISTS "Pharmacy staff manage inventory" ON public.inventory;
CREATE POLICY "Pharmacy staff manage inventory" ON public.inventory
  FOR ALL USING (private.is_pharmacy_member(auth.uid(), pharmacy_id) OR private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.is_pharmacy_member(auth.uid(), pharmacy_id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- prescriptions
DROP POLICY IF EXISTS "Patient reads own prescriptions" ON public.prescriptions;
CREATE POLICY "Patient reads own prescriptions" ON public.prescriptions
  FOR SELECT USING (patient_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- prescription_items
DROP POLICY IF EXISTS "Patient reads own items" ON public.prescription_items;
CREATE POLICY "Patient reads own items" ON public.prescription_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_items.prescription_id
      AND (p.patient_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

-- reservations
DROP POLICY IF EXISTS "Patient reads own reservations" ON public.reservations;
CREATE POLICY "Patient reads own reservations" ON public.reservations
  FOR SELECT USING (
    patient_id = auth.uid()
    OR private.is_pharmacy_member(auth.uid(), pharmacy_id)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Patient or pharmacy updates reservation" ON public.reservations;
CREATE POLICY "Patient or pharmacy updates reservation" ON public.reservations
  FOR UPDATE USING (
    patient_id = auth.uid()
    OR private.is_pharmacy_member(auth.uid(), pharmacy_id)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    patient_id = auth.uid()
    OR private.is_pharmacy_member(auth.uid(), pharmacy_id)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- reservation_items
DROP POLICY IF EXISTS "Access reservation items via reservation" ON public.reservation_items;
CREATE POLICY "Access reservation items via reservation" ON public.reservation_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_items.reservation_id
      AND (r.patient_id = auth.uid() OR private.is_pharmacy_member(auth.uid(), r.pharmacy_id) OR private.has_role(auth.uid(), 'admin'::public.app_role))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_items.reservation_id
      AND (r.patient_id = auth.uid() OR private.is_pharmacy_member(auth.uid(), r.pharmacy_id) OR private.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

-- audit_logs
DROP POLICY IF EXISTS "Users read own audit logs" ON public.audit_logs;
CREATE POLICY "Users read own audit logs" ON public.audit_logs
  FOR SELECT USING (actor_user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- couriers
DROP POLICY IF EXISTS "courier read own" ON public.couriers;
CREATE POLICY "courier read own" ON public.couriers
  FOR SELECT USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "courier update own or admin" ON public.couriers;
CREATE POLICY "courier update own or admin" ON public.couriers
  FOR UPDATE USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "courier read for assigned reservation" ON public.couriers;
CREATE POLICY "courier read for assigned reservation" ON public.couriers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.courier_id = couriers.id
      AND (r.patient_id = auth.uid() OR private.is_pharmacy_member(auth.uid(), r.pharmacy_id))
    )
  );

-- courier_positions
DROP POLICY IF EXISTS "position read for related" ON public.courier_positions;
CREATE POLICY "position read for related" ON public.courier_positions
  FOR SELECT USING (
    courier_id IN (SELECT id FROM public.couriers WHERE user_id = auth.uid())
    OR reservation_id IN (
      SELECT r.id FROM public.reservations r
      WHERE r.patient_id = auth.uid() OR private.is_pharmacy_member(auth.uid(), r.pharmacy_id)
    )
  );

-- 4) Drop the exposed public helpers now that all policies use private.*
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_pharmacy_member(uuid, uuid);

-- 5) Lock down remaining SECURITY DEFINER trigger helpers (triggers still fire as table owner)
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 6) Storage: add missing owner-scoped UPDATE policy for prescriptions bucket
DROP POLICY IF EXISTS "Patients can update own prescription files" ON storage.objects;
CREATE POLICY "Patients can update own prescription files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'prescriptions' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'prescriptions' AND (storage.foldername(name))[1] = auth.uid()::text);
