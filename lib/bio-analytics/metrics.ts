import type {
  BioFunnelCounts,
  BioScrollRow,
  BioTimeSeriesPoint,
  FunnelStep,
  FunnelStepKey,
  MergedTrafficPoint,
  ScrollDepthSummary,
  UmamiSeries,
} from "./types"

const SCROLL_MILESTONES = [25, 50, 75, 100] as const

/** A share in percent, rounded to one decimal and never NaN or Infinity. */
export function percent(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0
  const value = (numerator / denominator) * 100
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0
}

/** Umami reports `2026-08-17 00:00:00`; Supabase reports `2026-08-17`. Align both. */
function normalizeTimestamp(value: string): string {
  const trimmed = value.trim()
  const spaced = trimmed.includes(" ") ? trimmed.replace(" ", "T") : trimmed
  return spaced.endsWith("T00:00:00") ? spaced.slice(0, 10) : spaced
}

/**
 * Combines Umami traffic (labeled visitors) with Supabase behavior (sessions and
 * outbound clicks). The two sources are counted independently and never conflated.
 */
export function mergeTrafficSeries(
  umami: UmamiSeries | null,
  behavior: BioTimeSeriesPoint[],
): MergedTrafficPoint[] {
  const points = new Map<string, MergedTrafficPoint>()

  const upsert = (timestamp: string): MergedTrafficPoint => {
    const key = normalizeTimestamp(timestamp)
    const existing = points.get(key)
    if (existing) return existing
    const created = { timestamp: key, visitors: 0, sessions: 0, clicks: 0 }
    points.set(key, created)
    return created
  }

  for (const point of umami?.sessions ?? []) {
    upsert(point.x).visitors += point.y
  }
  for (const point of behavior) {
    const merged = upsert(point.day)
    merged.sessions += point.sessions
    merged.clicks += point.outbound_clicks
  }

  return [...points.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

const FUNNEL_LABELS: Array<{ key: FunnelStepKey; label: string }> = [
  { key: "page_view", label: "Page view" },
  { key: "section_view", label: "Section view" },
  { key: "product_view", label: "Product view" },
  { key: "outbound_click", label: "Outbound click" },
]

export function buildFunnelSteps(counts: BioFunnelCounts): FunnelStep[] {
  const first = counts[FUNNEL_LABELS[0].key]

  return FUNNEL_LABELS.map((step, index) => {
    const sessions = counts[step.key]
    const previous = index === 0 ? sessions : counts[FUNNEL_LABELS[index - 1].key]
    return {
      ...step,
      sessions,
      conversionFromFirst: index === 0 ? (first > 0 ? 100 : 0) : percent(sessions, first),
      conversionFromPrevious: index === 0 ? (first > 0 ? 100 : 0) : percent(sessions, previous),
    }
  })
}

export function summarizeScrollDepth(rows: BioScrollRow[]): ScrollDepthSummary[] {
  const bySessions = new Map(rows.map((row) => [row.scroll_depth, row.sessions]))
  const widest = Math.max(0, ...rows.map((row) => row.sessions))

  return SCROLL_MILESTONES.map((depth) => {
    const sessions = bySessions.get(depth) ?? 0
    return { depth, sessions, share: percent(sessions, widest) }
  })
}

export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0s"
  const totalSeconds = Math.round(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}
