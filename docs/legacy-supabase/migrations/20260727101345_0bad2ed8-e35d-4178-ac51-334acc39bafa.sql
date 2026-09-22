
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
