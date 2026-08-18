CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE TABLE bio_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  schema_version SMALLINT NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  event_name TEXT NOT NULL CHECK (event_name IN (
    'bio_page_view',
    'bio_section_view',
    'bio_scroll_depth',
    'bio_product_view',
    'bio_outbound_click',
    'bio_share_click'
  )),
  visitor_id UUID NOT NULL,
  session_id UUID NOT NULL,
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  section_id TEXT CHECK (section_id IS NULL OR char_length(section_id) <= 100),
  product_slug TEXT CHECK (product_slug IS NULL OR product_slug IN (
    'cervicloud', 'lumicloud', 'calmicloud'
  )),
  cta_id TEXT CHECK (cta_id IS NULL OR char_length(cta_id) <= 100),
  cta_position TEXT CHECK (cta_position IS NULL OR char_length(cta_position) <= 100),
  destination TEXT CHECK (destination IS NULL OR destination IN (
    'shopee', 'tokopedia', 'website', 'whatsapp', 'instagram', 'tiktok', 'share'
  )),
  landing_path TEXT NOT NULL DEFAULT '/bio' CHECK (landing_path = '/bio'),
  referrer_category TEXT CHECK (referrer_category IS NULL OR char_length(referrer_category) <= 100),
  utm_source TEXT CHECK (utm_source IS NULL OR char_length(utm_source) <= 200),
  utm_medium TEXT CHECK (utm_medium IS NULL OR char_length(utm_medium) <= 200),
  utm_campaign TEXT CHECK (utm_campaign IS NULL OR char_length(utm_campaign) <= 200),
  utm_content TEXT CHECK (utm_content IS NULL OR char_length(utm_content) <= 200),
  utm_term TEXT CHECK (utm_term IS NULL OR char_length(utm_term) <= 200),
  elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),
  is_returning BOOLEAN NOT NULL DEFAULT false,
  screen_category TEXT CHECK (
    screen_category IS NULL OR screen_category IN ('mobile', 'tablet', 'desktop')
  ),
  language TEXT CHECK (language IS NULL OR char_length(language) <= 35),
  timezone TEXT CHECK (timezone IS NULL OR char_length(timezone) <= 100),
  scroll_depth SMALLINT CHECK (scroll_depth IN (25, 50, 75, 100)),
  UNIQUE (session_id, sequence_no)
);

CREATE TABLE bio_event_rate_buckets (
  rate_key TEXT NOT NULL CHECK (char_length(rate_key) BETWEEN 1 AND 256),
  minute_bucket TIMESTAMPTZ NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 1 CHECK (event_count > 0),
  PRIMARY KEY (rate_key, minute_bucket)
);

CREATE INDEX idx_bio_events_occurred_at
  ON bio_events (occurred_at);
CREATE INDEX idx_bio_events_received_at
  ON bio_events (received_at);
CREATE INDEX idx_bio_events_visitor_occurred_at
  ON bio_events (visitor_id, occurred_at);
CREATE INDEX idx_bio_events_product_occurred_at
  ON bio_events (product_slug, occurred_at)
  WHERE product_slug IS NOT NULL;
CREATE INDEX idx_bio_events_destination_occurred_at
  ON bio_events (destination, occurred_at)
  WHERE destination IS NOT NULL;
CREATE INDEX idx_bio_events_campaign
  ON bio_events (utm_source, utm_campaign, occurred_at DESC);

ALTER TABLE bio_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bio_event_rate_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE bio_events FROM PUBLIC;
REVOKE ALL ON TABLE bio_events FROM anon;
REVOKE ALL ON TABLE bio_events FROM authenticated;
REVOKE ALL ON TABLE bio_event_rate_buckets FROM PUBLIC;
REVOKE ALL ON TABLE bio_event_rate_buckets FROM anon;
REVOKE ALL ON TABLE bio_event_rate_buckets FROM authenticated;
REVOKE ALL ON TABLE bio_event_rate_buckets FROM service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE bio_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE bio_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE bio_events FROM service_role;
GRANT SELECT ON TABLE bio_events TO authenticated;
GRANT SELECT ON TABLE bio_events TO service_role;

