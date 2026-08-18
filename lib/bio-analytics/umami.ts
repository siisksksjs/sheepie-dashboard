import { JAKARTA_TIMEZONE, selectUmamiUnit } from "./range"
import {
  EMPTY_UMAMI_METRICS,
  UMAMI_METRIC_TYPES,
  type BioAnalyticsFilters,
  type BioRange,
  type UmamiBundle,
  type UmamiMetricRow,
  type UmamiMetricType,
  type UmamiSeries,
  type UmamiStats,
} from "./types"

// Server-only by construction: UMAMI_API_KEY has no NEXT_PUBLIC_ prefix, so importing
// this module from a client component leaves the key undefined and reports `unconfigured`.
export const DEFAULT_UMAMI_BASE_URL = "https://api.umami.is/v1"
const CACHE_SECONDS = 300

export type UmamiDependencies = {
  fetch?: (input: string, init?: RequestInit) => Promise<Response>
  apiKey?: string
  websiteId?: string
  baseUrl?: string
}

type RequestPlan = { key: string; url: string }

function unconfiguredBundle(): UmamiBundle {
  return {
    status: "unconfigured",
    stats: null,
    series: null,
    metrics: { ...EMPTY_UMAMI_METRICS },
    weekly: null,
    errors: [],
  }
}

/**
 * Umami accepts one value per filter. A multi-select cannot be expressed, so the
 * traffic source stays unfiltered rather than silently reporting a narrower slice.
 */
function singleValue(values: string[]): string | null {
  return values.length === 1 ? values[0] : null
}

function buildSearchParams(range: BioRange, filters: BioAnalyticsFilters): URLSearchParams {
  const params = new URLSearchParams({
    startAt: String(range.start.getTime()),
    // Umami treats endAt as inclusive; the range end is an exclusive instant.
    endAt: String(range.end.getTime() - 1),
    path: "/bio",
    timezone: JAKARTA_TIMEZONE,
  })

  const utmSource = singleValue(filters.utmSources)
  if (utmSource) params.set("utm_source", utmSource)
  const campaign = singleValue(filters.campaigns)
  if (campaign) params.set("utm_campaign", campaign)

  return params
}

function planRequests(root: string, websiteId: string, params: URLSearchParams, unit: string): RequestPlan[] {
  const website = `${root}/websites/${encodeURIComponent(websiteId)}`
  const query = (extra?: Record<string, string>) => {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(extra ?? {})) merged.set(key, value)
    return merged.toString()
  }

  return [
    { key: "stats", url: `${website}/stats?${query()}` },
    { key: "pageviews", url: `${website}/pageviews?${query({ unit })}` },
    { key: "weekly", url: `${website}/sessions/weekly?${query()}` },
    ...UMAMI_METRIC_TYPES.map((type) => ({
      key: `metrics:${type}`,
      url: `${website}/metrics?${query({ type })}`,
    })),
  ]
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "object" && value !== null && "value" in value) {
    const inner = (value as { value: unknown }).value
    if (typeof inner === "number" && Number.isFinite(inner)) return inner
  }
  return 0
}

function parseStats(payload: unknown): UmamiStats | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null
  const record = payload as Record<string, unknown>
  return {
    pageviews: toNumber(record.pageviews),
    visitors: toNumber(record.visitors),
    visits: toNumber(record.visits),
    bounces: toNumber(record.bounces),
    totaltime: toNumber(record.totaltime),
  }
}

function parsePoints(value: unknown): { x: string; y: number }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return []
    const record = entry as Record<string, unknown>
    if (typeof record.x !== "string") return []
    return [{ x: record.x, y: toNumber(record.y) }]
  })
}

function parseSeries(payload: unknown): UmamiSeries | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null
  const record = payload as Record<string, unknown>
  if (!Array.isArray(record.pageviews) && !Array.isArray(record.sessions)) return null
  return { pageviews: parsePoints(record.pageviews), sessions: parsePoints(record.sessions) }
}

function parseMetrics(payload: unknown): UmamiMetricRow[] | null {
  if (!Array.isArray(payload)) return null
  return payload.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return []
    const record = entry as Record<string, unknown>
    const label = record.x
    if (label !== null && typeof label !== "string") return []
    return [{ x: label ?? null, y: toNumber(record.y) }]
  })
}

function parseWeekly(payload: unknown): number[][] | null {
  if (!Array.isArray(payload)) return null
  const rows = payload.filter(Array.isArray) as unknown[][]
  if (rows.length !== payload.length) return null
  return rows.map((row) => row.map(toNumber))
}

/**
 * Loads the traffic half of the report. Failures degrade the source rather than
 * the dashboard: partial data is kept and the status turns `unavailable`.
 */
export async function loadUmamiBundle(
  range: BioRange,
  filters: BioAnalyticsFilters,
  dependencies: UmamiDependencies = {},
): Promise<UmamiBundle> {
  const apiKey = dependencies.apiKey ?? process.env.UMAMI_API_KEY ?? ""
  const websiteId = dependencies.websiteId ?? process.env.UMAMI_WEBSITE_ID ?? ""
  if (!apiKey || !websiteId) return unconfiguredBundle()

  const root = (dependencies.baseUrl ?? process.env.UMAMI_API_BASE_URL ?? DEFAULT_UMAMI_BASE_URL).replace(
    /\/+$/,
    "",
  )
  const fetcher = dependencies.fetch ?? globalThis.fetch
  const params = buildSearchParams(range, filters)
  const plans = planRequests(root, websiteId, params, selectUmamiUnit(range))

  const settled = await Promise.allSettled(
    plans.map(async (plan) => {
      const response = await fetcher(plan.url, {
        headers: { Accept: "application/json", "x-umami-api-key": apiKey },
        next: { revalidate: CACHE_SECONDS },
      } as RequestInit)

      if (!response.ok) throw new Error(`${plan.key}: HTTP ${response.status}`)
      return { key: plan.key, payload: (await response.json()) as unknown }
    }),
  )

  const bundle: UmamiBundle = {
    status: "healthy",
    stats: null,
    series: null,
    metrics: { ...EMPTY_UMAMI_METRICS },
    weekly: null,
    errors: [],
  }

  settled.forEach((result, index) => {
    const plan = plans[index]

    if (result.status === "rejected") {
      bundle.errors.push(`${plan.key}: ${(result.reason as Error)?.message ?? "request failed"}`)
      return
    }

    const { key, payload } = result.value
    if (key === "stats") {
      const stats = parseStats(payload)
      if (stats) bundle.stats = stats
      else bundle.errors.push("stats: unexpected payload")
      return
    }
    if (key === "pageviews") {
      const series = parseSeries(payload)
      if (series) bundle.series = series
      else bundle.errors.push("pageviews: unexpected payload")
      return
    }
    if (key === "weekly") {
      const weekly = parseWeekly(payload)
      if (weekly) bundle.weekly = weekly
      else bundle.errors.push("weekly: unexpected payload")
      return
    }

    const type = key.slice("metrics:".length) as UmamiMetricType
    const rows = parseMetrics(payload)
    if (rows) bundle.metrics[type] = rows
    else bundle.errors.push(`${key}: unexpected payload`)
  })

  if (bundle.errors.length > 0) bundle.status = "unavailable"
  return bundle
}
