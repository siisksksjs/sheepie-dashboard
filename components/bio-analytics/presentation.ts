import type { BioDestination, ProductSlug } from "@/lib/bio-analytics/types"

export const TRAFFIC_SERIES = [
  { key: "visitors", label: "Pengunjung (Umami)", color: "#3478d4" },
  { key: "sessions", label: "Sesi bio (Supabase)", color: "#7457df" },
  { key: "clicks", label: "Klik keluar (Supabase)", color: "#16a16c" },
] as const

export const SOURCE_LABELS = {
  umami: "Umami",
  supabase: "Supabase",
} as const

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
  share: "Bagikan",
}

export const SECTION_LABELS: Record<string, string> = {
  "bio-header": "Header",
  "bio-hero": "Hero",
  "bio-system-intro": "Pengantar sistem",
  "bio-product-alignment": "CerviCloud",
  "bio-product-darkness": "LumiCloud",
  "bio-product-silence": "CalmiCloud",
  "bio-hub": "Hub tautan",
  "bio-trust": "Kepercayaan",
  "bio-final": "Ajakan akhir",
  "bio-footer": "Footer",
}

export const EVENT_LABELS: Record<string, string> = {
  bio_page_view: "Buka halaman",
  bio_section_view: "Lihat bagian",
  bio_scroll_depth: "Kedalaman gulir",
  bio_product_view: "Lihat produk",
  bio_outbound_click: "Klik keluar",
  bio_share_click: "Klik bagikan",
}

export const WEEKDAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"] as const

export const CHART_PALETTE = [
  "#7457df",
  "#3478d4",
  "#16a16c",
  "#e6922e",
  "#d9534f",
  "#00a3a3",
  "#a855f7",
  "#64748b",
] as const

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
  if (!key) return "Tidak diketahui"
  return map[key] ?? key
}

/** Session ids are anonymous already; shortening keeps the table scannable. */
export function shortenId(value: string | null): string {
  if (!value) return "—"
  return value.slice(0, 8)
}
