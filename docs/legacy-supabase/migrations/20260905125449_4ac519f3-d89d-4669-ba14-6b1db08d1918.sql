ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS prescribed_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reminders_sent jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS appointments_status_sched_idx ON public.appointments(status, scheduled_at);

-- Readable lifecycle notifications, routed to the right person
CREATE OR REPLACE FUNCTION private.appointments_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prac_user uuid;
  prac_name text;
  prac_type public.practitioner_type;
  display_name text;
  when_txt text;
  patient_name text;
BEGIN
  SELECT p.user_id, p.full_name, p.type INTO prac_user, prac_name, prac_type
  FROM public.practitioners p WHERE p.id = NEW.practitioner_id;
  display_name := CASE WHEN prac_type = 'doctor' THEN 'Dr ' || COALESCE(prac_name, '') ELSE COALESCE(prac_name, 'Praticien') END;
  when_txt := COALESCE(to_char(COALESCE(NEW.scheduled_at, NEW.proposed_at) AT TIME ZONE 'Africa/Bamako', 'DD/MM à HH24hMI'), '');
  SELECT COALESCE(NULLIF(pr.full_name, ''), 'Un patient') INTO patient_name FROM public.profiles pr WHERE pr.id = NEW.patient_id;

  IF TG_OP = 'INSERT' THEN
    IF prac_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (prac_user, 'appointment_requested', 'Nouvelle demande de rendez-vous',
              COALESCE(patient_name, 'Un patient') || ' — ' || COALESCE(NEW.reason, 'Consultation') || CASE WHEN NEW.at_home THEN ' (à domicile)' ELSE '' END,
              jsonb_build_object('appointment_id', NEW.id, 'for', 'practitioner'));
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelled' THEN
      -- patient cancelled: tell the practitioner
      IF prac_user IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (prac_user, 'appointment_cancelled', 'Rendez-vous annulé',
                COALESCE(patient_name, 'Le patient') || ' a annulé sa demande' || CASE WHEN when_txt <> '' THEN ' du ' || when_txt ELSE '' END || '.',
                jsonb_build_object('appointment_id', NEW.id, 'status', 'cancelled', 'for', 'practitioner'));
      END IF;
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.patient_id,
      'appointment_' || NEW.status::text,
      CASE NEW.status
        WHEN 'accepted' THEN 'Rendez-vous confirmé'
        WHEN 'rescheduled' THEN 'Nouvelle date proposée'
        WHEN 'rejected' THEN 'Demande refusée'
        WHEN 'completed' THEN 'Consultation terminée'
        ELSE 'Rendez-vous mis à jour' END,
      CASE NEW.status
        WHEN 'accepted' THEN display_name || ' a accepté votre rendez-vous' || CASE WHEN when_txt <> '' THEN ' le ' || when_txt ELSE '' END || '.'
        WHEN 'rescheduled' THEN display_name || ' vous propose le ' || when_txt || '. Confirmez dans l''application.'
        WHEN 'rejected' THEN display_name || ' ne peut pas prendre ce rendez-vous' || CASE WHEN NEW.rejection_reason IS NOT NULL THEN ' : ' || NEW.rejection_reason ELSE '.' END
        WHEN 'completed' THEN display_name || ' a terminé votre consultation.' || CASE WHEN jsonb_array_length(NEW.prescribed_items) > 0 THEN ' Une ordonnance est disponible.' ELSE '' END
        ELSE display_name || ' : ' || NEW.status::text END,
      jsonb_build_object('appointment_id', NEW.id, 'status', NEW.status::text, 'for', 'patient',
                         'has_prescription', jsonb_array_length(NEW.prescribed_items) > 0)
    );
  END IF;

  -- patient accepted a proposed date (status stays accepted but scheduled_at changed by patient)
  IF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status = 'rescheduled' AND prac_user IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (prac_user, 'appointment_patient_confirmed', 'Date confirmée par le patient',
            COALESCE(patient_name, 'Le patient') || ' a confirmé le rendez-vous du ' || when_txt || '.',
            jsonb_build_object('appointment_id', NEW.id, 'for', 'practitioner'));
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.appointments_notify() FROM PUBLIC, anon, authenticated;

-- Hourly reminders (idempotent via reminders_sent)
CREATE OR REPLACE FUNCTION private.send_appointment_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a record;
  prac_user uuid;
  prac_name text;
  prac_type public.practitioner_type;
  display_name text;
  when_txt text;
  patient_name text;
  key text;
  hours_left numeric;
  adm record;
