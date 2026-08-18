import { JAKARTA_TIMEZONE } from "./range"
import {
  EMPTY_TRAFFIC_BREAKDOWNS,
  TRAFFIC_BREAKDOWNS,
  type BioAnalyticsFilters,
  type BioRange,
  type TrafficBreakdown,
  type TrafficBreakdownRow,
  type TrafficBundle,
  type TrafficPoint,
  type TrafficSeries,
  type TrafficStats,
} from "./types"

// Server-only by construction: POSTHOG_API_KEY has no NEXT_PUBLIC_ prefix, so
// importing this module from a client component reports `unconfigured` instead.
export const DEFAULT_POSTHOG_HOST = "https://us.posthog.com"
const CACHE_SECONDS = 300
const BREAKDOWN_LIMIT = 10

export type PostHogDependencies = {
  fetch?: (input: string, init?: RequestInit) => Promise<Response>
  apiKey?: string
  projectId?: string
  host?: string
}

/** The PostHog event property backing each audience breakdown. */
const BREAKDOWN_PROPERTIES: Record<TrafficBreakdown, string> = {
  referrer: "$referring_domain",
  country: "$geoip_country_name",
  region: "$geoip_subdivision_1_name",
  device: "$device_type",
  browser: "$browser",
  os: "$os",
}

