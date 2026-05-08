CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Required Vault secrets before this migration runs:
-- - project_url: https://<project-ref>.supabase.co
-- - notification_function_secret: same value as NOTIFICATION_FUNCTION_SECRET in app and Edge Function env

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-notification-events-every-5-minutes') THEN
    PERFORM cron.unschedule('send-notification-events-every-5-minutes');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-weekly-sales-report') THEN
    PERFORM cron.unschedule('send-weekly-sales-report');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-monthly-sales-report') THEN
    PERFORM cron.unschedule('send-monthly-sales-report');
  END IF;
END;
$$;

SELECT cron.schedule(
  'send-notification-events-every-5-minutes',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/send-notification-events',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-notification-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_function_secret')
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- 01:00 UTC = 08:00 Asia/Jakarta. The report function sends the previous completed Monday-Sunday week.
SELECT cron.schedule(
  'send-weekly-sales-report',
  '0 1 * * 1',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/send-sales-report',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-notification-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_function_secret')
    ),
    body := jsonb_build_object('kind', 'weekly', 'source', 'cron')
  );
  $$
);

-- 01:00 UTC = 08:00 Asia/Jakarta. The report function sends the previous completed calendar month.
SELECT cron.schedule(
  'send-monthly-sales-report',
  '0 1 1 * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/send-sales-report',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-notification-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_function_secret')
    ),
    body := jsonb_build_object('kind', 'monthly', 'source', 'cron')
  );
  $$
);
