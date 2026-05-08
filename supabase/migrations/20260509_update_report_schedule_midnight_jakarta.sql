DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-weekly-sales-report') THEN
    PERFORM cron.unschedule('send-weekly-sales-report');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-monthly-sales-report') THEN
    PERFORM cron.unschedule('send-monthly-sales-report');
  END IF;
END;
$$;

-- 17:00 UTC Sunday = 00:00 Monday in Asia/Jakarta.
SELECT cron.schedule(
  'send-weekly-sales-report',
  '0 17 * * 0',
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

-- Runs at 00:00 Asia/Jakarta every day, but only sends on the first Jakarta calendar day.
SELECT cron.schedule(
  'send-monthly-sales-report',
  '0 17 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/send-sales-report',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-notification-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_function_secret')
    ),
    body := jsonb_build_object('kind', 'monthly', 'source', 'cron')
  )
  WHERE EXTRACT(DAY FROM (now() AT TIME ZONE 'Asia/Jakarta')) = 1;
  $$
);
