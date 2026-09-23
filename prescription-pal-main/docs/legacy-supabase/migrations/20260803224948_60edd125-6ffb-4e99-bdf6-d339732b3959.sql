CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  claimed_id uuid;
  prac_id uuid;
  prac_type public.practitioner_type;
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone, '')
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'patient')
  ON CONFLICT DO NOTHING;

  IF NEW.email IS NOT NULL THEN
    SELECT p.id INTO claimed_id
    FROM public.pharmacies p
    WHERE p.owner_user_id IS NULL
      AND lower(p.claim_email) = lower(NEW.email)
    ORDER BY p.created_at
    LIMIT 1;

    IF claimed_id IS NOT NULL THEN
      UPDATE public.pharmacies SET owner_user_id = NEW.id, claim_email = NULL WHERE id = claimed_id;
      INSERT INTO public.pharmacy_staff (pharmacy_id, user_id) VALUES (claimed_id, NEW.id)
      ON CONFLICT DO NOTHING;
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'pharmacy_staff')
      ON CONFLICT DO NOTHING;
    END IF;

    SELECT pr.id, pr.type INTO prac_id, prac_type
    FROM public.practitioners pr
    WHERE pr.user_id IS NULL
      AND lower(pr.claim_email) = lower(NEW.email)
    ORDER BY pr.created_at
    LIMIT 1;

    IF prac_id IS NOT NULL THEN
      UPDATE public.practitioners SET user_id = NEW.id, claim_email = NULL WHERE id = prac_id;
      IF prac_type = 'doctor' THEN
        INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'doctor') ON CONFLICT DO NOTHING;
      ELSE
        INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'nurse') ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;