import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, expectTypeOf, it } from "vitest"

import type {
  BioDestination,
  BioEvent,
  BioEventName,
  ProductSlug,
} from "../types/database.types"

const migrationUrl = new URL(
  "../../supabase/migrations/20260817_add_bio_analytics.sql",
  import.meta.url,
)

async function loadMigration(): Promise<string> {
  return readFile(fileURLToPath(migrationUrl), "utf8")
}

describe("bio analytics TypeScript contracts", () => {
  it("models the complete event payload with constrained dimensions", () => {
    const event = {} as BioEvent

    expectTypeOf<BioEventName>().toEqualTypeOf<
      | "bio_page_view"
      | "bio_section_view"
      | "bio_scroll_depth"
      | "bio_product_view"
      | "bio_outbound_click"
      | "bio_share_click"
    >()
    expectTypeOf<keyof BioEvent>().toEqualTypeOf<
      | "id"
      | "event_id"
      | "occurred_at"
      | "received_at"
      | "schema_version"
      | "event_name"
      | "visitor_id"
      | "session_id"
      | "sequence_no"
      | "section_id"
      | "product_slug"
      | "cta_id"
      | "cta_position"
      | "destination"
      | "landing_path"
      | "referrer_category"
      | "utm_source"
      | "utm_medium"
      | "utm_campaign"
      | "utm_content"
      | "utm_term"
      | "elapsed_ms"
      | "is_returning"
      | "screen_category"
      | "language"
      | "timezone"
      | "scroll_depth"
    >()
    expectTypeOf(event.event_name).toEqualTypeOf<BioEventName>()
    expectTypeOf<ProductSlug>().toEqualTypeOf<
      "cervicloud" | "lumicloud" | "calmicloud"
    >()
    expectTypeOf<BioDestination>().toEqualTypeOf<
      | "shopee"
      | "tokopedia"
      | "website"
      | "whatsapp"
      | "instagram"
      | "tiktok"
      | "email"
      | "share"
    >()
    expectTypeOf(event.product_slug).toEqualTypeOf<ProductSlug | null>()
    expectTypeOf(event.destination).toEqualTypeOf<BioDestination | null>()
    expectTypeOf(event.landing_path).toEqualTypeOf<"/bio">()
    expectTypeOf(event.screen_category).toEqualTypeOf<
      "mobile" | "tablet" | "desktop" | null
    >()
    expectTypeOf(event.scroll_depth).toEqualTypeOf<25 | 50 | 75 | 100 | null>()
    expectTypeOf(event.elapsed_ms).toEqualTypeOf<number>()
    expectTypeOf(event.is_returning).toEqualTypeOf<boolean>()
  })
})

