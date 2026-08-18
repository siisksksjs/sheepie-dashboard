import type { BioDestination, BioEvent, BioEventName, ProductSlug } from "@/lib/types/database.types"

export const BIO_RANGE_PRESETS = ["today", "7d", "28d", "90d", "12m", "custom"] as const
export type BioRangePreset = (typeof BIO_RANGE_PRESETS)[number]

export const DEFAULT_BIO_RANGE_PRESET: BioRangePreset = "28d"
export const BIO_EVENT_PAGE_SIZE = 50

export const BIO_SCREEN_CATEGORIES = ["mobile", "tablet", "desktop"] as const
export const BIO_REFERRER_CATEGORIES = ["instagram", "tiktok", "google", "direct", "other"] as const

/** Every filter is URL-backed so a dashboard view can be shared verbatim. */
export type BioAnalyticsFilters = {
  preset: BioRangePreset
  startDate: string | null
  endDate: string | null
  productSlugs: string[]
  destinations: string[]
  utmSources: string[]
  campaigns: string[]
  screenCategories: string[]
  referrerCategories: string[]
  eventPage: number
}

/** The shape `get_bio_analytics_summary` and `get_bio_journeys` accept. */
export type BioRpcFilters = {
  product_slugs?: string[]
  destinations?: string[]
  utm_sources?: string[]
  campaigns?: string[]
  screen_categories?: string[]
  referrer_categories?: string[]
}

export type BioRange = {
  preset: BioRangePreset
  start: Date
  end: Date
  startDate: string
  endDate: string
  days: number
  timezone: string
}

export type SourceStatus = "healthy" | "unavailable" | "unconfigured"

export type BioKpis = {
  sessions: number
  engaged_sessions: number
  outbound_clicks: number
  outbound_ctr: number
  avg_engagement_ms: number
  returning_share: number
}

export type BioTimeSeriesPoint = { day: string; sessions: number; outbound_clicks: number }
export type BioProductRow = { product_slug: ProductSlug; views: number; clicks: number; ctr: number }
export type BioMarketplaceRow = { destination: BioDestination; clicks: number }
export type BioFunnelCounts = {
  page_view: number
  section_view: number
  product_view: number
  outbound_click: number
}
export type BioSectionRow = { section_id: string; sessions: number }
export type BioScrollRow = { scroll_depth: number; sessions: number }
export type BioHeatmapCell = {
  day_of_week: number
  hour_of_day: number
  sessions: number
  events: number
}

export type BioAnalyticsSummary = {
  kpis: BioKpis
  time_series: BioTimeSeriesPoint[]
  products: BioProductRow[]
  marketplaces: BioMarketplaceRow[]
  funnel: BioFunnelCounts
  sections: BioSectionRow[]
  scroll_depth: BioScrollRow[]
  heatmap: BioHeatmapCell[]
}

export type BioJourneyRow = { path: string; sessions: number; share: number }

export type BioFilterOptions = {
  products: string[]
  destinations: string[]
  utm_sources: string[]
  campaigns: string[]
}

export type BioEventPage = {
  rows: BioEvent[]
  page: number
  pageSize: number
  total: number
}

export type BioSupabaseBundle = {
  status: SourceStatus
  summary: BioAnalyticsSummary
  journeys: BioJourneyRow[]
  options: BioFilterOptions
  events: BioEventPage
  errors: string[]
}

export const UMAMI_METRIC_TYPES = [
  "referrer",
  "country",
  "region",
  "device",
  "browser",
  "os",
] as const
export type UmamiMetricType = (typeof UMAMI_METRIC_TYPES)[number]

export type UmamiPoint = { x: string; y: number }
export type UmamiMetricRow = { x: string | null; y: number }

export type UmamiStats = {
  pageviews: number
  visitors: number
  visits: number
  bounces: number
  totaltime: number
}

export type UmamiSeries = { pageviews: UmamiPoint[]; sessions: UmamiPoint[] }

export type UmamiBundle = {
  status: SourceStatus
  stats: UmamiStats | null
  series: UmamiSeries | null
  metrics: Record<UmamiMetricType, UmamiMetricRow[]>
  weekly: number[][] | null
  errors: string[]
}

export type BioAnalyticsBundle = {
  range: BioRange
  filters: BioAnalyticsFilters
  supabase: BioSupabaseBundle
  umami: UmamiBundle
}

export type MergedTrafficPoint = {
  timestamp: string
  visitors: number
  sessions: number
  clicks: number
}

export type FunnelStepKey = keyof BioFunnelCounts

export type FunnelStep = {
  key: FunnelStepKey
  label: string
  sessions: number
  conversionFromFirst: number
  conversionFromPrevious: number
}

export type ScrollDepthSummary = { depth: number; sessions: number; share: number }

export type { BioDestination, BioEvent, BioEventName, ProductSlug }

export const EMPTY_BIO_SUMMARY: BioAnalyticsSummary = {
  kpis: {
    sessions: 0,
    engaged_sessions: 0,
    outbound_clicks: 0,
    outbound_ctr: 0,
    avg_engagement_ms: 0,
    returning_share: 0,
  },
  time_series: [],
  products: [],
  marketplaces: [],
  funnel: { page_view: 0, section_view: 0, product_view: 0, outbound_click: 0 },
  sections: [],
  scroll_depth: [],
  heatmap: [],
}

export const EMPTY_UMAMI_METRICS: Record<UmamiMetricType, UmamiMetricRow[]> = {
  referrer: [],
  country: [],
  region: [],
  device: [],
  browser: [],
  os: [],
}
