REVOKE ALL ON FUNCTION public.guard_courier_role_exclusivity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_pharmacy_owner_exclusivity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_pharmacy_staff_exclusivity() FROM PUBLIC, anon, authenticated;