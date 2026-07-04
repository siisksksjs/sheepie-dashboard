CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 17:00 UTC = 00:00 Asia/Jakarta. Sends the current month KPI status and daily pace needed.
-- Required before this migration runs:
-- - deployed Edge Function: send-daily-kpi-report
-- - Vault secret project_url
-- - Vault secret notification_function_secret
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-daily-kpi-report') THEN
    PERFORM cron.unschedule('send-daily-kpi-report');
  END IF;
END;
$$;

SELECT cron.schedule(
  'send-daily-kpi-report',
  '0 17 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/send-daily-kpi-report',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-notification-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_function_secret')
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);