CREATE POLICY "Authenticated users can read bio events"
ON bio_events FOR SELECT
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION prevent_bio_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  table_owner NAME;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(target.relowner)
  INTO table_owner
  FROM pg_catalog.pg_class AS target
  WHERE target.oid = TG_RELID;

  IF TG_OP = 'DELETE'
    AND current_user = table_owner
    AND current_setting('app.bio_event_retention', true) = 'enabled'
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'bio_events is append-only; % is not allowed', TG_OP
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER prevent_bio_event_mutation
BEFORE UPDATE OR DELETE ON bio_events
FOR EACH ROW EXECUTE FUNCTION prevent_bio_event_mutation();

CREATE OR REPLACE FUNCTION ingest_bio_event(payload JSONB, request_rate_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  current_rate INTEGER;
  inserted_id UUID;
  requested_event_id UUID;
BEGIN
  IF payload IS NULL OR pg_catalog.jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'payload must be a JSON object' USING ERRCODE = '22023';
  END IF;

  IF request_rate_key IS NULL
    OR pg_catalog.char_length(pg_catalog.btrim(request_rate_key)) = 0
    OR pg_catalog.char_length(request_rate_key) > 256
  THEN
    RAISE EXCEPTION 'request_rate_key must contain 1 to 256 characters'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.bio_event_rate_buckets AS rate_bucket (rate_key, minute_bucket, event_count)
  VALUES (request_rate_key, pg_catalog.date_trunc('minute', pg_catalog.clock_timestamp()), 1)
  ON CONFLICT (rate_key, minute_bucket) DO UPDATE
  SET event_count = rate_bucket.event_count + 1
  RETURNING event_count INTO current_rate;

  IF current_rate > 120 THEN
    RAISE EXCEPTION 'bio analytics rate limit exceeded'
      USING ERRCODE = 'P0001';
  END IF;

  requested_event_id := (payload ->> 'event_id')::UUID;

  INSERT INTO public.bio_events (
    event_id,
    occurred_at,
    schema_version,
    event_name,
    visitor_id,
    session_id,
    sequence_no,
    section_id,
    product_slug,
    cta_id,
    cta_position,
    destination,
    landing_path,
    referrer_category,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    elapsed_ms,
    is_returning,
    screen_category,
    language,
    timezone,
    scroll_depth
  )
  VALUES (
    requested_event_id,
    (payload ->> 'occurred_at')::TIMESTAMPTZ,
    COALESCE((payload ->> 'schema_version')::SMALLINT, 1),
    payload ->> 'event_name',
    (payload ->> 'visitor_id')::UUID,
    (payload ->> 'session_id')::UUID,
    (payload ->> 'sequence_no')::INTEGER,
    NULLIF(pg_catalog.btrim(payload ->> 'section_id'), ''),
    NULLIF(pg_catalog.btrim(payload ->> 'product_slug'), ''),
    NULLIF(pg_catalog.btrim(payload ->> 'cta_id'), ''),
    NULLIF(pg_catalog.btrim(payload ->> 'cta_position'), ''),
    NULLIF(pg_catalog.btrim(payload ->> 'destination'), ''),
    COALESCE(NULLIF(payload ->> 'landing_path', ''), '/bio'),
    NULLIF(pg_catalog.btrim(payload ->> 'referrer_category'), ''),
    NULLIF(pg_catalog.btrim(payload ->> 'utm_source'), ''),
    NULLIF(pg_catalog.btrim(payload ->> 'utm_medium'), ''),
    NULLIF(pg_catalog.btrim(payload ->> 'utm_campaign'), ''),
    NULLIF(pg_catalog.btrim(payload ->> 'utm_content'), ''),
    NULLIF(pg_catalog.btrim(payload ->> 'utm_term'), ''),
    COALESCE((payload ->> 'elapsed_ms')::INTEGER, 0),
    COALESCE((payload ->> 'is_returning')::BOOLEAN, false),
    payload ->> 'screen_category',
    NULLIF(pg_catalog.btrim(payload ->> 'language'), ''),
    NULLIF(pg_catalog.btrim(payload ->> 'timezone'), ''),
    (payload ->> 'scroll_depth')::SMALLINT
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NULL THEN
    SELECT id INTO inserted_id
    FROM public.bio_events
    WHERE event_id = requested_event_id;

    RETURN pg_catalog.jsonb_build_object(
      'id', inserted_id,
      'event_id', requested_event_id,
      'status', 'duplicate'
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id', inserted_id,
    'event_id', requested_event_id,
    'status', 'inserted'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION get_bio_analytics_summary(
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  filters JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $function$
WITH filtered AS (
  SELECT e.*
  FROM public.bio_events e
  WHERE e.occurred_at >= start_at
    AND e.occurred_at < end_at
    AND (NOT COALESCE(filters, '{}'::JSONB) ? 'product_slugs'
      OR COALESCE(filters -> 'product_slugs', '[]'::JSONB) ? e.product_slug)
    AND (NOT COALESCE(filters, '{}'::JSONB) ? 'destinations'
      OR COALESCE(filters -> 'destinations', '[]'::JSONB) ? e.destination)
    AND (NOT COALESCE(filters, '{}'::JSONB) ? 'utm_sources'
      OR COALESCE(filters -> 'utm_sources', '[]'::JSONB) ? e.utm_source)
    AND (NOT COALESCE(filters, '{}'::JSONB) ? 'campaigns'
      OR COALESCE(filters -> 'campaigns', '[]'::JSONB) ? e.utm_campaign)
    AND (NOT COALESCE(filters, '{}'::JSONB) ? 'screen_categories'
      OR COALESCE(filters -> 'screen_categories', '[]'::JSONB) ? e.screen_category)
    AND (NOT COALESCE(filters, '{}'::JSONB) ? 'referrer_categories'
      OR COALESCE(filters -> 'referrer_categories', '[]'::JSONB) ? e.referrer_category)
),
session_rollups AS (
  SELECT
    session_id,
    bool_or(event_name IN ('bio_product_view', 'bio_outbound_click', 'bio_share_click')) AS has_action,
    count(DISTINCT section_id) FILTER (WHERE event_name = 'bio_section_view') AS section_count,
    COALESCE(max(elapsed_ms), 0) AS max_elapsed_ms,
    COALESCE(max(scroll_depth), 0) AS max_scroll_depth,
    bool_or(is_returning) AS is_returning
  FROM filtered
  GROUP BY session_id
),
product_session_rollups AS (
  SELECT
    session_id,
    product_slug,
    bool_or(event_name = 'bio_product_view') AS viewed,
    bool_or(event_name = 'bio_outbound_click') AS clicked
  FROM filtered
  WHERE product_slug IS NOT NULL
  GROUP BY session_id, product_slug
),
session_metrics AS (
  SELECT
    count(*) AS sessions,
    count(*) FILTER (WHERE
      has_action
      OR section_count >= 2
      OR max_elapsed_ms >= 10000
      OR max_scroll_depth >= 50
    ) AS engaged_sessions,
    COALESCE(avg(max_elapsed_ms), 0) AS avg_engagement_ms,
    count(*) FILTER (WHERE is_returning) AS returning_sessions
  FROM session_rollups
),
event_metrics AS (
  SELECT
    count(*) FILTER (WHERE event_name = 'bio_outbound_click') AS outbound_clicks,
    count(DISTINCT session_id) FILTER (
      WHERE event_name = 'bio_outbound_click'
    ) AS outbound_click_sessions
  FROM filtered
),
kpis AS (
  SELECT jsonb_build_object(
    'sessions', sm.sessions,
    'engaged_sessions', sm.engaged_sessions,
    'outbound_clicks', em.outbound_clicks,
    'outbound_ctr', CASE WHEN sm.sessions = 0 THEN 0
      ELSE round((em.outbound_click_sessions::NUMERIC / sm.sessions) * 100, 2) END,
    'avg_engagement_ms', round(sm.avg_engagement_ms, 0),
    'returning_share', CASE WHEN sm.sessions = 0 THEN 0
      ELSE round((sm.returning_sessions::NUMERIC / sm.sessions) * 100, 2) END
  ) AS value
  FROM session_metrics sm CROSS JOIN event_metrics em
),
time_series AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(points) ORDER BY day), '[]'::JSONB) AS value
  FROM (
    SELECT
      (occurred_at AT TIME ZONE 'Asia/Jakarta')::DATE AS day,
      count(DISTINCT session_id) AS sessions,
      count(*) FILTER (WHERE event_name = 'bio_outbound_click') AS outbound_clicks
    FROM filtered
    GROUP BY 1
  ) points
),
products AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(product_rows) ORDER BY views DESC, product_slug), '[]'::JSONB) AS value
  FROM (
    SELECT
      product_slug,
      count(*) FILTER (WHERE viewed) AS views,
      count(*) FILTER (WHERE viewed AND clicked) AS clicks,
      CASE WHEN count(*) FILTER (WHERE viewed) = 0 THEN 0
        ELSE round(
          count(*) FILTER (WHERE viewed AND clicked)::NUMERIC
          / count(*) FILTER (WHERE viewed) * 100,
          2
        )
      END AS ctr
    FROM product_session_rollups
    GROUP BY product_slug
  ) product_rows
),
marketplaces AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(destination_rows) ORDER BY clicks DESC, destination), '[]'::JSONB) AS value
  FROM (
    SELECT destination, count(*) AS clicks
    FROM filtered
    WHERE event_name = 'bio_outbound_click' AND destination IS NOT NULL
    GROUP BY destination
  ) destination_rows
),
funnel AS (
  SELECT jsonb_build_object(
    'page_view', count(DISTINCT session_id) FILTER (WHERE event_name = 'bio_page_view'),
    'section_view', count(DISTINCT session_id) FILTER (WHERE event_name = 'bio_section_view'),
    'product_view', count(DISTINCT session_id) FILTER (WHERE event_name = 'bio_product_view'),
    'outbound_click', count(DISTINCT session_id) FILTER (WHERE event_name = 'bio_outbound_click')
  ) AS value
  FROM filtered
),
sections AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(section_rows) ORDER BY sessions DESC, section_id), '[]'::JSONB) AS value
  FROM (
    SELECT section_id, count(DISTINCT session_id) AS sessions
    FROM filtered
    WHERE event_name = 'bio_section_view' AND section_id IS NOT NULL
    GROUP BY section_id
  ) section_rows
),
scroll_depth_summary AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(scroll_rows) ORDER BY scroll_depth), '[]'::JSONB) AS value
  FROM (
    SELECT scroll_depth, count(DISTINCT session_id) AS sessions
    FROM filtered
    WHERE event_name = 'bio_scroll_depth' AND scroll_depth IS NOT NULL
    GROUP BY scroll_depth
  ) scroll_rows
),
heatmap AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(heatmap_rows) ORDER BY day_of_week, hour_of_day), '[]'::JSONB) AS value
  FROM (
    SELECT
      extract(isodow FROM occurred_at AT TIME ZONE 'Asia/Jakarta')::INTEGER AS day_of_week,
      extract(hour FROM occurred_at AT TIME ZONE 'Asia/Jakarta')::INTEGER AS hour_of_day,
      count(DISTINCT session_id) AS sessions,
      count(*) AS events
    FROM filtered
    GROUP BY 1, 2
  ) heatmap_rows
)
SELECT jsonb_build_object(
  'kpis', kpis.value,
  'time_series', time_series.value,
  'products', products.value,
  'marketplaces', marketplaces.value,
  'funnel', funnel.value,
  'sections', sections.value,
  'scroll_depth', scroll_depth_summary.value,
  'heatmap', heatmap.value
)
FROM kpis
CROSS JOIN time_series
CROSS JOIN products
CROSS JOIN marketplaces
CROSS JOIN funnel
CROSS JOIN sections
CROSS JOIN scroll_depth_summary
CROSS JOIN heatmap;
$function$;

