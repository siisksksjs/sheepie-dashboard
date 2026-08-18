import { CHART_COLORS } from "@/lib/charts/theme"
import type { BioDestination, ProductSlug } from "@/lib/bio-analytics/types"

export const TRAFFIC_SERIES = [
  { key: "visitors", label: "Visitors (PostHog)", color: CHART_COLORS.blue },
  { key: "sessions", label: "Bio sessions (Supabase)", color: CHART_COLORS.violet },
  { key: "clicks", label: "Outbound clicks (Supabase)", color: CHART_COLORS.green },
] as const

export const PRODUCT_LABELS: Record<ProductSlug, string> = {
  cervicloud: "CerviCloud",
  lumicloud: "LumiCloud",
  calmicloud: "CalmiCloud",
}

export const DESTINATION_LABELS: Record<BioDestination, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  website: "Website",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  tiktok: "TikTok",
  email: "Email",
  share: "Share",
}

export const SECTION_LABELS: Record<string, string> = {
  "bio-header": "Header",
  "bio-banner": "Banner",
  "bio-hero": "Hero",
  "bio-system-intro": "System intro",
  "bio-product-alignment": "CerviCloud",
  "bio-product-darkness": "LumiCloud",
  "bio-product-silence": "CalmiCloud",
  "bio-hub": "Link hub",
  "bio-testimonials": "Shopee reviews",
  "bio-trust": "Trust",
  "bio-final": "Final CTA",
  "bio-footer": "Footer",
}

export const EVENT_LABELS: Record<string, string> = {
  bio_page_view: "Page view",
  bio_section_view: "Section view",
  bio_scroll_depth: "Scroll depth",
  bio_product_view: "Product view",
  bio_outbound_click: "Outbound click",
  bio_share_click: "Share click",
}

export const SCREEN_LABELS: Record<string, string> = {
  mobile: "Mobile",
  tablet: "Tablet",
  desktop: "Desktop",
}

export const REFERRER_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  google: "Google",
  direct: "Direct",
  other: "Other",
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

// Counts stay in id-ID grouping, matching the rest of the dashboard.
const numberFormat = new Intl.NumberFormat("id-ID")

export function formatCount(value: number): string {
  return numberFormat.format(Number.isFinite(value) ? value : 0)
}

export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(
    Number.isFinite(value) ? value : 0,
  )}%`
}

export function labelFor(map: Record<string, string>, key: string | null): string {
  if (!key) return "Unknown"
  return map[key] ?? key
}

/** Session ids are anonymous already; shortening keeps the table scannable. */
export function shortenId(value: string | null): string {
  if (!value) return "—"
  return value.slice(0, 8)
}
