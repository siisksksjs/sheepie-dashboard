-- The bio page now exposes a mailto: contact link, which is a distinct outbound
-- destination. Widen the allowlist rather than recording it as 'website'.

ALTER TABLE bio_events DROP CONSTRAINT IF EXISTS bio_events_destination_check;

ALTER TABLE bio_events
  ADD CONSTRAINT bio_events_destination_check
  CHECK (destination IS NULL OR destination IN (
    'shopee', 'tokopedia', 'website', 'whatsapp', 'instagram', 'tiktok', 'email', 'share'
  ));
