
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============= ENUMS =============
CREATE TYPE public.app_role AS ENUM ('patient', 'pharmacy_staff', 'admin');
CREATE TYPE public.pharmacy_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.prescription_status AS ENUM ('uploaded', 'processing', 'extracted', 'verified', 'failed');
CREATE TYPE public.reservation_status AS ENUM ('pending', 'accepted', 'rejected', 'ready', 'completed', 'cancelled');

-- ============= updated_at trigger =============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============= PROFILES =============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= USER ROLES =============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Admins can manage roles
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============= SIGNUP TRIGGER =============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone, '')
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'patient')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============= PHARMACIES =============
CREATE TABLE public.pharmacies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  license_number TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  phone TEXT,
  opening_hours JSONB,
  status pharmacy_status NOT NULL DEFAULT 'pending',
  rating NUMERIC(2,1) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacies TO authenticated;
GRANT ALL ON public.pharmacies TO service_role;
ALTER TABLE public.pharmacies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in sees approved pharmacies" ON public.pharmacies FOR SELECT TO authenticated
  USING (status = 'approved' OR owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owner creates pharmacy" ON public.pharmacies FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "Owner or admin updates pharmacy" ON public.pharmacies FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin deletes pharmacy" ON public.pharmacies FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER pharmacies_updated BEFORE UPDATE ON public.pharmacies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= PHARMACY STAFF =============
CREATE TABLE public.pharmacy_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pharmacy_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_staff TO authenticated;
GRANT ALL ON public.pharmacy_staff TO service_role;
ALTER TABLE public.pharmacy_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read own memberships" ON public.pharmacy_staff FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.pharmacies p WHERE p.id = pharmacy_id AND p.owner_user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owner manages staff" ON public.pharmacy_staff FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pharmacies p WHERE p.id = pharmacy_id AND p.owner_user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pharmacies p WHERE p.id = pharmacy_id AND p.owner_user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Helper: does user work at pharmacy?
CREATE OR REPLACE FUNCTION public.is_pharmacy_member(_user_id UUID, _pharmacy_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pharmacies WHERE id = _pharmacy_id AND owner_user_id = _user_id
    UNION
    SELECT 1 FROM public.pharmacy_staff WHERE pharmacy_id = _pharmacy_id AND user_id = _user_id
  );
$$;

-- ============= MEDICINES =============
CREATE TABLE public.medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name TEXT NOT NULL,
  generic_name TEXT,
  strength TEXT,
  form TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX medicines_name_trgm ON public.medicines USING gin (normalized_name gin_trgm_ops);
CREATE INDEX medicines_generic_trgm ON public.medicines USING gin (generic_name gin_trgm_ops);
GRANT SELECT ON public.medicines TO authenticated;
GRANT ALL ON public.medicines TO service_role;
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read medicines" ON public.medicines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage medicines" ON public.medicines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============= INVENTORY =============
CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  price NUMERIC(10,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pharmacy_id, medicine_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read inventory of approved pharmacies" ON public.inventory FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pharmacies p WHERE p.id = pharmacy_id AND (p.status = 'approved' OR p.owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "Pharmacy staff manage inventory" ON public.inventory FOR ALL TO authenticated
  USING (public.is_pharmacy_member(auth.uid(), pharmacy_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_pharmacy_member(auth.uid(), pharmacy_id) OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER inventory_updated BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= PRESCRIPTIONS =============
CREATE TABLE public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_mime TEXT NOT NULL,
  patient_name TEXT,
  doctor_name TEXT,
  hospital TEXT,
  prescription_date DATE,
  ai_confidence NUMERIC(4,2),
  ai_raw JSONB,
  status prescription_status NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Patient reads own prescriptions" ON public.prescriptions FOR SELECT TO authenticated
  USING (patient_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Patient inserts own prescriptions" ON public.prescriptions FOR INSERT TO authenticated WITH CHECK (patient_id = auth.uid());
CREATE POLICY "Patient updates own prescriptions" ON public.prescriptions FOR UPDATE TO authenticated
  USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());
CREATE POLICY "Patient deletes own prescriptions" ON public.prescriptions FOR DELETE TO authenticated
  USING (patient_id = auth.uid());
CREATE TRIGGER prescriptions_updated BEFORE UPDATE ON public.prescriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= PRESCRIPTION ITEMS =============
CREATE TABLE public.prescription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  medicine_name_raw TEXT NOT NULL,
  normalized_medicine_id UUID REFERENCES public.medicines(id) ON DELETE SET NULL,
  strength TEXT,
  quantity TEXT,
  dosage TEXT,
  duration TEXT,
  instructions TEXT,
  patient_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescription_items TO authenticated;
GRANT ALL ON public.prescription_items TO service_role;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Patient reads own items" ON public.prescription_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.prescriptions p WHERE p.id = prescription_id AND (p.patient_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "Patient manages own items" ON public.prescription_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.prescriptions p WHERE p.id = prescription_id AND p.patient_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.prescriptions p WHERE p.id = prescription_id AND p.patient_id = auth.uid()));

-- ============= RESERVATIONS =============
CREATE TABLE public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  status reservation_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservations TO authenticated;
GRANT ALL ON public.reservations TO service_role;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Patient reads own reservations" ON public.reservations FOR SELECT TO authenticated
  USING (patient_id = auth.uid() OR public.is_pharmacy_member(auth.uid(), pharmacy_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Patient creates reservation" ON public.reservations FOR INSERT TO authenticated
  WITH CHECK (patient_id = auth.uid());
CREATE POLICY "Patient or pharmacy updates reservation" ON public.reservations FOR UPDATE TO authenticated
  USING (patient_id = auth.uid() OR public.is_pharmacy_member(auth.uid(), pharmacy_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (patient_id = auth.uid() OR public.is_pharmacy_member(auth.uid(), pharmacy_id) OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER reservations_updated BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= RESERVATION ITEMS =============
CREATE TABLE public.reservation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  prescription_item_id UUID NOT NULL REFERENCES public.prescription_items(id) ON DELETE CASCADE,
  available BOOLEAN NOT NULL DEFAULT true,
  price NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_items TO authenticated;
GRANT ALL ON public.reservation_items TO service_role;
ALTER TABLE public.reservation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Access reservation items via reservation" ON public.reservation_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_id AND (r.patient_id = auth.uid() OR public.is_pharmacy_member(auth.uid(), r.pharmacy_id) OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_id AND (r.patient_id = auth.uid() OR public.is_pharmacy_member(auth.uid(), r.pharmacy_id) OR public.has_role(auth.uid(), 'admin'))));

-- ============= AUDIT LOGS =============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own audit logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (actor_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own audit logs" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

-- ============= STORAGE POLICIES for 'prescriptions' bucket =============
-- Patients can upload/read their own prescription files (path starts with their user id).
CREATE POLICY "Users upload own prescription files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'prescriptions' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users read own prescription files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'prescriptions' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own prescription files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'prescriptions' AND (storage.foldername(name))[1] = auth.uid()::text);
