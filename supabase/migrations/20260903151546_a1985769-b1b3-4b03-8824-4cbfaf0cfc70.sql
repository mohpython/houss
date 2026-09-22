CREATE TABLE public.neighborhoods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL DEFAULT 'Bamako',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city, name)
);
GRANT SELECT ON public.neighborhoods TO authenticated;
GRANT ALL ON public.neighborhoods TO service_role;
ALTER TABLE public.neighborhoods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read active neighborhoods" ON public.neighborhoods
  FOR SELECT TO authenticated
  USING (is_active OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert neighborhoods" ON public.neighborhoods
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update neighborhoods" ON public.neighborhoods
  FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
GRANT INSERT, UPDATE ON public.neighborhoods TO authenticated;
CREATE TRIGGER neighborhoods_updated BEFORE UPDATE ON public.neighborhoods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.reservations
  ADD COLUMN neighborhood_id uuid REFERENCES public.neighborhoods(id) ON DELETE SET NULL,
  ADD COLUMN delivery_mode text NOT NULL DEFAULT 'gps';

INSERT INTO public.neighborhoods (name, lat, lng) VALUES
  ('Daoudabougou', 12.5920, -7.9800),
  ('Hamdallaye ACI 2000', 12.6280, -8.0250),
  ('Badalabougou', 12.6180, -7.9840),
  ('Kalaban Coura', 12.5780, -7.9890),
  ('Magnambougou', 12.6050, -7.9570),
  ('Sotuba', 12.6560, -7.9260),
  ('Lafiabougou', 12.6300, -8.0400),
  ('Sébénikoro', 12.6260, -8.0680),
  ('Niamakoro', 12.5760, -7.9560),
  ('Faladié', 12.5900, -7.9550),
  ('Banankabougou', 12.5820, -7.9640),
  ('Hippodrome', 12.6530, -7.9800),
  ('Missira', 12.6530, -7.9880),
  ('Djélibougou', 12.6660, -7.9880),
  ('Boulkassoumbougou', 12.6760, -7.9800),
  ('Sabalibougou', 12.5980, -7.9990),
  ('Yirimadio', 12.5920, -7.9200),
  ('Baco Djicoroni', 12.5960, -8.0180),
  ('Torokorobougou', 12.6100, -8.0000),
  ('Quinzambougou', 12.6480, -7.9750),
  ('Médina Coura', 12.6510, -7.9930),
  ('Bamako Coura', 12.6410, -7.9990),
  ('Bolibana', 12.6440, -8.0180),
  ('Kalaban Coro', 12.5600, -7.9950),
  ('Sirakoro Meguetana', 12.5500, -7.9500),
  ('Titibougou', 12.6890, -7.9500),
  ('Sogoniko', 12.5990, -7.9720),
  ('Dravéla', 12.6470, -8.0060),
  ('Golf', 12.6450, -8.0310),
  ('Korofina', 12.6690, -7.9710),
  ('Sikoroni', 12.6790, -7.9960),
  ('Kalabambougou', 12.6100, -8.0780);