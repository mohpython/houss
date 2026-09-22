ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS google_place_id text UNIQUE;
CREATE INDEX IF NOT EXISTS idx_pharmacies_google_place_id ON public.pharmacies(google_place_id);