describe("bio analytics migration contract", () => {
  it("defines constrained append-only event storage and supporting indexes", async () => {
    const source = await loadMigration()

    expect(source).toMatch(/create table bio_events\s*\(/i)
    expect(source).toMatch(/event_id uuid not null unique/i)
    expect(source).toMatch(/schema_version smallint[^,]*check\s*\(schema_version\s*=\s*1\)/i)
    expect(source).toMatch(/event_name text[^,]*check\s*\(event_name\s+in\s*\(/i)
    for (const eventName of [
      "bio_page_view",
      "bio_section_view",
      "bio_scroll_depth",
      "bio_product_view",
      "bio_outbound_click",
      "bio_share_click",
    ]) {
      expect(source).toContain(`'${eventName}'`)
    }
    expect(source).toMatch(/sequence_no integer[^,]*check\s*\(sequence_no\s*>\s*0\)/i)
    expect(source).toMatch(/landing_path text[^,]*check\s*\(landing_path\s*=\s*'\/bio'\)/i)
    expect(source).toMatch(
      /product_slug text check\s*\(product_slug is null or product_slug in\s*\(\s*'cervicloud',\s*'lumicloud',\s*'calmicloud'\s*\)\s*\)/i,
    )
    expect(source).toMatch(
      /destination text check\s*\(destination is null or destination in\s*\(\s*'shopee',\s*'tokopedia',\s*'website',\s*'whatsapp',\s*'instagram',\s*'tiktok',\s*'email',\s*'share'\s*\)\s*\)/i,
    )
    expect(source).toMatch(
      /elapsed_ms integer not null default 0 check\s*\(elapsed_ms\s*>=\s*0\)/i,
    )
    expect(source).toMatch(
      /screen_category text check\s*\(\s*screen_category is null or screen_category in\s*\(\s*'mobile',\s*'tablet',\s*'desktop'\s*\)\s*\)/i,
    )
    expect(source).not.toMatch(/screen_category text not null/i)
    expect(source).toMatch(/scroll_depth smallint[^,]*check\s*\(scroll_depth\s+in\s*\(25,\s*50,\s*75,\s*100\)\)/i)
    expect(source).toMatch(/unique\s*\(session_id,\s*sequence_no\)/i)
    expect(source).toMatch(/create table bio_event_rate_buckets\s*\(/i)
    expect(source).toMatch(/primary key\s*\(rate_key,\s*minute_bucket\)/i)

    for (const indexFragment of [
      "(occurred_at)",
      "(received_at)",
      "(visitor_id, occurred_at)",
    ]) {
      expect(source.toLowerCase()).toContain(indexFragment)
    }
    expect(source).toMatch(
      /create index[^;]+on bio_events\s*\(utm_source,\s*utm_campaign,\s*occurred_at desc\)/i,
    )
    expect(source).not.toMatch(
      /create index[^;]+on bio_events\s*\(session_id,\s*sequence_no\)/i,
    )
    expect(source).toMatch(/create index[^;]+product_slug[^;]+where product_slug is not null/i)
    expect(source).toMatch(/create index[^;]+destination[^;]+where destination is not null/i)
  })

  it("enforces RLS, append-only access, and function privileges", async () => {
    const source = await loadMigration()

    expect(source).toMatch(/alter table bio_events enable row level security/i)
    expect(source).toMatch(/alter table bio_event_rate_buckets enable row level security/i)
    expect(source).toMatch(/revoke all on (table )?bio_events from anon/i)
    expect(source).toMatch(/grant select on (table )?bio_events to authenticated/i)
    expect(source).toMatch(/grant select on (table )?bio_events to service_role/i)
    expect(source).toMatch(
      /revoke all on (table )?bio_event_rate_buckets from service_role/i,
    )
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(source).toMatch(
        new RegExp(
          `revoke insert, update, delete, truncate on (?:table )?bio_events from ${role}`,
          "i",
        ),
      )
    }
    expect(source).toMatch(/create policy[^;]+on bio_events[^;]+for select[^;]+to authenticated[^;]+using\s*\(true\)/i)
    expect(source).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*bio_events[^;]*authenticated/i)
    expect(source).not.toMatch(/grant[^;]*bio_events[^;]*anon/i)
    expect(source).toMatch(/create (or replace )?function prevent_bio_event_mutation\s*\(/i)
    expect(source).toMatch(/before update or delete on bio_events/i)
    expect(source).toMatch(/raise exception[^;]+append-only/i)
    expect(source).toMatch(/from pg_catalog\.pg_class/i)
    expect(source).toMatch(/pg_catalog\.pg_get_userbyid\([^)]*relowner/i)
    expect(source).toMatch(/current_user\s*=\s*table_owner/i)
    expect(source).toMatch(/current_setting\('app\.bio_event_retention'/i)

    for (const functionName of [
      "ingest_bio_event",
      "get_bio_analytics_summary",
      "get_bio_filter_options",
      "get_bio_journeys",
      "delete_expired_bio_events",
    ]) {
      expect(source).toMatch(new RegExp(`create (?:or replace )?function ${functionName}\\s*\\(`, "i"))
      expect(source).toMatch(new RegExp(`revoke all on function ${functionName}\\([^;]+from public`, "i"))
    }

    // Supabase's default privileges grant EXECUTE to anon directly, so revoking
    // from PUBLIC alone leaves the SECURITY DEFINER functions reachable by anon.
    for (const definerFunction of ["ingest_bio_event", "delete_expired_bio_events"]) {
      expect(source).toMatch(
        new RegExp(`revoke all on function ${definerFunction}\\([^;]+from anon, authenticated`, "i"),
      )
    }
    for (const reportFunction of [
      "get_bio_analytics_summary",
      "get_bio_filter_options",
      "get_bio_journeys",
    ]) {
      expect(source).toMatch(
        new RegExp(`revoke all on function ${reportFunction}\\([^;]+from anon`, "i"),
      )
    }
    expect(source).not.toMatch(/grant execute on function [^;]+to anon/i)

    expect(source).toMatch(/grant execute on function ingest_bio_event\([^;]+to service_role/i)
    expect(source).toMatch(/grant execute on function delete_expired_bio_events\([^;]+to service_role/i)
    expect(source).not.toMatch(/grant execute on function (ingest_bio_event|delete_expired_bio_events)\([^;]+to authenticated/i)
    for (const reportFunction of [
      "get_bio_analytics_summary",
      "get_bio_filter_options",
      "get_bio_journeys",
    ]) {
      expect(source).toMatch(
        new RegExp(
          `grant execute on function ${reportFunction}\\([^;]+to authenticated, service_role`,
          "i",
        ),
      )
    }
  })

  it("implements a bounded, explicit, idempotent ingestion boundary", async () => {
    const source = await loadMigration()
    const ingest = source.match(
      /create (?:or replace )?function ingest_bio_event\([\s\S]+?\$function\$;/i,
    )?.[0] ?? ""

    expect(ingest).toMatch(/security definer/i)
    expect(ingest).toMatch(/set search_path\s*=\s*''/i)
    expect(ingest).toMatch(/insert into public\.bio_event_rate_buckets/i)
    expect(ingest).toMatch(/on conflict\s*\(rate_key,\s*minute_bucket\)[\s\S]*do update/i)
    expect(ingest).toMatch(/current_rate\s*>\s*120/i)
    expect(ingest).toMatch(/insert into public\.bio_events\s*\([^)]+\)/i)
    expect(ingest).toMatch(/payload\s*->>\s*'event_id'/i)
    expect(ingest).toMatch(/on conflict\s*\(event_id\)\s*do nothing/i)
    expect(ingest).not.toMatch(/jsonb_populate_record|jsonb_to_record/i)
  })

  it("returns every reporting section and encodes the engagement definition", async () => {
    const source = await loadMigration()
    const summary = source.match(
      /create (?:or replace )?function get_bio_analytics_summary\([\s\S]+?\$function\$;/i,
    )?.[0] ?? ""

    for (const section of [
      "kpis",
      "time_series",
      "products",
      "marketplaces",
      "funnel",
      "sections",
      "scroll_depth",
      "heatmap",
    ]) {
      expect(summary).toContain(`'${section}'`)
    }
    expect(summary).toMatch(/bio_product_view|bio_outbound_click|bio_share_click/i)
    expect(summary).toMatch(/section_count\s*>=\s*2/i)
    expect(summary).toMatch(/max_elapsed_ms\s*>=\s*10000/i)
    expect(summary).toMatch(/max_scroll_depth\s*>=\s*50/i)
    expect(summary).toMatch(/outbound_ctr/i)
    expect(summary).toMatch(
      /count\(distinct session_id\) filter\s*\(\s*where event_name = 'bio_outbound_click'\s*\) as outbound_click_sessions/i,
    )
    expect(summary).toMatch(
      /'outbound_clicks',\s*em\.outbound_clicks[\s\S]*'outbound_ctr'[\s\S]*em\.outbound_click_sessions::numeric\s*\/\s*sm\.sessions/i,
    )
    expect(summary).toMatch(/product_session_rollups as\s*\(/i)
    expect(summary).toMatch(
      /group by\s+session_id,\s*product_slug/i,
    )
    const products = summary.match(/products as\s*\([\s\S]+?\n\),\nmarketplaces as/i)?.[0] ?? ""
    expect(products).toMatch(
      /count\(\*\) filter\s*\(\s*where viewed\s*\) as views/i,
    )
    expect(products).toMatch(
      /count\(\*\) filter\s*\(\s*where viewed and clicked\s*\) as clicks/i,
    )
    expect(products).toMatch(
      /count\(\*\) filter\s*\(\s*where viewed and clicked\s*\)::numeric[\s\S]*\/\s*count\(\*\) filter\s*\(\s*where viewed\s*\)/i,
    )
    expect(summary).toMatch(/returning_share/i)
    expect(summary).toMatch(/asia\/jakarta/i)
    expect(summary).not.toMatch(/execute\s+format|execute\s+query/i)
  })

  it("filters journeys and validates retention", async () => {
    const source = await loadMigration()

    expect(source).toMatch(/string_agg\([^;]+order by[^;]+\)/i)
    expect(source).toMatch(/least\(greatest\(row_limit,\s*1\),\s*\d+\)/i)
    expect(source).toMatch(/retain_months\s*<\s*1\s+or\s+retain_months\s*>\s*120/i)
    expect(source).toMatch(/delete from public\.bio_events[^;]+received_at[^;]+make_interval\(months\s*=>\s*retain_months\)/i)
    expect(source).not.toMatch(/delete from public\.bio_events[^;]+occurred_at/i)
    expect(source).toMatch(/delete from public\.bio_event_rate_buckets/i)
    expect(source).toMatch(
      /delete from public\.bio_event_rate_buckets[^;]+minute_bucket[^;]+interval '2 days'/i,
    )
    expect(source).not.toMatch(
      /delete from public\.bio_event_rate_buckets[^;]+make_interval\(months\s*=>\s*retain_months\)/i,
    )
    expect(source).toMatch(/create extension if not exists pg_cron with schema pg_catalog/i)
    expect(source).toMatch(/cron\.unschedule\('delete-expired-bio-events-daily'\)/i)
    expect(source).toMatch(
      /cron\.schedule\(\s*'delete-expired-bio-events-daily',\s*'[^']+',\s*\$\$\s*select public\.delete_expired_bio_events\(13\);\s*\$\$\s*\)/i,
    )
    const retention = source.match(
      /create (?:or replace )?function delete_expired_bio_events\([\s\S]+?\$function\$;/i,
    )?.[0] ?? ""
    expect(retention).toMatch(/security definer/i)
    expect(retention).toMatch(/set search_path\s*=\s*''/i)
  })
})
