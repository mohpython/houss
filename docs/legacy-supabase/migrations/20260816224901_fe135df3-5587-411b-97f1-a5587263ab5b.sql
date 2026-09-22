ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS fulfillment_method text NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS pickup_code text,
  ADD COLUMN IF NOT EXISTS receipt_code text,
  ADD COLUMN IF NOT EXISTS pickup_code_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_code_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS code_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS patient_name text,
  ADD COLUMN IF NOT EXISTS patient_phone text;

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_fulfillment_method_check;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_fulfillment_method_check
  CHECK (fulfillment_method IN ('delivery','pickup'));

CREATE OR REPLACE FUNCTION public.set_reservation_codes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pickup_code IS NULL THEN
    NEW.pickup_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  END IF;
  IF NEW.receipt_code IS NULL THEN
    NEW.receipt_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  END IF;
  IF NEW.patient_name IS NULL OR NEW.patient_phone IS NULL THEN
    SELECT COALESCE(NEW.patient_name, p.full_name), COALESCE(NEW.patient_phone, p.phone)
      INTO NEW.patient_name, NEW.patient_phone
    FROM public.profiles p WHERE p.id = NEW.patient_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reservations_set_codes ON public.reservations;
CREATE TRIGGER reservations_set_codes
BEFORE INSERT ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.set_reservation_codes();

UPDATE public.reservations r
SET pickup_code = COALESCE(r.pickup_code, lpad((floor(random() * 1000000))::int::text, 6, '0')),
    receipt_code = COALESCE(r.receipt_code, lpad((floor(random() * 1000000))::int::text, 6, '0')),
    patient_name = COALESCE(r.patient_name, p.full_name),
    patient_phone = COALESCE(r.patient_phone, p.phone)
FROM public.profiles p
WHERE p.id = r.patient_id;