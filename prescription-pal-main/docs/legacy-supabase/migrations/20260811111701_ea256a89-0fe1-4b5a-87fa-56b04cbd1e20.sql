ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS review_severity text,
  ADD COLUMN IF NOT EXISTS review_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS prescriptions_review_severity_idx
  ON public.prescriptions (review_severity)
  WHERE review_severity IS NOT NULL;