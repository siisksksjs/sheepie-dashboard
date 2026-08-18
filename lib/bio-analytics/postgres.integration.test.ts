import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { Client } from "pg"
import { describe, expect, it } from "vitest"

const databaseUrl = process.env.TEST_DATABASE_URL
const integrationRequired = process.env.REQUIRE_BIO_POSTGRES === "1"
const migrationUrl = new URL(
  "../../supabase/migrations/20260817_add_bio_analytics.sql",
  import.meta.url,
)

type AnalyticsSummary = {
  kpis: Record<string, unknown>
  products: Array<Record<string, unknown>>
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    event_id: randomUUID(),
    occurred_at: new Date().toISOString(),
    schema_version: 1,
    event_name: "bio_page_view",
    visitor_id: randomUUID(),
    session_id: randomUUID(),
    sequence_no: 1,
    landing_path: "/bio",
    elapsed_ms: 0,
    is_returning: false,
    screen_category: null,
    ...overrides,
  }
}

if (!databaseUrl) {
  describe.skip("bio analytics PostgreSQL integration (set TEST_DATABASE_URL)", () => {
    it("requires a dedicated PostgreSQL database with pg_cron", () => {})
  })

  if (integrationRequired) {
    describe("required bio analytics PostgreSQL integration", () => {
      it("fails clearly without TEST_DATABASE_URL", () => {
        throw new Error(
          "TEST_DATABASE_URL is required and must point to a dedicated PostgreSQL database with pg_cron",
        )
      })
    })
  }
} else {
  describe("bio analytics PostgreSQL integration", () => {
    it("executes ingestion, access, retention, filters, and CTR behavior", async () => {
      const client = new Client({ connectionString: databaseUrl })
      await client.connect()

      async function expectDatabaseError(sql: string, pattern: RegExp) {
        let error: unknown
        try {
          await client.query(sql)
        } catch (caught) {
          error = caught
        }
        expect(String(error)).toMatch(pattern)
      }

      async function ingest(payload: Record<string, unknown>, rateKey: string) {
        const result = await client.query<{ result: Record<string, unknown> }>(
          "SELECT public.ingest_bio_event($1::jsonb, $2::text) AS result",
          [JSON.stringify(payload), rateKey],
        )
        return result.rows[0].result
      }

      const createdRoles: string[] = []

      try {
        const existing = await client.query<{ exists: boolean }>(
          "SELECT to_regclass('public.bio_events') IS NOT NULL AS exists",
        )
        if (existing.rows[0].exists) {
          throw new Error("TEST_DATABASE_URL must point to a database without public.bio_events")
        }

        const roles = await client.query<{ rolname: string }>(
          "SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ANY($1::text[])",
          [["anon", "authenticated", "service_role"]],
        )
        const existingRoles = new Set(roles.rows.map((role) => role.rolname))
        for (const role of ["anon", "authenticated", "service_role"]) {
          if (!existingRoles.has(role)) {
            await client.query(
              role === "service_role"
                ? "CREATE ROLE service_role NOLOGIN BYPASSRLS"
                : `CREATE ROLE ${role} NOLOGIN`,
            )
            createdRoles.push(role)
          }
        }
        const migration = await readFile(fileURLToPath(migrationUrl), "utf8")
        await client.query(migration)

        const historicalTime = "2000-01-01T00:00:00.000Z"
        const duplicatePayload = event({ occurred_at: historicalTime })

        await client.query("SET ROLE service_role")
        expect((await ingest(duplicatePayload, "idempotency")).status).toBe("inserted")
        expect((await ingest(duplicatePayload, "idempotency")).status).toBe("duplicate")
        await client.query("RESET ROLE")
        expect(
          Number(
            (
              await client.query(
                "SELECT count(*) AS count FROM public.bio_events WHERE event_id = $1",
                [duplicatePayload.event_id],
              )
            ).rows[0].count,
          ),
        ).toBe(1)

        const minuteAlignmentDeadline = Date.now() + 65_000
        while (true) {
          const serverClock = await client.query<{ second: number }>(
            "SELECT extract(second FROM clock_timestamp())::double precision AS second",
          )
          if (serverClock.rows[0].second <= 10) {
            break
          }
          if (Date.now() >= minuteAlignmentDeadline) {
            throw new Error(
              "Timed out waiting to start the rate-limit test early in a server-clock minute",
            )
          }
          await new Promise((resolve) => setTimeout(resolve, 250))
        }

        const ratePayloads = Array.from({ length: 140 }, () =>
          event({ occurred_at: historicalTime }),
        )
        const workerPayloads = Array.from({ length: 10 }, (_, workerIndex) =>
          ratePayloads.filter((_, index) => index % 10 === workerIndex),
        )
        const workerResults = await Promise.all(
          workerPayloads.map(async (payloads) => {
            const worker = new Client({ connectionString: databaseUrl })
            await worker.connect()
            await worker.query("SET ROLE service_role")
            const outcomes: Array<"inserted" | "rate-limited"> = []
            try {
              for (const payload of payloads) {
                try {
                  await worker.query(
                    "SELECT public.ingest_bio_event($1::jsonb, 'rate-limit')",
                    [JSON.stringify(payload)],
                  )
                  outcomes.push("inserted")
                } catch (error) {
                  expect(String(error)).toMatch(/rate limit exceeded/i)
                  outcomes.push("rate-limited")
                }
              }
            } finally {
              await worker.end()
            }
            return outcomes
          }),
        )
        const rateOutcomes = workerResults.flat()
        expect(rateOutcomes.filter((outcome) => outcome === "inserted")).toHaveLength(120)
        expect(rateOutcomes.filter((outcome) => outcome === "rate-limited")).toHaveLength(20)
        const observedRateBuckets = await client.query<{ event_count: number }>(
          `SELECT event_count
          FROM public.bio_event_rate_buckets
          WHERE rate_key = 'rate-limit'
          ORDER BY minute_bucket`,
        )
        expect(observedRateBuckets.rows).toEqual([{ event_count: 120 }])

        await client.query("SET ROLE anon")
        await expectDatabaseError("SELECT * FROM public.bio_events", /permission denied/i)
        await client.query("RESET ROLE")

        await client.query("SET ROLE authenticated")
        await client.query("SELECT count(*) FROM public.bio_events")
        await expectDatabaseError(
          `INSERT INTO public.bio_events (
            event_id, occurred_at, event_name, visitor_id, session_id, sequence_no
          ) VALUES (
            gen_random_uuid(), now(), 'bio_page_view', gen_random_uuid(), gen_random_uuid(), 1
          )`,
          /permission denied/i,
        )
        await client.query("RESET ROLE")

        await client.query("BEGIN")
        let bypassError: unknown
        try {
          await client.query("SET LOCAL ROLE service_role")
          await client.query("SET LOCAL app.bio_event_retention = 'enabled'")
          await client.query("DELETE FROM public.bio_events")
        } catch (error) {
          bypassError = error
        } finally {
          await client.query("ROLLBACK")
        }
        expect(String(bypassError)).toMatch(/permission denied/i)

        const sessionA = randomUUID()
        const sessionB = randomUUID()
        const sessionC = randomUUID()
        const sessionD = randomUUID()
        const visitor = randomUUID()
        const fixtureEvents = [
          event({ event_name: "bio_product_view", visitor_id: visitor, session_id: sessionA, product_slug: "cervicloud", sequence_no: 1 }),
          event({ event_name: "bio_outbound_click", visitor_id: visitor, session_id: sessionA, product_slug: "cervicloud", destination: "shopee", sequence_no: 2 }),
          event({ event_name: "bio_outbound_click", visitor_id: visitor, session_id: sessionA, product_slug: "cervicloud", destination: "shopee", sequence_no: 3 }),
          event({ event_name: "bio_product_view", session_id: sessionB, product_slug: "cervicloud" }),
          event({ event_name: "bio_outbound_click", session_id: sessionC, product_slug: "cervicloud", destination: "tokopedia" }),
          event({ event_name: "bio_product_view", session_id: sessionD, product_slug: "lumicloud" }),
        ]

        await client.query("SET ROLE service_role")
        for (const fixture of fixtureEvents) {
          await ingest(fixture, `fixture:${fixture.event_id}`)
        }
        await client.query("RESET ROLE")

        const summaryResult = await client.query<{ summary: AnalyticsSummary }>(
          "SELECT public.get_bio_analytics_summary(now() - interval '1 day', now() + interval '1 day', '{}'::jsonb) AS summary",
        )
        const summary = summaryResult.rows[0].summary
        expect(summary.kpis.sessions).toBe(4)
        expect(summary.kpis.outbound_clicks).toBe(3)
        expect(Number(summary.kpis.outbound_ctr)).toBe(50)
        const cervicloud = summary.products.find(
          (product: Record<string, unknown>) => product.product_slug === "cervicloud",
        )
        if (!cervicloud) {
          throw new Error("Expected cervicloud product analytics row")
        }
        expect(Number(cervicloud.views)).toBe(2)
        expect(Number(cervicloud.clicks)).toBe(1)
        expect(Number(cervicloud.ctr)).toBe(50)

        const filteredResult = await client.query<{ summary: AnalyticsSummary }>(
          `SELECT public.get_bio_analytics_summary(
            now() - interval '1 day',
            now() + interval '1 day',
            '{"product_slugs":["lumicloud"]}'::jsonb
          ) AS summary`,
        )
        expect(filteredResult.rows[0].summary.kpis.sessions).toBe(1)
        expect(filteredResult.rows[0].summary.products).toHaveLength(1)
        expect(filteredResult.rows[0].summary.products[0].product_slug).toBe("lumicloud")

        const filterOptions = await client.query<{ options: Record<string, string[]> }>(
          "SELECT public.get_bio_filter_options(now() - interval '1 day', now() + interval '1 day') AS options",
        )
        expect(filterOptions.rows[0].options.products).toEqual([
          "cervicloud",
          "lumicloud",
        ])
        expect(filterOptions.rows[0].options.destinations).toEqual([
          "shopee",
          "tokopedia",
        ])

        const journeys = await client.query<{ paths: Array<Record<string, unknown>> }>(
          "SELECT public.get_bio_journeys(now() - interval '1 day', now() + interval '1 day', '{}'::jsonb, 20) AS paths",
        )
        expect(journeys.rows[0].paths.length).toBeGreaterThan(0)
        expect(journeys.rows[0].paths.some((path) =>
          String(path.path).includes("bio_product_view:cervicloud"),
        )).toBe(true)

        const cronJob = await client.query<{ schedule: string; command: string }>(
          "SELECT schedule, command FROM cron.job WHERE jobname = 'delete-expired-bio-events-daily'",
        )
        expect(cronJob.rows).toHaveLength(1)
        expect(cronJob.rows[0].schedule).toBe("30 18 * * *")
        expect(cronJob.rows[0].command).toContain("public.delete_expired_bio_events(13)")

        await expectDatabaseError(
          "UPDATE public.bio_events SET elapsed_ms = elapsed_ms + 1",
          /append-only/i,
        )

        const expiredId = randomUUID()
        const oldOccurredId = randomUUID()
        await client.query(
          `INSERT INTO public.bio_events (
            event_id, occurred_at, received_at, event_name, visitor_id, session_id, sequence_no
          ) VALUES
            ($1, now(), now() - interval '14 months', 'bio_page_view', gen_random_uuid(), gen_random_uuid(), 1),
            ($2, now() - interval '14 months', now(), 'bio_page_view', gen_random_uuid(), gen_random_uuid(), 1)`,
          [expiredId, oldOccurredId],
        )
        await client.query(
          `INSERT INTO public.bio_event_rate_buckets (rate_key, minute_bucket) VALUES
            ('expired-bucket', now() - interval '3 days'),
            ('current-bucket', now() - interval '1 day')`,
        )

        const retention = await client.query<{ result: Record<string, unknown> }>(
          "SELECT public.delete_expired_bio_events(13) AS result",
        )
        expect(Number(retention.rows[0].result.deleted_events)).toBe(1)
        expect(Number(retention.rows[0].result.deleted_rate_buckets)).toBe(1)
        expect(
          Number(
            (
              await client.query(
                "SELECT count(*) AS count FROM public.bio_events WHERE event_id = $1",
                [expiredId],
              )
            ).rows[0].count,
          ),
        ).toBe(0)
        expect(
          Number(
            (
              await client.query(
                "SELECT count(*) AS count FROM public.bio_events WHERE event_id = $1",
                [oldOccurredId],
              )
            ).rows[0].count,
          ),
        ).toBe(1)
        expect(
          Number(
            (
              await client.query(
                "SELECT count(*) AS count FROM public.bio_event_rate_buckets WHERE rate_key = 'current-bucket'",
              )
            ).rows[0].count,
          ),
        ).toBe(1)
      } finally {
        await client.query("RESET ROLE").catch(() => undefined)
        await client.query(`
          DO $cleanup$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM cron.job
              WHERE jobname = 'delete-expired-bio-events-daily'
            ) THEN
              PERFORM cron.unschedule('delete-expired-bio-events-daily');
            END IF;
          END;
          $cleanup$;
          DROP TABLE IF EXISTS public.bio_events CASCADE;
          DROP TABLE IF EXISTS public.bio_event_rate_buckets CASCADE;
          DROP FUNCTION IF EXISTS public.prevent_bio_event_mutation() CASCADE;
          DROP FUNCTION IF EXISTS public.ingest_bio_event(JSONB, TEXT) CASCADE;
          DROP FUNCTION IF EXISTS public.get_bio_analytics_summary(TIMESTAMPTZ, TIMESTAMPTZ, JSONB) CASCADE;
          DROP FUNCTION IF EXISTS public.get_bio_filter_options(TIMESTAMPTZ, TIMESTAMPTZ) CASCADE;
          DROP FUNCTION IF EXISTS public.get_bio_journeys(TIMESTAMPTZ, TIMESTAMPTZ, JSONB, INTEGER) CASCADE;
          DROP FUNCTION IF EXISTS public.delete_expired_bio_events(INTEGER) CASCADE;
        `).catch(() => undefined)
        for (const role of createdRoles.reverse()) {
          await client.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined)
        }
        await client.end()
      }
    }, 120_000)
  })
}
