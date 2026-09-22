CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  pharmacy_id uuid REFERENCES public.pharmacies(id) ON DELETE SET NULL,
  phone text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own feedback"
  ON public.feedback FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own feedback"
  ON public.feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all feedback"
  ON public.feedback FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Pharmacy members can view their feedback"
  ON public.feedback FOR SELECT TO authenticated
  USING (pharmacy_id IS NOT NULL AND private.is_pharmacy_member(auth.uid(), pharmacy_id));

CREATE INDEX idx_feedback_phone ON public.feedback (phone);
CREATE INDEX idx_feedback_pharmacy ON public.feedback (pharmacy_id);

CREATE TRIGGER feedback_updated
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();