CREATE OR REPLACE FUNCTION get_bio_filter_options(
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $function$
WITH matching AS (
  SELECT *
  FROM public.bio_events
  WHERE occurred_at >= start_at AND occurred_at < end_at
)
SELECT jsonb_build_object(
  'products', COALESCE((SELECT jsonb_agg(product_slug ORDER BY product_slug)
    FROM (SELECT DISTINCT product_slug FROM matching WHERE product_slug IS NOT NULL) valueset), '[]'::JSONB),
  'destinations', COALESCE((SELECT jsonb_agg(destination ORDER BY destination)
    FROM (SELECT DISTINCT destination FROM matching WHERE destination IS NOT NULL) valueset), '[]'::JSONB),
  'utm_sources', COALESCE((SELECT jsonb_agg(utm_source ORDER BY utm_source)
    FROM (SELECT DISTINCT utm_source FROM matching WHERE utm_source IS NOT NULL) valueset), '[]'::JSONB),
  'campaigns', COALESCE((SELECT jsonb_agg(utm_campaign ORDER BY utm_campaign)
    FROM (SELECT DISTINCT utm_campaign FROM matching WHERE utm_campaign IS NOT NULL) valueset), '[]'::JSONB)
);
$function$;

CREATE OR REPLACE FUNCTION get_bio_journeys(
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  filters JSONB DEFAULT '{}'::JSONB,
  row_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $function$
WITH filtered AS (
  SELECT e.*
  FROM public.bio_events e
  WHERE e.occurred_at >= start_at
    AND e.occurred_at < end_at
    AND (NOT COALESCE(filters, '{}'::JSONB) ? 'product_slugs'
      OR COALESCE(filters -> 'product_slugs', '[]'::JSONB) ? e.product_slug)
    AND (NOT COALESCE(filters, '{}'::JSONB) ? 'destinations'
      OR COALESCE(filters -> 'destinations', '[]'::JSONB) ? e.destination)
    AND (NOT COALESCE(filters, '{}'::JSONB) ? 'utm_sources'
      OR COALESCE(filters -> 'utm_sources', '[]'::JSONB) ? e.utm_source)
    AND (NOT COALESCE(filters, '{}'::JSONB) ? 'campaigns'
      OR COALESCE(filters -> 'campaigns', '[]'::JSONB) ? e.utm_campaign)
    AND (NOT COALESCE(filters, '{}'::JSONB) ? 'screen_categories'
      OR COALESCE(filters -> 'screen_categories', '[]'::JSONB) ? e.screen_category)
    AND (NOT COALESCE(filters, '{}'::JSONB) ? 'referrer_categories'
      OR COALESCE(filters -> 'referrer_categories', '[]'::JSONB) ? e.referrer_category)
),
session_paths AS (
  SELECT
    session_id,
    string_agg(
      event_name
        || CASE WHEN product_slug IS NOT NULL THEN ':' || product_slug ELSE '' END
        || CASE WHEN destination IS NOT NULL THEN ':' || destination ELSE '' END,
      ' > ' ORDER BY sequence_no
    ) AS path
  FROM filtered
  GROUP BY session_id
),
path_counts AS (
  SELECT path, count(*) AS sessions
  FROM session_paths
  GROUP BY path
),
totals AS (
  SELECT count(*) AS sessions FROM session_paths
),
ranked AS (
  SELECT
    path_counts.path,
    path_counts.sessions,
    CASE WHEN totals.sessions = 0 THEN 0
      ELSE round(path_counts.sessions::NUMERIC / totals.sessions * 100, 2)
    END AS share
  FROM path_counts CROSS JOIN totals
  ORDER BY path_counts.sessions DESC, path_counts.path
  LIMIT least(greatest(row_limit, 1), 100)
)
SELECT COALESCE(jsonb_agg(to_jsonb(ranked) ORDER BY sessions DESC, path), '[]'::JSONB)
FROM ranked;
$function$;

CREATE OR REPLACE FUNCTION delete_expired_bio_events(retain_months INTEGER DEFAULT 13)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  deleted_events INTEGER;
  deleted_buckets INTEGER;
BEGIN
  IF retain_months IS NULL OR retain_months < 1 OR retain_months > 120 THEN
    RAISE EXCEPTION 'retain_months must be between 1 and 120'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config('app.bio_event_retention', 'enabled', true);

  DELETE FROM public.bio_events
  WHERE received_at < pg_catalog.clock_timestamp()
    - pg_catalog.make_interval(months => retain_months);
  GET DIAGNOSTICS deleted_events = ROW_COUNT;

  DELETE FROM public.bio_event_rate_buckets
  WHERE minute_bucket < pg_catalog.clock_timestamp() - INTERVAL '2 days';
  GET DIAGNOSTICS deleted_buckets = ROW_COUNT;

  RETURN pg_catalog.jsonb_build_object(
    'deleted_events', deleted_events,
    'deleted_rate_buckets', deleted_buckets
  );
END;
$function$;

REVOKE ALL ON FUNCTION prevent_bio_event_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION ingest_bio_event(JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_bio_analytics_summary(TIMESTAMPTZ, TIMESTAMPTZ, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_bio_filter_options(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_bio_journeys(TIMESTAMPTZ, TIMESTAMPTZ, JSONB, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_expired_bio_events(INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION ingest_bio_event(JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION delete_expired_bio_events(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION get_bio_analytics_summary(TIMESTAMPTZ, TIMESTAMPTZ, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_bio_filter_options(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_bio_journeys(TIMESTAMPTZ, TIMESTAMPTZ, JSONB, INTEGER) TO authenticated, service_role;

DO $schedule$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'delete-expired-bio-events-daily'
  ) THEN
    PERFORM cron.unschedule('delete-expired-bio-events-daily');
  END IF;
END;
$schedule$;

-- 18:30 UTC = 01:30 Asia/Jakarta, after the daily reporting boundary.
SELECT cron.schedule(
  'delete-expired-bio-events-daily',
  '30 18 * * *',
  $$SELECT public.delete_expired_bio_events(13);$$
);
