import type { Channel } from "@/lib/types/database.types"

export const CHANNEL_SCOPE_ORDER: Channel[] = [
  "shopee",
  "tokopedia",
  "tiktok",
  "offline",
]

const CHANNEL_SCOPE_SET = new Set<Channel>(CHANNEL_SCOPE_ORDER)

export function isChannel(value: string): value is Channel {
  return CHANNEL_SCOPE_SET.has(value as Channel)
}

export function normalizeChannels(channels: readonly Channel[]) {
  return Array.from(new Set(channels)).sort((left, right) => {
    return CHANNEL_SCOPE_ORDER.indexOf(left) - CHANNEL_SCOPE_ORDER.indexOf(right)
  })
}

export function buildChannelScopeKey(channels: readonly Channel[]) {
  return normalizeChannels(channels).join("|")
}

export function scopeIncludesChannel(
  channels: readonly Channel[],
  channel: Channel,
) {
  return channels.includes(channel)
}
