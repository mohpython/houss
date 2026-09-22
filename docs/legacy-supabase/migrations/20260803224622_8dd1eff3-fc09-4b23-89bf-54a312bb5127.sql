-- =========================
-- PART 1: prescription date
-- =========================
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS prescription_date_raw text,
  ADD COLUMN IF NOT EXISTS date_source text NOT NULL DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS is_expired boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_prescription_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.prescription_date IS NULL THEN
    NEW.is_expired := false;
  ELSE
    NEW.is_expired := NEW.prescription_date < (CURRENT_DATE - INTERVAL '90 days');
  END IF;
  IF NEW.date_source IS NULL OR NEW.date_source NOT IN ('ai','manual') THEN
    NEW.date_source := 'ai';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prescriptions_set_expiry ON public.prescriptions;
CREATE TRIGGER prescriptions_set_expiry
BEFORE INSERT OR UPDATE ON public.prescriptions
FOR EACH ROW EXECUTE FUNCTION public.set_prescription_expiry();

-- =========================
-- PART 2: practitioners
-- =========================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'doctor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'nurse';

DO $$ BEGIN
  CREATE TYPE public.practitioner_type AS ENUM ('doctor','nurse');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.practitioner_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.appointment_status AS ENUM ('requested','accepted','rescheduled','rejected','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.practitioner_specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label_fr text NOT NULL,
  label_en text NOT NULL,
  label_ar text NOT NULL,
  practitioner_type public.practitioner_type NOT NULL DEFAULT 'doctor',
  keywords text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.practitioner_specialties TO authenticated;
GRANT ALL ON public.practitioner_specialties TO service_role;
ALTER TABLE public.practitioner_specialties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "specialties readable by signed in" ON public.practitioner_specialties;
CREATE POLICY "specialties readable by signed in" ON public.practitioner_specialties
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.practitioners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claim_email text,
  type public.practitioner_type NOT NULL,
  full_name text NOT NULL,
  specialty_code text NOT NULL REFERENCES public.practitioner_specialties(code),
  license_number text,
  phone text,
  address text,
  city text,
  lat double precision,
  lng double precision,
  opening_hours jsonb,
  home_visits boolean NOT NULL DEFAULT false,
  consultation_fee numeric,
  is_available boolean NOT NULL DEFAULT true,
  status public.practitioner_status NOT NULL DEFAULT 'pending',
  bio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS practitioners_status_idx ON public.practitioners(status);
CREATE UNIQUE INDEX IF NOT EXISTS practitioners_user_unique ON public.practitioners(user_id) WHERE user_id IS NOT NULL;

GRANT SELECT, UPDATE ON public.practitioners TO authenticated;
GRANT ALL ON public.practitioners TO service_role;
ALTER TABLE public.practitioners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approved practitioners visible" ON public.practitioners;
CREATE POLICY "approved practitioners visible" ON public.practitioners
  FOR SELECT TO authenticated
  USING (
    status = 'approved'
    OR (user_id IS NOT NULL AND user_id = auth.uid())
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "practitioner or admin updates" ON public.practitioners;
CREATE POLICY "practitioner or admin updates" ON public.practitioners
  FOR UPDATE TO authenticated
  USING ((user_id IS NOT NULL AND user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK ((user_id IS NOT NULL AND user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS practitioners_updated ON public.practitioners;
CREATE TRIGGER practitioners_updated
BEFORE UPDATE ON public.practitioners
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- exclusivity: a practitioner account cannot own a pharmacy or be a courier
CREATE OR REPLACE FUNCTION public.guard_practitioner_exclusivity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = NEW.user_id AND ur.role = 'admin') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.couriers c WHERE c.user_id = NEW.user_id)
     OR EXISTS (SELECT 1 FROM public.pharmacies p WHERE p.owner_user_id = NEW.user_id)
     OR EXISTS (SELECT 1 FROM public.pharmacy_staff s WHERE s.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Ce compte a déjà un autre rôle professionnel.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_practitioner_exclusivity ON public.practitioners;
CREATE TRIGGER guard_practitioner_exclusivity
BEFORE INSERT OR UPDATE ON public.practitioners
FOR EACH ROW EXECUTE FUNCTION public.guard_practitioner_exclusivity();

-- helper: is the current user this practitioner?
CREATE OR REPLACE FUNCTION private.is_user_practitioner(_user_id uuid, _practitioner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.practitioners p
    WHERE p.id = _practitioner_id AND p.user_id = _user_id AND _user_id IS NOT NULL
  );
$$;

CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  practitioner_id uuid NOT NULL REFERENCES public.practitioners(id) ON DELETE CASCADE,
  reason text NOT NULL,
  symptoms text,
  triage jsonb,
  at_home boolean NOT NULL DEFAULT false,
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_at timestamptz,
  proposed_at timestamptz,
  patient_address text,
  patient_lat double precision,
  patient_lng double precision,
  patient_phone text,
  status public.appointment_status NOT NULL DEFAULT 'requested',
  practitioner_notes text,
  report text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointments_patient_idx ON public.appointments(patient_id);
CREATE INDEX IF NOT EXISTS appointments_practitioner_idx ON public.appointments(practitioner_id);

GRANT SELECT, INSERT, UPDATE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient or practitioner reads appointment" ON public.appointments;
CREATE POLICY "patient or practitioner reads appointment" ON public.appointments
  FOR SELECT TO authenticated
  USING (
    patient_id = auth.uid()
    OR private.is_user_practitioner(auth.uid(), practitioner_id)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "patient creates appointment" ON public.appointments;
CREATE POLICY "patient creates appointment" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (patient_id = auth.uid());

DROP POLICY IF EXISTS "patient or practitioner updates appointment" ON public.appointments;
CREATE POLICY "patient or practitioner updates appointment" ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    patient_id = auth.uid()
    OR private.is_user_practitioner(auth.uid(), practitioner_id)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    patient_id = auth.uid()
    OR private.is_user_practitioner(auth.uid(), practitioner_id)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP TRIGGER IF EXISTS appointments_updated ON public.appointments;
CREATE TRIGGER appointments_updated
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- notifications on appointment lifecycle
CREATE OR REPLACE FUNCTION private.appointments_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prac_user uuid;
  prac_name text;
BEGIN
  SELECT p.user_id, p.full_name INTO prac_user, prac_name
  FROM public.practitioners p WHERE p.id = NEW.practitioner_id;

  IF TG_OP = 'INSERT' THEN
    IF prac_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (prac_user, 'appointment_requested', 'Nouvelle demande de rendez-vous',
              COALESCE(NEW.reason, 'Consultation'), jsonb_build_object('appointment_id', NEW.id));
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (NEW.patient_id, 'appointment_' || NEW.status::text, 'Rendez-vous mis à jour',
            COALESCE(prac_name, 'Praticien') || ' : ' || NEW.status::text,
            jsonb_build_object('appointment_id', NEW.id, 'status', NEW.status::text));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_notify_trg ON public.appointments;
CREATE TRIGGER appointments_notify_trg
AFTER INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION private.appointments_notify();