import { describe, expect, it, vi } from "vitest"

import { getBioAnalyticsBundle, toRpcFilters } from "./bio-analytics"
import { EMPTY_TRAFFIC_BREAKDOWNS, type BioAnalyticsFilters, type TrafficBundle } from "@/lib/bio-analytics/types"

const FILTERS: BioAnalyticsFilters = {
  preset: "custom",
  startDate: "2026-08-11",
  endDate: "2026-08-17",
  productSlugs: ["cervicloud"],
  destinations: [],
  utmSources: [],
  campaigns: [],
  screenCategories: [],
  referrerCategories: [],
  eventPage: 2,
}

const SUMMARY = {
  kpis: {
    sessions: 40,
    engaged_sessions: 18,
    outbound_clicks: 12,
    outbound_ctr: 25,
    avg_engagement_ms: 21000,
    returning_share: 15,
  },
  time_series: [{ day: "2026-08-17", sessions: 40, outbound_clicks: 12 }],
  products: [{ product_slug: "cervicloud", views: 30, clicks: 9, ctr: 30 }],
  marketplaces: [{ destination: "shopee", clicks: 8 }],
  funnel: { page_view: 40, section_view: 32, product_view: 30, outbound_click: 10 },
  sections: [{ section_id: "bio-hero", sessions: 38 }],
  scroll_depth: [{ scroll_depth: 25, sessions: 36 }],
  heatmap: [{ day_of_week: 1, hour_of_day: 21, sessions: 5, events: 22 }],
}

const JOURNEYS = [{ path: "bio_page_view > bio_outbound_click:shopee", sessions: 6, share: 15 }]
const OPTIONS = {
  products: ["cervicloud"],
  destinations: ["shopee"],
  utm_sources: ["instagram"],
  campaigns: ["launch"],
}
const EVENT_ROW = {
  id: "row-1",
  event_id: "11111111-1111-4111-8111-111111111111",
  occurred_at: "2026-08-17T13:00:00.000Z",
  event_name: "bio_outbound_click",
  session_id: "22222222-2222-4222-8222-222222222222",
  product_slug: "cervicloud",
  destination: "shopee",
}

function umamiBundle(overrides: Partial<TrafficBundle> = {}): TrafficBundle {
  return {
    status: "healthy",
    stats: { pageviews: 200, visitors: 90, sessions: 110 },
    series: { pageviews: [], sessions: [{ x: "2026-08-17", y: 55 }] },
    breakdowns: { ...EMPTY_TRAFFIC_BREAKDOWNS },
        errors: [],
    ...overrides,
  }
}

type QueryLog = {
  rpc: Array<{ fn: string; args: Record<string, unknown> }>
  select: string[]
  filters: Array<[string, unknown, unknown]>
  order: Array<[string, unknown]>
  range: Array<[number, number]>
}

function stubClient(options: { eventsError?: string; rpcError?: string } = {}) {
  const log: QueryLog = { rpc: [], select: [], filters: [], order: [], range: [] }

  const builder: Record<string, unknown> = {}
  const chain = (name: string) =>
    vi.fn((...args: unknown[]) => {
      if (name === "order") log.order.push([args[0] as string, args[1]])
      else log.filters.push([name, args[0], args[1]])
      return builder
    })

  builder.gte = chain("gte")
  builder.lt = chain("lt")
  builder.in = chain("in")
  builder.order = chain("order")
  builder.range = vi.fn(async (from: number, to: number) => {
    log.range.push([from, to])
    return options.eventsError
      ? { data: null, error: { message: options.eventsError }, count: null }
      : { data: [EVENT_ROW], error: null, count: 137 }
  })

  const client = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      log.rpc.push({ fn, args })
      if (options.rpcError) return { data: null, error: { message: options.rpcError } }
      if (fn === "get_bio_analytics_summary") return { data: SUMMARY, error: null }
      if (fn === "get_bio_filter_options") return { data: OPTIONS, error: null }
      if (fn === "get_bio_journeys") return { data: JOURNEYS, error: null }
      return { data: null, error: { message: `unknown rpc ${fn}` } }
    }),
    from: vi.fn(() => ({
      select: vi.fn((columns: string) => {
        log.select.push(columns)
        return builder
      }),
    })),
  }

  return { client, log }
}

