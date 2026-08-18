import { describe, expect, it, vi } from "vitest"

import { DEFAULT_POSTHOG_HOST, loadTrafficBundle } from "./posthog"
import { parseRange } from "./range"
import type { BioAnalyticsFilters } from "./types"

const RANGE = parseRange({ preset: "custom", startDate: "2026-08-11", endDate: "2026-08-17" })

const FILTERS: BioAnalyticsFilters = {
  preset: "custom",
  startDate: "2026-08-11",
  endDate: "2026-08-17",
  productSlugs: [],
  destinations: [],
  utmSources: [],
  campaigns: [],
  screenCategories: [],
  referrerCategories: [],
  eventPage: 1,
}

const CONFIG = { apiKey: "phx_secret", projectId: "12345" }

function resultsFor(sql: string): unknown[][] {
  // The series query also selects pageviews and visitors, so match it first.
  if (sql.includes("GROUP BY bucket")) return [["2026-08-17 00:00:00", 40, 25]]
  if (sql.includes("AS sessions")) return [[200, 90, 110]]
  return [["instagram.com", 40], [null, 5]]
}

function recordingFetch(overrides: Record<string, () => Response> = {}) {
  const calls: Array<{ url: string; init?: RequestInit; sql: string }> = []
  const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { query?: { query?: string } }
    const sql = body.query?.query ?? ""
    calls.push({ url: input, init, sql })

    for (const [fragment, respond] of Object.entries(overrides)) {
      if (sql.includes(fragment)) return respond()
    }
    return new Response(JSON.stringify({ results: resultsFor(sql) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  })
  return { calls, fetcher }
}

describe("loadTrafficBundle", () => {
  it("reports unconfigured when either secret is missing", async () => {
    const { fetcher } = recordingFetch()

    expect(
      await loadTrafficBundle(RANGE, FILTERS, { fetch: fetcher, apiKey: "", projectId: "1" }),
    ).toMatchObject({ status: "unconfigured" })
    expect(
      await loadTrafficBundle(RANGE, FILTERS, { fetch: fetcher, apiKey: "k", projectId: "" }),
    ).toMatchObject({ status: "unconfigured" })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("posts HogQL to the project query endpoint with a bearer key", async () => {
    const { calls, fetcher } = recordingFetch()

    await loadTrafficBundle(RANGE, FILTERS, { fetch: fetcher, ...CONFIG })

    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.url).toBe(`${DEFAULT_POSTHOG_HOST}/api/projects/12345/query/`)
      expect(call.init?.method).toBe("POST")
      const headers = new Headers(call.init?.headers)
      expect(headers.get("authorization")).toBe("Bearer phx_secret")
      const body = JSON.parse(String(call.init?.body)) as { query: { kind: string } }
      expect(body.query.kind).toBe("HogQLQuery")
    }
  })

  it("scopes every query to /bio pageviews inside the range", async () => {
    const { calls, fetcher } = recordingFetch()

    await loadTrafficBundle(RANGE, FILTERS, { fetch: fetcher, ...CONFIG })

    for (const call of calls) {
      expect(call.sql).toContain("event = '$pageview'")
      expect(call.sql).toContain("properties.$pathname = '/bio'")
      expect(call.sql).toContain("2026-08-10 17:00:00")
      expect(call.sql).toContain("2026-08-17 17:00:00")
    }
  })

  it("requests every audience breakdown the dashboard renders", async () => {
    const { calls, fetcher } = recordingFetch()

    await loadTrafficBundle(RANGE, FILTERS, { fetch: fetcher, ...CONFIG })

    for (const property of [
      "$referring_domain",
      "$geoip_country_name",
      "$geoip_subdivision_1_name",
      "$device_type",
      "$browser",
      "$os",
    ]) {
      expect(calls.some((call) => call.sql.includes(property))).toBe(true)
    }
  })

  it("applies a single selected campaign filter and skips ambiguous multi-selects", async () => {
    const { calls, fetcher } = recordingFetch()

    await loadTrafficBundle(
      RANGE,
      { ...FILTERS, utmSources: ["instagram"], campaigns: ["launch", "retarget"] },
      { fetch: fetcher, ...CONFIG },
    )

    for (const call of calls) {
      expect(call.sql).toContain("properties.utm_source = 'instagram'")
      expect(call.sql).not.toContain("utm_campaign")
    }
  })

  it("escapes quotes so a filter value cannot alter the query", async () => {
    const { calls, fetcher } = recordingFetch()

    await loadTrafficBundle(
      RANGE,
      { ...FILTERS, utmSources: ["ig' OR 1=1 --"] },
      { fetch: fetcher, ...CONFIG },
    )

    expect(calls[0].sql).toContain("'ig'' OR 1=1 --'")
    expect(calls[0].sql).not.toContain("= 'ig' OR 1=1")
  })

  it("parses stats, series, and breakdowns", async () => {
    const { fetcher } = recordingFetch()

    const bundle = await loadTrafficBundle(RANGE, FILTERS, { fetch: fetcher, ...CONFIG })

    expect(bundle.status).toBe("healthy")
    expect(bundle.stats).toEqual({ pageviews: 200, visitors: 90, sessions: 110 })
    expect(bundle.series?.sessions).toEqual([{ x: "2026-08-17T00:00:00", y: 25 }])
    expect(bundle.breakdowns.referrer).toEqual([
      { x: "instagram.com", y: 40 },
      { x: null, y: 5 },
    ])
  })

  it("degrades to unavailable when one query fails, keeping the rest", async () => {
    const { fetcher } = recordingFetch({
      $browser: () => new Response("upstream boom", { status: 502 }),
    })

    const bundle = await loadTrafficBundle(RANGE, FILTERS, { fetch: fetcher, ...CONFIG })

    expect(bundle.status).toBe("unavailable")
    expect(bundle.breakdowns.browser).toEqual([])
    expect(bundle.stats).toMatchObject({ visitors: 90 })
    expect(bundle.errors.length).toBeGreaterThan(0)
  })

  it("never throws when the network rejects outright", async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error("dns failure")))

    const bundle = await loadTrafficBundle(RANGE, FILTERS, { fetch: fetcher, ...CONFIG })

    expect(bundle.status).toBe("unavailable")
    expect(bundle.stats).toBeNull()
    expect(bundle.series).toBeNull()
    expect(bundle.breakdowns.referrer).toEqual([])
  })

  it("honours a configured host", async () => {
    const { calls, fetcher } = recordingFetch()

    await loadTrafficBundle(RANGE, FILTERS, {
      fetch: fetcher,
      ...CONFIG,
      host: "https://eu.posthog.com",
    })

    expect(calls.every((call) => call.url.startsWith("https://eu.posthog.com/api/"))).toBe(true)
  })
})
