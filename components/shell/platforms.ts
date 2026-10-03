import type { Channel } from "@/lib/types/database.types"

/** Platform identity colours — small badges only, so the wrong platform is obvious at a glance. */
export const PLATFORMS: Record<Channel, { label: string; short: string; color: string }> = {
  shopee: { label: "Shopee", short: "SH", color: "#ee4d2d" },
  tokopedia: { label: "Tokopedia", short: "TP", color: "#03ac0e" },
  tiktok: { label: "TikTok", short: "TT", color: "#161823" },
  offline: { label: "Offline", short: "OF", color: "#6f7fae" },
}

export const PLATFORM_ORDER: Channel[] = ["shopee", "tiktok", "tokopedia", "offline"]
