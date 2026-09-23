ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS items_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_payment_status_check;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_payment_status_check
  CHECK (payment_status IN ('unpaid','pending_verification','paid','failed'));

-- Existing reservations were created before payment existed: treat them as paid.
UPDATE public.reservations SET payment_status = 'paid' WHERE payment_status = 'unpaid' AND created_at < now();

ALTER TABLE public.reservation_items
  ADD COLUMN IF NOT EXISTS unit_price numeric;

-- Pharmacy staff only see orders once the patient has declared payment.
DROP POLICY IF EXISTS "Patient reads own reservations" ON public.reservations;
CREATE POLICY "Patient reads own reservations" ON public.reservations
FOR SELECT USING (
  patient_id = auth.uid()
  OR (private.is_pharmacy_member(auth.uid(), pharmacy_id) AND payment_status <> 'unpaid')
  OR private.has_role(auth.uid(), 'admin'::app_role)
);

CREATE OR REPLACE FUNCTION private.reservations_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  recipient_id UUID;
  payload JSONB;
BEGIN
  payload := jsonb_build_object('reservation_id', NEW.id, 'pharmacy_id', NEW.pharmacy_id);

  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_status = 'unpaid' THEN
      RETURN NEW;
    END IF;
    FOR recipient_id IN
      SELECT user_id FROM public.pharmacy_staff WHERE pharmacy_id = NEW.pharmacy_id
      UNION
      SELECT owner_user_id FROM public.pharmacies WHERE id = NEW.pharmacy_id
    LOOP
      PERFORM private.notify(recipient_id, 'new_reservation', payload);
    END LOOP;
    PERFORM private.notify(NEW.patient_id, 'reservation_created', payload);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.payment_status = 'unpaid' AND NEW.payment_status <> 'unpaid' THEN
      FOR recipient_id IN
        SELECT user_id FROM public.pharmacy_staff WHERE pharmacy_id = NEW.pharmacy_id
        UNION
        SELECT owner_user_id FROM public.pharmacies WHERE id = NEW.pharmacy_id
      LOOP
        PERFORM private.notify(recipient_id, 'new_reservation', payload);
      END LOOP;
      PERFORM private.notify(NEW.patient_id, 'reservation_created', payload);
    END IF;

    IF NEW.payment_status = 'unpaid' THEN
      RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'accepted' THEN
        PERFORM private.notify(NEW.patient_id, 'reservation_accepted', payload);
      ELSIF NEW.status = 'rejected' THEN
        PERFORM private.notify(NEW.patient_id, 'reservation_rejected', payload);
      ELSIF NEW.status = 'ready' THEN
        PERFORM private.notify(NEW.patient_id, 'reservation_ready', payload);
      END IF;
    END IF;

    IF NEW.courier_id IS DISTINCT FROM OLD.courier_id AND NEW.courier_id IS NOT NULL THEN
      PERFORM private.notify(NEW.patient_id, 'courier_assigned', payload);
      PERFORM private.notify((SELECT user_id FROM public.couriers WHERE id = NEW.courier_id), 'new_delivery', payload);
    END IF;

    IF NEW.delivery_status IS DISTINCT FROM OLD.delivery_status THEN
      IF NEW.delivery_status = 'picked_up' THEN
        PERFORM private.notify(NEW.patient_id, 'courier_picked_up', payload);
      ELSIF NEW.delivery_status = 'delivered' THEN
        PERFORM private.notify(NEW.patient_id, 'delivered', payload);
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.reservations_notify() FROM PUBLIC, anon, authenticated;