-- 1. owner nullable + claim_email
ALTER TABLE public.pharmacies ALTER COLUMN owner_user_id DROP NOT NULL;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS claim_email text;

-- 2. detach pharmacies currently owned by an admin account
UPDATE public.pharmacies p
SET owner_user_id = NULL
WHERE p.owner_user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.owner_user_id AND ur.role = 'admin');

-- 3. uniqueness: one pharmacy per owner, one staff membership per user
DELETE FROM public.pharmacy_staff a
USING public.pharmacy_staff b
WHERE a.user_id = b.user_id AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS pharmacies_owner_unique
  ON public.pharmacies (owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_staff_user_unique
  ON public.pharmacy_staff (user_id);
CREATE INDEX IF NOT EXISTS pharmacies_claim_email_idx ON public.pharmacies (lower(claim_email));

-- 4. role exclusivity guards
CREATE OR REPLACE FUNCTION public.guard_courier_role_exclusivity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = NEW.user_id AND ur.role = 'admin') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.pharmacies p WHERE p.owner_user_id = NEW.user_id)
     OR EXISTS (SELECT 1 FROM public.pharmacy_staff s WHERE s.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Ce compte gère déjà une pharmacie et ne peut pas devenir livreur.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_courier_role_exclusivity ON public.couriers;
CREATE TRIGGER guard_courier_role_exclusivity
BEFORE INSERT OR UPDATE OF user_id ON public.couriers
FOR EACH ROW EXECUTE FUNCTION public.guard_courier_role_exclusivity();

CREATE OR REPLACE FUNCTION public.guard_pharmacy_owner_exclusivity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_user_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = NEW.owner_user_id AND ur.role = 'admin') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.couriers c WHERE c.user_id = NEW.owner_user_id) THEN
    RAISE EXCEPTION 'Ce compte est déjà livreur et ne peut pas gérer une pharmacie.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_pharmacy_owner_exclusivity ON public.pharmacies;
CREATE TRIGGER guard_pharmacy_owner_exclusivity
BEFORE INSERT OR UPDATE OF owner_user_id ON public.pharmacies
FOR EACH ROW EXECUTE FUNCTION public.guard_pharmacy_owner_exclusivity();

CREATE OR REPLACE FUNCTION public.guard_pharmacy_staff_exclusivity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = NEW.user_id AND ur.role = 'admin') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.couriers c WHERE c.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Ce compte est déjà livreur et ne peut pas gérer une pharmacie.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_pharmacy_staff_exclusivity ON public.pharmacy_staff;
CREATE TRIGGER guard_pharmacy_staff_exclusivity
BEFORE INSERT OR UPDATE OF user_id ON public.pharmacy_staff
FOR EACH ROW EXECUTE FUNCTION public.guard_pharmacy_staff_exclusivity();

-- 5. auto-claim on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_id uuid;
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
  END IF;

  RETURN NEW;
END;
$$;

-- 6. admins can see/manage unclaimed pharmacies
DROP POLICY IF EXISTS "Anyone signed in sees approved pharmacies" ON public.pharmacies;
CREATE POLICY "Anyone signed in sees approved pharmacies" ON public.pharmacies
FOR SELECT USING (
  (status = 'approved'::pharmacy_status)
  OR (owner_user_id IS NOT NULL AND owner_user_id = auth.uid())
  OR private.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Owner or admin updates pharmacy" ON public.pharmacies;
CREATE POLICY "Owner or admin updates pharmacy" ON public.pharmacies
FOR UPDATE USING (
  (owner_user_id IS NOT NULL AND owner_user_id = auth.uid())
  OR private.has_role(auth.uid(), 'admin'::app_role)
) WITH CHECK (
  (owner_user_id IS NOT NULL AND owner_user_id = auth.uid())
  OR private.has_role(auth.uid(), 'admin'::app_role)
);