function dependencies(client: unknown, umami = umamiBundle()) {
  return {
    createClient: async () => client as never,
    loadTraffic: vi.fn(async () => umami),
    now: () => new Date("2026-08-17T12:00:00+07:00"),
  }
}

describe("toRpcFilters", () => {
  it("omits empty selections so the RPC skips the filter entirely", () => {
    expect(toRpcFilters(FILTERS)).toEqual({ product_slugs: ["cervicloud"] })
    expect(
      toRpcFilters({ ...FILTERS, productSlugs: [], destinations: ["shopee", "tokopedia"] }),
    ).toEqual({ destinations: ["shopee", "tokopedia"] })
  })
})

describe("getBioAnalyticsBundle", () => {
  it("queries every RPC with the same UTC range and filter JSON", async () => {
    const { client, log } = stubClient()

    const bundle = await getBioAnalyticsBundle(FILTERS, dependencies(client))

    expect(log.rpc.map((call) => call.fn).sort()).toEqual([
      "get_bio_analytics_summary",
      "get_bio_filter_options",
      "get_bio_journeys",
    ])
    const start = bundle.range.start.toISOString()
    const end = bundle.range.end.toISOString()
    expect(start).toBe("2026-08-10T17:00:00.000Z")
    expect(end).toBe("2026-08-17T17:00:00.000Z")
    for (const call of log.rpc) {
      expect(call.args.start_at).toBe(start)
      expect(call.args.end_at).toBe(end)
    }
    const filtered = log.rpc.filter((call) => call.fn !== "get_bio_filter_options")
    expect(filtered).toHaveLength(2)
    for (const call of filtered) {
      expect(call.args.filters).toEqual({ product_slugs: ["cervicloud"] })
    }
    expect(bundle.supabase.summary).toEqual(SUMMARY)
    expect(bundle.supabase.journeys).toEqual(JOURNEYS)
    expect(bundle.supabase.options).toEqual(OPTIONS)
  })

  it("paginates the event stream by 50 newest-first rows", async () => {
    const { client, log } = stubClient()

    const bundle = await getBioAnalyticsBundle(FILTERS, dependencies(client))

    expect(log.order).toEqual([["occurred_at", { ascending: false }]])
    expect(log.range).toEqual([[50, 99]])
    expect(bundle.supabase.events).toMatchObject({ page: 2, pageSize: 50, total: 137 })
    expect(bundle.supabase.events.rows).toHaveLength(1)
    expect(log.select[0]).not.toContain("*")
    expect(log.select[0]).toContain("occurred_at")
  })

  it("applies active filters to the event stream", async () => {
    const { client, log } = stubClient()

    await getBioAnalyticsBundle(FILTERS, dependencies(client))

    expect(log.filters).toContainEqual(["in", "product_slug", ["cervicloud"]])
    expect(log.filters.some(([method]) => method === "gte")).toBe(true)
    expect(log.filters.some(([method]) => method === "lt")).toBe(true)
  })

  it("keeps Supabase results when Umami is unavailable", async () => {
    const { client } = stubClient()

    const bundle = await getBioAnalyticsBundle(
      FILTERS,
      dependencies(client, umamiBundle({ status: "unavailable", stats: null, series: null, errors: ["stats: HTTP 502"] })),
    )

    expect(bundle.traffic.status).toBe("unavailable")
    expect(bundle.supabase.status).toBe("healthy")
    expect(bundle.supabase.summary.kpis.sessions).toBe(40)
  })

  it("degrades only the event stream when its query fails", async () => {
    const { client } = stubClient({ eventsError: "column does not exist" })

    const bundle = await getBioAnalyticsBundle(FILTERS, dependencies(client))

    expect(bundle.supabase.status).toBe("unavailable")
    expect(bundle.supabase.events.rows).toEqual([])
    expect(bundle.supabase.events.total).toBe(0)
    expect(bundle.supabase.summary.kpis.sessions).toBe(40)
    expect(bundle.supabase.errors.join(" ")).not.toContain("column does not exist")
  })

  it("throws a safe error when the aggregate queries fail", async () => {
    const { client } = stubClient({ rpcError: "permission denied for relation bio_events" })

    await expect(getBioAnalyticsBundle(FILTERS, dependencies(client))).rejects.toThrow(
      /Bio analytics data could not be loaded/,
    )
    await expect(getBioAnalyticsBundle(FILTERS, dependencies(client))).rejects.not.toThrow(
      /permission denied/,
    )
  })
})
