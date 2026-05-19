CREATE OR REPLACE FUNCTION public.dispatch_push_on_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_url TEXT := current_setting('app.settings.push_function_url', TRUE);
  v_key TEXT := current_setting('app.settings.service_role_key', TRUE);
BEGIN
  -- Skip if the edge function URL isn't configured (local dev without push set up)
  IF v_url IS NULL OR v_url = '' THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_notification_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_on_notification();
