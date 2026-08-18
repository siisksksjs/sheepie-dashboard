-- Instagram Story links point straight at a Shopee listing, so those clicks
-- never touch /bio. A tracked redirect at /go records them, which means
-- landing_path must accept that entry point too.
--
-- Safe to run repeatedly.

ALTER TABLE bio_events DROP CONSTRAINT IF EXISTS bio_events_landing_path_check;

ALTER TABLE bio_events
  ALTER COLUMN landing_path SET DEFAULT '/bio';

ALTER TABLE bio_events
  ADD CONSTRAINT bio_events_landing_path_check
  CHECK (landing_path IN ('/bio', '/go'));
