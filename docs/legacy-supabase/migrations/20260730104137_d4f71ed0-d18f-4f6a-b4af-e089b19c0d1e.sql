CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'web',
  language text NOT NULL DEFAULT 'fr',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_tokens_token_unique UNIQUE (token)
);

CREATE INDEX device_tokens_user_idx ON public.device_tokens(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_tokens_select_own" ON public.device_tokens
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "device_tokens_insert_own" ON public.device_tokens
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "device_tokens_update_own" ON public.device_tokens
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "device_tokens_delete_own" ON public.device_tokens
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER device_tokens_set_updated_at
  BEFORE UPDATE ON public.device_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Internal config (never exposed through the Data API)
CREATE TABLE IF NOT EXISTS private.app_config (
  key text PRIMARY KEY,
  value text NOT NULL
);
REVOKE ALL ON private.app_config FROM anon, authenticated;
GRANT ALL ON private.app_config TO service_role;
ALTER TABLE private.app_config ENABLE ROW LEVEL SECURITY;

-- Dispatch push on every new in-app notification
CREATE OR REPLACE FUNCTION private.dispatch_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, extensions
AS $$
DECLARE
  endpoint text;
  secret text;
BEGIN
  SELECT value INTO endpoint FROM private.app_config WHERE key = 'push_endpoint';
  SELECT value INTO secret FROM private.app_config WHERE key = 'push_secret';

  IF endpoint IS NULL OR secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', secret
    ),
    body := jsonb_build_object('notification_id', NEW.id),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.dispatch_push_notification() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER notifications_dispatch_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION private.dispatch_push_notification();