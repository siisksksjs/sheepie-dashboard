-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function in
-- schema public directly to anon, authenticated, and service_role. The original
-- bio analytics migration only revoked from PUBLIC, which does not remove a direct
-- grant, so the anon role retained EXECUTE on both SECURITY DEFINER functions:
-- it could forge bio_events rows through ingest_bio_event and trigger deletions
-- through delete_expired_bio_events. Each role must be revoked by name.
--
-- Safe to run repeatedly.

REVOKE ALL ON FUNCTION prevent_bio_event_mutation() FROM anon, authenticated;
REVOKE ALL ON FUNCTION ingest_bio_event(JSONB, TEXT) FROM anon, authenticated;
REVOKE ALL ON FUNCTION delete_expired_bio_events(INTEGER) FROM anon, authenticated;
REVOKE ALL ON FUNCTION get_bio_analytics_summary(TIMESTAMPTZ, TIMESTAMPTZ, JSONB) FROM anon;
REVOKE ALL ON FUNCTION get_bio_filter_options(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION get_bio_journeys(TIMESTAMPTZ, TIMESTAMPTZ, JSONB, INTEGER) FROM anon;

-- Re-assert the intended grants in case an earlier run revoked them.
GRANT EXECUTE ON FUNCTION ingest_bio_event(JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION delete_expired_bio_events(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION get_bio_analytics_summary(TIMESTAMPTZ, TIMESTAMPTZ, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_bio_filter_options(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_bio_journeys(TIMESTAMPTZ, TIMESTAMPTZ, JSONB, INTEGER) TO authenticated, service_role;
