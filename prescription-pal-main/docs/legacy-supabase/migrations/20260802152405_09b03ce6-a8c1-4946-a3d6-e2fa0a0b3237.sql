REVOKE SELECT ON public.pharmacies FROM anon, authenticated;

GRANT SELECT (
  id, owner_user_id, name, license_number, address, city, lat, lng,
  phone, opening_hours, status, rating, created_at, updated_at, google_place_id
) ON public.pharmacies TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.pharmacies TO authenticated;
GRANT ALL ON public.pharmacies TO service_role;