
-- Add courier to app_role enum (must be committed before use)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'courier';

-- Enums
DO $$ BEGIN
  CREATE TYPE public.delivery_status AS ENUM ('unassigned','assigned','picked_up','en_route','delivered','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.courier_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reservations additions FIRST (couriers policies reference courier_id)
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS is_partial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS missing_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS courier_id UUID,
  ADD COLUMN IF NOT EXISTS delivery_status public.delivery_status NOT NULL DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS patient_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS patient_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS patient_address TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- couriers table
CREATE TABLE IF NOT EXISTS public.couriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle_type TEXT NOT NULL DEFAULT 'moto',
  license_number TEXT,
  status public.courier_status NOT NULL DEFAULT 'pending',
  is_online BOOLEAN NOT NULL DEFAULT false,
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  last_position_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.couriers TO authenticated;
GRANT ALL ON public.couriers TO service_role;

ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courier read own" ON public.couriers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "courier insert own" ON public.couriers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "courier update own or admin" ON public.couriers FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "courier read for assigned reservation" ON public.couriers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.courier_id = couriers.id
      AND (r.patient_id = auth.uid() OR public.is_pharmacy_member(auth.uid(), r.pharmacy_id))
  ));

CREATE TRIGGER couriers_updated_at BEFORE UPDATE ON public.couriers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Now add the FK on reservations.courier_id
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_courier_fk FOREIGN KEY (courier_id) REFERENCES public.couriers(id) ON DELETE SET NULL;

-- Reservation policies for courier
CREATE POLICY "courier read assigned reservation" ON public.reservations FOR SELECT TO authenticated
  USING (courier_id IN (SELECT id FROM public.couriers WHERE user_id = auth.uid()));
CREATE POLICY "courier update assigned reservation" ON public.reservations FOR UPDATE TO authenticated
  USING (courier_id IN (SELECT id FROM public.couriers WHERE user_id = auth.uid()))
  WITH CHECK (courier_id IN (SELECT id FROM public.couriers WHERE user_id = auth.uid()));

-- courier_positions
CREATE TABLE IF NOT EXISTS public.courier_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id UUID NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS courier_positions_res_time ON public.courier_positions(reservation_id, recorded_at DESC);

GRANT SELECT, INSERT ON public.courier_positions TO authenticated;
GRANT ALL ON public.courier_positions TO service_role;

ALTER TABLE public.courier_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "position insert own courier" ON public.courier_positions FOR INSERT TO authenticated
  WITH CHECK (courier_id IN (SELECT id FROM public.couriers WHERE user_id = auth.uid()));
CREATE POLICY "position read for related" ON public.courier_positions FOR SELECT TO authenticated
  USING (
    courier_id IN (SELECT id FROM public.couriers WHERE user_id = auth.uid())
    OR reservation_id IN (
      SELECT r.id FROM public.reservations r
      WHERE r.patient_id = auth.uid() OR public.is_pharmacy_member(auth.uid(), r.pharmacy_id)
    )
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.couriers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_positions;