BEGIN
  -- Upcoming appointments: day-before (24h) and soon (~1h)
  FOR a IN
    SELECT * FROM public.appointments
    WHERE status = 'accepted' AND scheduled_at IS NOT NULL
      AND scheduled_at > now() AND scheduled_at < now() + interval '25 hours'
  LOOP
    hours_left := EXTRACT(EPOCH FROM (a.scheduled_at - now())) / 3600;
    key := CASE WHEN hours_left <= 2 THEN 'soon' WHEN hours_left >= 20 THEN 'day_before' ELSE NULL END;
    IF key IS NULL OR (a.reminders_sent ? key) THEN CONTINUE; END IF;

    SELECT p.user_id, p.full_name, p.type INTO prac_user, prac_name, prac_type FROM public.practitioners p WHERE p.id = a.practitioner_id;
    display_name := CASE WHEN prac_type = 'doctor' THEN 'Dr ' || COALESCE(prac_name, '') ELSE COALESCE(prac_name, 'Praticien') END;
    when_txt := to_char(a.scheduled_at AT TIME ZONE 'Africa/Bamako', 'DD/MM à HH24hMI');
    SELECT COALESCE(NULLIF(pr.full_name, ''), 'Un patient') INTO patient_name FROM public.profiles pr WHERE pr.id = a.patient_id;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (a.patient_id, 'appointment_reminder',
            CASE WHEN key = 'soon' THEN 'Rendez-vous dans environ 1 h' ELSE 'Rappel : rendez-vous demain' END,
            'Avec ' || display_name || ' le ' || when_txt || CASE WHEN a.at_home THEN ' (à domicile)' ELSE '' END || '.',
            jsonb_build_object('appointment_id', a.id, 'for', 'patient', 'reminder', key));
    IF prac_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (prac_user, 'appointment_reminder',
              CASE WHEN key = 'soon' THEN 'Patient dans environ 1 h' ELSE 'Rappel : consultation demain' END,
              COALESCE(patient_name, 'Patient') || ' — ' || COALESCE(a.reason, 'Consultation') || ' le ' || when_txt || CASE WHEN a.at_home THEN ' (visite à domicile)' ELSE '' END || '.',
              jsonb_build_object('appointment_id', a.id, 'for', 'practitioner', 'reminder', key));
    END IF;

    UPDATE public.appointments SET reminders_sent = reminders_sent || jsonb_build_object(key, now()) WHERE id = a.id;
  END LOOP;

  -- Pending requests: nudge practitioner every 2h, alert admins after 24h
  FOR a IN
    SELECT * FROM public.appointments
    WHERE status = 'requested' AND requested_at < now() - interval '2 hours'
  LOOP
    SELECT p.user_id, p.full_name INTO prac_user, prac_name FROM public.practitioners p WHERE p.id = a.practitioner_id;
    SELECT COALESCE(NULLIF(pr.full_name, ''), 'Un patient') INTO patient_name FROM public.profiles pr WHERE pr.id = a.patient_id;

    IF prac_user IS NOT NULL AND (
         NOT (a.reminders_sent ? 'pending_last')
         OR (a.reminders_sent->>'pending_last')::timestamptz < now() - interval '2 hours') THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (prac_user, 'appointment_pending', 'Demande en attente de réponse',
              COALESCE(patient_name, 'Un patient') || ' attend votre réponse depuis ' || GREATEST(1, floor(EXTRACT(EPOCH FROM (now() - a.requested_at)) / 3600))::text || ' h.',
              jsonb_build_object('appointment_id', a.id, 'for', 'practitioner'));
      UPDATE public.appointments SET reminders_sent = reminders_sent || jsonb_build_object('pending_last', now()) WHERE id = a.id;
    END IF;

    IF a.requested_at < now() - interval '24 hours' AND NOT (a.reminders_sent ? 'admin_alert') THEN
      FOR adm IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (adm.user_id, 'appointment_unanswered', 'Praticien sans réponse',
                COALESCE(prac_name, 'Un praticien') || ' n''a pas répondu à une demande depuis plus de 24 h.',
                jsonb_build_object('appointment_id', a.id, 'practitioner_id', a.practitioner_id, 'for', 'admin'));
      END LOOP;
      UPDATE public.appointments SET reminders_sent = reminders_sent || jsonb_build_object('admin_alert', now()) WHERE id = a.id;
    END IF;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.send_appointment_reminders() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'appointment-reminders-hourly';
SELECT cron.schedule('appointment-reminders-hourly', '5 * * * *', $$SELECT private.send_appointment_reminders();$$);