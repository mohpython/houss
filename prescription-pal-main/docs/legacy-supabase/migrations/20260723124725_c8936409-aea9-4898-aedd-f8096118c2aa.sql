
-- Language on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'fr';

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications(user_id, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_select_own" ON public.notifications;
CREATE POLICY "notif_select_own" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_delete_own" ON public.notifications;
CREATE POLICY "notif_delete_own" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Notify helper
CREATE OR REPLACE FUNCTION private.notify(_user_id UUID, _type TEXT, _data JSONB DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications(user_id, type, data) VALUES (_user_id, _type, COALESCE(_data, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION private.notify(UUID, TEXT, JSONB) FROM PUBLIC;

-- Trigger on reservations
CREATE OR REPLACE FUNCTION private.reservations_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_id UUID;
  payload JSONB;
BEGIN
  payload := jsonb_build_object('reservation_id', NEW.id, 'pharmacy_id', NEW.pharmacy_id);

  IF TG_OP = 'INSERT' THEN
    -- Notify pharmacy staff
    FOR staff_id IN SELECT user_id FROM public.pharmacy_staff WHERE pharmacy_id = NEW.pharmacy_id LOOP
      PERFORM private.notify(staff_id, 'new_reservation', payload);
    END LOOP;
    -- Notify patient
    PERFORM private.notify(NEW.user_id, 'reservation_created', payload);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'accepted' THEN
        PERFORM private.notify(NEW.user_id, 'reservation_accepted', payload);
      ELSIF NEW.status = 'rejected' THEN
        PERFORM private.notify(NEW.user_id, 'reservation_rejected', payload);
      ELSIF NEW.status = 'ready' THEN
        PERFORM private.notify(NEW.user_id, 'reservation_ready', payload);
      END IF;
    END IF;

    IF NEW.courier_id IS DISTINCT FROM OLD.courier_id AND NEW.courier_id IS NOT NULL THEN
      PERFORM private.notify(NEW.user_id, 'courier_assigned', payload);
      -- Notify courier user
      PERFORM private.notify((SELECT user_id FROM public.couriers WHERE id = NEW.courier_id), 'new_delivery', payload);
    END IF;

    IF NEW.delivery_status IS DISTINCT FROM OLD.delivery_status THEN
      IF NEW.delivery_status = 'picked_up' THEN
        PERFORM private.notify(NEW.user_id, 'courier_picked_up', payload);
      ELSIF NEW.delivery_status = 'delivered' THEN
        PERFORM private.notify(NEW.user_id, 'delivered', payload);
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reservations_notify_trg ON public.reservations;
CREATE TRIGGER reservations_notify_trg
AFTER INSERT OR UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION private.reservations_notify();
