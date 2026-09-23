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
  when_txt := COALESCE(to_char(COALESCE(NEW.scheduled_at, NEW.proposed_at) AT TIME ZONE 'Africa/Bamako', 'DD/MM/YYYY à HH24hMI'), '');
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

  -- Manual reminder sent by the practitioner
  IF TG_OP = 'UPDATE' AND NEW.last_reminder_at IS DISTINCT FROM OLD.last_reminder_at AND NEW.last_reminder_at IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (NEW.patient_id, 'appointment_reminder', 'Rappel de ' || display_name,
            CASE WHEN NEW.status = 'completed'
              THEN display_name || ' vous demande de confirmer la fin de votre consultation dans l''application.'
              WHEN NEW.status = 'rescheduled'
              THEN display_name || ' attend votre réponse pour la date proposée' || CASE WHEN when_txt <> '' THEN ' (' || when_txt || ')' ELSE '' END || '.'
              ELSE display_name || ' vous rappelle votre rendez-vous' || CASE WHEN when_txt <> '' THEN ' du ' || when_txt ELSE '' END || '.' END,
            jsonb_build_object('appointment_id', NEW.id, 'for', 'patient', 'reminder', 'manual'));
  END IF;

  -- Patient confirmed attendance (legacy, kept for backward compatibility)
  IF TG_OP = 'UPDATE' AND NEW.patient_ack_at IS DISTINCT FROM OLD.patient_ack_at AND NEW.patient_ack_at IS NOT NULL AND prac_user IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (prac_user, 'appointment_patient_confirmed', 'Présence confirmée',
            COALESCE(patient_name, 'Le patient') || ' a confirmé sa présence' || CASE WHEN when_txt <> '' THEN ' pour le ' || when_txt ELSE '' END || '.',
            jsonb_build_object('appointment_id', NEW.id, 'for', 'practitioner', 'ack', true));
  END IF;

  -- Patient confirmed the consultation took place
  IF TG_OP = 'UPDATE' AND NEW.patient_completed_at IS DISTINCT FROM OLD.patient_completed_at AND NEW.patient_completed_at IS NOT NULL AND prac_user IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (prac_user, 'appointment_patient_confirmed', 'Consultation confirmée par le patient',
            COALESCE(patient_name, 'Le patient') || ' a confirmé que la consultation a bien eu lieu.',
            jsonb_build_object('appointment_id', NEW.id, 'for', 'practitioner', 'completed', true));
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelled' THEN
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
        WHEN 'accepted' THEN display_name || ' a accepté votre rendez-vous' || CASE WHEN when_txt <> '' THEN ' prévu le ' || when_txt ELSE '' END || CASE WHEN NEW.at_home THEN ' (à domicile)' ELSE '' END || '.'
        WHEN 'rescheduled' THEN display_name || ' vous propose le ' || when_txt || '. Confirmez dans l''application.'
        WHEN 'rejected' THEN display_name || ' ne peut pas prendre ce rendez-vous' || CASE WHEN NEW.rejection_reason IS NOT NULL THEN ' : ' || NEW.rejection_reason ELSE '.' END
        WHEN 'completed' THEN display_name || ' a terminé votre consultation.' || CASE WHEN jsonb_array_length(NEW.prescribed_items) > 0 THEN ' Une ordonnance est disponible.' ELSE '' END || ' Merci de confirmer dans l''application.'
        ELSE display_name || ' : ' || NEW.status::text END,
      jsonb_build_object('appointment_id', NEW.id, 'status', NEW.status::text, 'for', 'patient',
                         'has_prescription', jsonb_array_length(NEW.prescribed_items) > 0)
    );
  END IF;

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