function unconfiguredBundle(): TrafficBundle {
  return {
    status: "unconfigured",
    stats: null,
    series: null,
    breakdowns: { ...EMPTY_TRAFFIC_BREAKDOWNS },
    errors: [],
  }
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * PostHog filters are inlined into HogQL, so every value is escaped here. Only
 * single-valued selections are applied: a multi-select cannot be expressed
 * without widening the traffic slice, so it is left unfiltered instead.
 */
function filterClauses(filters: BioAnalyticsFilters): string {
  const clauses: string[] = []
  if (filters.utmSources.length === 1) {
    clauses.push(`properties.utm_source = ${sqlString(filters.utmSources[0])}`)
  }
  if (filters.campaigns.length === 1) {
    clauses.push(`properties.utm_campaign = ${sqlString(filters.campaigns[0])}`)
  }
  return clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : ""
}

function baseWhere(range: BioRange, filters: BioAnalyticsFilters): string {
  return [
    `event = '$pageview'`,
    `properties.$pathname = '/bio'`,
    `timestamp >= toDateTime(${sqlString(range.start.toISOString().slice(0, 19).replace("T", " "))})`,
    `timestamp < toDateTime(${sqlString(range.end.toISOString().slice(0, 19).replace("T", " "))})`,
  ].join(" AND ") + filterClauses(filters)
}

type QueryPlan = { key: string; sql: string }

function planQueries(range: BioRange, filters: BioAnalyticsFilters): QueryPlan[] {
  const where = baseWhere(range, filters)
  const bucket = range.days <= 7 ? "toStartOfHour" : range.days <= 90 ? "toStartOfDay" : "toStartOfMonth"

  return [
    {
      key: "stats",
      sql: `SELECT count() AS pageviews, count(DISTINCT person_id) AS visitors,
              count(DISTINCT properties.$session_id) AS sessions
            FROM events WHERE ${where}`,
    },
    {
      key: "series",
      sql: `SELECT ${bucket}(toTimeZone(timestamp, ${sqlString(JAKARTA_TIMEZONE)})) AS bucket,
              count() AS pageviews, count(DISTINCT person_id) AS visitors
            FROM events WHERE ${where}
            GROUP BY bucket ORDER BY bucket`,
    },
    ...TRAFFIC_BREAKDOWNS.map((breakdown) => ({
      key: `breakdown:${breakdown}`,
      sql: `SELECT properties.${BREAKDOWN_PROPERTIES[breakdown]} AS label,
              count(DISTINCT person_id) AS visitors
            FROM events WHERE ${where}
            GROUP BY label ORDER BY visitors DESC LIMIT ${BREAKDOWN_LIMIT}`,
    })),
  ]
}

type QueryResponse = { results?: unknown[][] }

function toNumber(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0
}

function parseStats(rows: unknown[][]): TrafficStats | null {
  const row = rows[0]
  if (!Array.isArray(row)) return null
  return { pageviews: toNumber(row[0]), visitors: toNumber(row[1]), sessions: toNumber(row[2]) }
}

/** HogQL returns `2026-08-17T00:00:00` style timestamps; keep them ISO-comparable. */
function normalizeBucket(value: unknown): string | null {
  if (typeof value !== "string") return null
  return value.replace(" ", "T").slice(0, 19)
}

function parseSeries(rows: unknown[][]): TrafficSeries | null {
  if (!Array.isArray(rows)) return null
  const pageviews: TrafficPoint[] = []
  const sessions: TrafficPoint[] = []

  for (const row of rows) {
    const bucket = normalizeBucket(row?.[0])
    if (!bucket) continue
    pageviews.push({ x: bucket, y: toNumber(row[1]) })
    // `sessions` carries the visitor count: it is what the merged chart plots.
    sessions.push({ x: bucket, y: toNumber(row[2]) })
  }

  return { pageviews, sessions }
}

function parseBreakdown(rows: unknown[][]): TrafficBreakdownRow[] | null {
  if (!Array.isArray(rows)) return null
  return rows.map((row) => ({
    x: typeof row?.[0] === "string" && row[0].length > 0 ? (row[0] as string) : null,
    y: toNumber(row?.[1]),
  }))
}

/**
 * Loads the traffic half of the report from the PostHog Query API. Failures
 * degrade the source rather than the dashboard: partial data is kept and the
 * status turns `unavailable`.
 */
export async function loadTrafficBundle(
  range: BioRange,
  filters: BioAnalyticsFilters,
  dependencies: PostHogDependencies = {},
): Promise<TrafficBundle> {
  const apiKey = dependencies.apiKey ?? process.env.POSTHOG_API_KEY ?? ""
  const projectId = dependencies.projectId ?? process.env.POSTHOG_PROJECT_ID ?? ""
  if (!apiKey || !projectId) return unconfiguredBundle()

  const host = (dependencies.host ?? process.env.POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST).replace(/\/+$/, "")
  const fetcher = dependencies.fetch ?? globalThis.fetch
  const endpoint = `${host}/api/projects/${encodeURIComponent(projectId)}/query/`
  const plans = planQueries(range, filters)

  const settled = await Promise.allSettled(
    plans.map(async (plan) => {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query: { kind: "HogQLQuery", query: plan.sql } }),
        next: { revalidate: CACHE_SECONDS },
      } as RequestInit)

      if (!response.ok) throw new Error(`${plan.key}: HTTP ${response.status}`)
      const payload = (await response.json()) as QueryResponse
      if (!Array.isArray(payload?.results)) throw new Error(`${plan.key}: unexpected payload`)
      return { key: plan.key, rows: payload.results }
    }),
  )

  const bundle: TrafficBundle = {
    status: "healthy",
    stats: null,
    series: null,
    breakdowns: { ...EMPTY_TRAFFIC_BREAKDOWNS },
    errors: [],
  }

  settled.forEach((result, index) => {
    const plan = plans[index]

    if (result.status === "rejected") {
      bundle.errors.push(`${plan.key}: ${(result.reason as Error)?.message ?? "request failed"}`)
      return
    }

    const { key, rows } = result.value
    if (key === "stats") {
      const stats = parseStats(rows)
      if (stats) bundle.stats = stats
      else bundle.errors.push("stats: unexpected payload")
      return
    }
    if (key === "series") {
      const series = parseSeries(rows)
      if (series) bundle.series = series
      else bundle.errors.push("series: unexpected payload")
      return
    }

    const breakdown = key.slice("breakdown:".length) as TrafficBreakdown
    const parsed = parseBreakdown(rows)
    if (parsed) bundle.breakdowns[breakdown] = parsed
    else bundle.errors.push(`${key}: unexpected payload`)
  })

  if (bundle.errors.length > 0) bundle.status = "unavailable"
  return bundle
}
