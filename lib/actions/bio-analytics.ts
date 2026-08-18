import { parseRange } from "@/lib/bio-analytics/range"
import { loadTrafficBundle } from "@/lib/bio-analytics/posthog"
import {
  BIO_EVENT_PAGE_SIZE,
  EMPTY_BIO_SUMMARY,
  type BioAnalyticsBundle,
  type BioAnalyticsFilters,
  type BioAnalyticsSummary,
  type BioEvent,
  type BioFilterOptions,
  type BioJourneyRow,
  type BioRange,
  type BioRpcFilters,
  type BioSupabaseBundle,
  type TrafficBundle,
} from "@/lib/bio-analytics/types"
import { createClient } from "@/lib/supabase/server"

/** Only these columns leave the database; the table holds no direct identifiers. */
export const BIO_EVENT_COLUMNS = [
  "id",
  "event_id",
  "occurred_at",
  "event_name",
  "visitor_id",
  "session_id",
  "sequence_no",
  "section_id",
  "product_slug",
  "cta_id",
  "cta_position",
  "destination",
  "referrer_category",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "elapsed_ms",
  "is_returning",
  "screen_category",
  "language",
  "scroll_depth",
].join(", ")

const EMPTY_OPTIONS: BioFilterOptions = {
  products: [],
  destinations: [],
  utm_sources: [],
  campaigns: [],
}

type SupabaseResult<T> = { data: T | null; error: { message: string } | null; count?: number | null }

type EventQuery = {
  gte: (column: string, value: string) => EventQuery
  lt: (column: string, value: string) => EventQuery
  in: (column: string, values: string[]) => EventQuery
  order: (column: string, options: { ascending: boolean }) => EventQuery
  range: (from: number, to: number) => PromiseLike<SupabaseResult<unknown[]>>
}

export type BioSupabaseClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<SupabaseResult<unknown>>
  from: (table: string) => {
    select: (columns: string, options?: { count?: "exact"; head?: boolean }) => EventQuery
  }
}

export type BioAnalyticsDependencies = {
  createClient: () => Promise<BioSupabaseClient>
  loadTraffic: (range: BioRange, filters: BioAnalyticsFilters) => Promise<TrafficBundle>
  now?: () => Date
}

const productionDependencies: BioAnalyticsDependencies = {
  createClient: async () => (await createClient()) as unknown as BioSupabaseClient,
  loadTraffic: (range, filters) => loadTrafficBundle(range, filters),
}

/** Maps UI selections onto the JSONB contract the RPCs expect, omitting empty ones. */
export function toRpcFilters(filters: BioAnalyticsFilters): BioRpcFilters {
  const rpcFilters: BioRpcFilters = {}
  if (filters.productSlugs.length > 0) rpcFilters.product_slugs = filters.productSlugs
  if (filters.destinations.length > 0) rpcFilters.destinations = filters.destinations
  if (filters.utmSources.length > 0) rpcFilters.utm_sources = filters.utmSources
  if (filters.campaigns.length > 0) rpcFilters.campaigns = filters.campaigns
  if (filters.screenCategories.length > 0) rpcFilters.screen_categories = filters.screenCategories
  if (filters.referrerCategories.length > 0) {
    rpcFilters.referrer_categories = filters.referrerCategories
  }
  return rpcFilters
}

function dashboardError(): Error {
  // Deliberately opaque: database messages can leak schema and policy details.
  return new Error("Bio analytics data could not be loaded. Please retry in a moment.")
}

export async function getBioAnalyticsBundle(
  filters: BioAnalyticsFilters,
  dependencies: BioAnalyticsDependencies = productionDependencies,
): Promise<BioAnalyticsBundle> {
  const range = parseRange(
    { preset: filters.preset, startDate: filters.startDate, endDate: filters.endDate },
    dependencies.now?.() ?? new Date(),
  )
  const rpcFilters = toRpcFilters(filters)
  const startAt = range.start.toISOString()
  const endAt = range.end.toISOString()
  const page = Math.max(1, Math.trunc(filters.eventPage) || 1)
  const offset = (page - 1) * BIO_EVENT_PAGE_SIZE

  const client = await dependencies.createClient()

  const eventQuery = () => {
    let query = client
      .from("bio_events")
      .select(BIO_EVENT_COLUMNS, { count: "exact" })
      .gte("occurred_at", startAt)
      .lt("occurred_at", endAt)

    const columnFilters: Array<[string, string[]]> = [
      ["product_slug", filters.productSlugs],
      ["destination", filters.destinations],
      ["utm_source", filters.utmSources],
      ["utm_campaign", filters.campaigns],
      ["screen_category", filters.screenCategories],
      ["referrer_category", filters.referrerCategories],
    ]
    for (const [column, values] of columnFilters) {
      if (values.length > 0) query = query.in(column, values)
    }

    return query
      .order("occurred_at", { ascending: false })
      .range(offset, offset + BIO_EVENT_PAGE_SIZE - 1)
  }

  const [summaryResult, optionsResult, journeysResult, eventsResult, traffic] = await Promise.all([
    client.rpc("get_bio_analytics_summary", { start_at: startAt, end_at: endAt, filters: rpcFilters }),
    client.rpc("get_bio_filter_options", { start_at: startAt, end_at: endAt }),
    client.rpc("get_bio_journeys", {
      start_at: startAt,
      end_at: endAt,
      filters: rpcFilters,
      row_limit: 20,
    }),
    Promise.resolve(eventQuery()),
    dependencies.loadTraffic(range, filters),
  ])

  if (summaryResult.error || optionsResult.error || journeysResult.error) {
    throw dashboardError()
  }

  const errors: string[] = []
  const supabase: BioSupabaseBundle = {
    status: "healthy",
    summary: (summaryResult.data as BioAnalyticsSummary | null) ?? EMPTY_BIO_SUMMARY,
    journeys: (journeysResult.data as BioJourneyRow[] | null) ?? [],
    options: (optionsResult.data as BioFilterOptions | null) ?? EMPTY_OPTIONS,
    events: { rows: [], page, pageSize: BIO_EVENT_PAGE_SIZE, total: 0 },
    errors,
  }

  if (eventsResult.error) {
    supabase.status = "unavailable"
    errors.push("Event details could not be loaded.")
  } else {
    supabase.events = {
      rows: (eventsResult.data as BioEvent[] | null) ?? [],
      page,
      pageSize: BIO_EVENT_PAGE_SIZE,
      total: eventsResult.count ?? 0,
    }
  }

  return { range, filters, supabase, traffic }
}
