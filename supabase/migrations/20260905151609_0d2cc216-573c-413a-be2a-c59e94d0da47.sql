-- Helper: list of columns whose value changed between OLD and NEW
CREATE OR REPLACE FUNCTION private.changed_columns(old_row jsonb, new_row jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(n.key), '{}'::text[])
  FROM jsonb_each(new_row) n
  WHERE n.value IS DISTINCT FROM (old_row -> n.key);
$$;

-- ===================== RESERVATIONS =====================
CREATE OR REPLACE FUNCTION public.enforce_reservation_update_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  changed text[];
  allowed text[] := ARRAY['updated_at'];
  is_patient boolean := false;
  is_pharmacy boolean := false;
  is_courier boolean := false;
  bad text[];
BEGIN
  -- Service role / internal jobs and admins are unrestricted
  IF uid IS NULL OR private.has_role(uid, 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  changed := private.changed_columns(to_jsonb(OLD), to_jsonb(NEW));
  IF changed = '{}'::text[] THEN RETURN NEW; END IF;

  is_patient := (OLD.patient_id = uid);
  is_pharmacy := private.is_pharmacy_member(uid, OLD.pharmacy_id);
  is_courier := (OLD.courier_id IS NOT NULL AND private.is_user_courier(uid, OLD.courier_id));

  IF is_pharmacy THEN
    allowed := allowed || ARRAY[
      'status','accepted_at','ready_at','delivered_at','picked_up_at','assigned_at',
      'courier_id','delivery_status','payment_status','paid_at','payment_method','payment_reference',
      'pickup_code_verified_at','receipt_code_verified_at','code_attempts',
      'is_partial','missing_items','items_total','delivery_fee','total_amount','notes'
    ];
  END IF;

  IF is_courier THEN
    allowed := allowed || ARRAY[
      'delivery_status','picked_up_at','delivered_at','status','receipt_code_verified_at','code_attempts'
    ];
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'completed' THEN
      RAISE EXCEPTION 'Le livreur ne peut que clôturer la commande.';
    END IF;
  END IF;

  IF is_patient THEN
    allowed := allowed || ARRAY[
      'fulfillment_method','delivery_fee','total_amount',
      'payment_status','payment_method','payment_reference',
      'patient_phone','patient_name','patient_address','patient_lat','patient_lng',
      'neighborhood_id','delivery_mode','notes','status'
    ];
    -- Patient may only declare a payment, never confirm it
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
       AND NOT (OLD.payment_status = 'unpaid' AND NEW.payment_status = 'pending_verification')
       AND NOT is_pharmacy THEN
      RAISE EXCEPTION 'Le paiement ne peut être confirmé que par la pharmacie.';
    END IF;
    -- Patient may only cancel
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' AND NOT is_pharmacy THEN
      RAISE EXCEPTION 'Le patient ne peut qu''annuler sa commande.';
    END IF;
    -- Delivery choice / fee changes only while unpaid and with a consistent total
    IF (NEW.fulfillment_method IS DISTINCT FROM OLD.fulfillment_method
        OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
        OR NEW.total_amount IS DISTINCT FROM OLD.total_amount) AND NOT is_pharmacy THEN
      IF OLD.payment_status <> 'unpaid' THEN
        RAISE EXCEPTION 'Le mode de retrait ne peut plus être modifié après le paiement.';
      END IF;
      IF NEW.delivery_fee NOT IN (0, 1000)
         OR (NEW.fulfillment_method = 'pickup' AND NEW.delivery_fee <> 0)
         OR NEW.total_amount IS DISTINCT FROM (NEW.items_total + NEW.delivery_fee) THEN
        RAISE EXCEPTION 'Montant de commande invalide.';
      END IF;
    END IF;
  END IF;

  IF NOT (is_patient OR is_pharmacy OR is_courier) THEN
    RAISE EXCEPTION 'Non autorisé à modifier cette commande.';
  END IF;

  SELECT COALESCE(array_agg(c), '{}'::text[]) INTO bad
  FROM unnest(changed) c WHERE NOT (c = ANY(allowed));
  IF array_length(bad, 1) > 0 THEN
    RAISE EXCEPTION 'Modification non autorisée des champs: %', array_to_string(bad, ', ');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reservations_enforce_update_columns ON public.reservations;
CREATE TRIGGER reservations_enforce_update_columns
BEFORE UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.enforce_reservation_update_columns();

-- ===================== APPOINTMENTS =====================
CREATE OR REPLACE FUNCTION public.enforce_appointment_update_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  changed text[];
  allowed text[] := ARRAY['updated_at'];
  is_patient boolean := false;
  is_pract boolean := false;
  bad text[];
BEGIN
  IF uid IS NULL OR private.has_role(uid, 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  changed := private.changed_columns(to_jsonb(OLD), to_jsonb(NEW));
  IF changed = '{}'::text[] THEN RETURN NEW; END IF;

  is_patient := (OLD.patient_id = uid);
  is_pract := private.is_user_practitioner(uid, OLD.practitioner_id);

  IF is_pract THEN
    allowed := allowed || ARRAY[
      'status','scheduled_at','proposed_at','practitioner_notes','report','rejection_reason',
      'completed_at','prescribed_items','reminders_sent','last_reminder_at','reminder_count','triage'
    ];
  END IF;

  IF is_patient THEN
    allowed := allowed || ARRAY[
      'status','scheduled_at','patient_ack_at','patient_completed_at',
      'patient_phone','patient_address','patient_lat','patient_lng','symptoms','reason'
    ];
    IF NOT is_pract THEN
      IF NEW.status IS DISTINCT FROM OLD.status
         AND NOT (NEW.status = 'cancelled'
                  OR (OLD.status = 'rescheduled' AND NEW.status = 'accepted')) THEN
        RAISE EXCEPTION 'Le patient ne peut qu''annuler ou accepter une date proposée.';
      END IF;
      IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
         AND NEW.scheduled_at IS DISTINCT FROM OLD.proposed_at THEN
        RAISE EXCEPTION 'La date doit être celle proposée par le praticien.';
      END IF;
    END IF;
  END IF;

  IF NOT (is_patient OR is_pract) THEN
    RAISE EXCEPTION 'Non autorisé à modifier ce rendez-vous.';
  END IF;

  SELECT COALESCE(array_agg(c), '{}'::text[]) INTO bad
  FROM unnest(changed) c WHERE NOT (c = ANY(allowed));
  IF array_length(bad, 1) > 0 THEN
    RAISE EXCEPTION 'Modification non autorisée des champs: %', array_to_string(bad, ', ');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_enforce_update_columns ON public.appointments;
CREATE TRIGGER appointments_enforce_update_columns
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.enforce_appointment_update_columns();

-- ===================== RESERVATION ITEMS =====================
DROP POLICY IF EXISTS "Access reservation items via reservation" ON public.reservation_items;

CREATE POLICY "Reservation items readable by participants"
ON public.reservation_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.reservations r
  WHERE r.id = reservation_items.reservation_id
    AND (r.patient_id = auth.uid()
         OR private.is_pharmacy_member(auth.uid(), r.pharmacy_id)
         OR (r.courier_id IS NOT NULL AND private.is_user_courier(auth.uid(), r.courier_id))
         OR private.has_role(auth.uid(), 'admin'::app_role))
));

CREATE POLICY "Reservation items created by patient or pharmacy"
ON public.reservation_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.reservations r
  WHERE r.id = reservation_items.reservation_id
    AND (r.patient_id = auth.uid()
         OR private.is_pharmacy_member(auth.uid(), r.pharmacy_id)
         OR private.has_role(auth.uid(), 'admin'::app_role))
));

CREATE POLICY "Reservation items updated by pharmacy or admin"
ON public.reservation_items FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.reservations r
  WHERE r.id = reservation_items.reservation_id
    AND (private.is_pharmacy_member(auth.uid(), r.pharmacy_id)
         OR private.has_role(auth.uid(), 'admin'::app_role))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.reservations r
  WHERE r.id = reservation_items.reservation_id
    AND (private.is_pharmacy_member(auth.uid(), r.pharmacy_id)
         OR private.has_role(auth.uid(), 'admin'::app_role))
));

CREATE POLICY "Reservation items deleted by pharmacy or admin"
ON public.reservation_items FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.reservations r
  WHERE r.id = reservation_items.reservation_id
    AND (private.is_pharmacy_member(auth.uid(), r.pharmacy_id)
         OR private.has_role(auth.uid(), 'admin'::app_role))
));