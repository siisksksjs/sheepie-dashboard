CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Every 15 minutes, poll Shopee for new/changed orders through the dashboard route.
-- Required before this migration runs:
-- - Vault secret shopee_sync_secret (same value as the SHOPEE_SYNC_SECRET env var)
-- - deployed dashboard route: POST /api/shopee/sync
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'shopee-order-sync') THEN
    PERFORM cron.unschedule('shopee-order-sync');
  END IF;
END;
$$;

SELECT cron.schedule(
  'shopee-order-sync',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dashboard.sheepiesleep.com/api/shopee/sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-shopee-sync-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'shopee_sync_secret')
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);
