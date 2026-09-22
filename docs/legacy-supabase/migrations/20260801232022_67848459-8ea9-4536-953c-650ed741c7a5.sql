CREATE TABLE public.whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_phone text NOT NULL UNIQUE,
  wa_name text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  language text NOT NULL DEFAULT 'fr',
  state text NOT NULL DEFAULT 'idle',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.whatsapp_sessions TO service_role;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_whatsapp_sessions_updated_at
BEFORE UPDATE ON public.whatsapp_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.whatsapp_events (
  message_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.whatsapp_events TO service_role;
ALTER TABLE public.whatsapp_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';