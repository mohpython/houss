ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS review_status text;