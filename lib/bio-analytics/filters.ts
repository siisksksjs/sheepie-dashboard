import {
  BIO_REFERRER_CATEGORIES,
  BIO_SCREEN_CATEGORIES,
  DEFAULT_BIO_RANGE_PRESET,
  BIO_RANGE_PRESETS,
  type BioAnalyticsFilters,
  type BioRangePreset,
} from "./types"

export type SearchParamValue = string | string[] | undefined
export type BioSearchParams = Record<string, SearchParamValue>

const MAX_SELECTION_VALUES = 20
const MAX_VALUE_LENGTH = 200

/** Search params arrive as `?a=1&a=2` or `?a=1,2`; both mean the same selection. */
function readList(value: SearchParamValue): string[] {
  const raw = Array.isArray(value) ? value : value === undefined ? [] : [value]
  const values = raw
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.length <= MAX_VALUE_LENGTH)
  return [...new Set(values)].slice(0, MAX_SELECTION_VALUES)
}

function readOne(value: SearchParamValue): string | null {
  const first = Array.isArray(value) ? value[0] : value
  const trimmed = first?.trim()
  return trimmed && trimmed.length <= MAX_VALUE_LENGTH ? trimmed : null
}

function readAllowed(value: SearchParamValue, allowed: readonly string[]): string[] {
  return readList(value).filter((entry) => allowed.includes(entry))
}

function readPage(value: SearchParamValue): number {
  const parsed = Number(readOne(value))
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1
}

/**
 * Turns raw search params into a filter set. Unknown enumeration values are
 * discarded rather than forwarded, so a hand-edited URL cannot widen the query.
 */
export function parseBioFilters(params: BioSearchParams): BioAnalyticsFilters {
  const preset = readOne(params.preset)

  return {
    preset: BIO_RANGE_PRESETS.includes(preset as BioRangePreset)
      ? (preset as BioRangePreset)
      : DEFAULT_BIO_RANGE_PRESET,
    startDate: readOne(params.from),
    endDate: readOne(params.to),
    productSlugs: readAllowed(params.product, ["cervicloud", "lumicloud", "calmicloud"]),
    destinations: readAllowed(params.destination, [
      "shopee",
      "tokopedia",
      "website",
      "whatsapp",
      "instagram",
      "tiktok",
      "email",
      "share",
    ]),
    utmSources: readList(params.source),
    campaigns: readList(params.campaign),
    screenCategories: readAllowed(params.device, BIO_SCREEN_CATEGORIES),
    referrerCategories: readAllowed(params.referrer, BIO_REFERRER_CATEGORIES),
    eventPage: readPage(params.page),
  }
}

/** Serializes filters back into a shareable query string with stable key order. */
export function serializeBioFilters(filters: BioAnalyticsFilters): string {
  const params = new URLSearchParams()
  params.set("preset", filters.preset)
  if (filters.preset === "custom") {
    if (filters.startDate) params.set("from", filters.startDate)
    if (filters.endDate) params.set("to", filters.endDate)
  }

  const lists: Array<[string, string[]]> = [
    ["product", filters.productSlugs],
    ["destination", filters.destinations],
    ["source", filters.utmSources],
    ["campaign", filters.campaigns],
    ["device", filters.screenCategories],
    ["referrer", filters.referrerCategories],
  ]
  for (const [key, values] of lists) {
    if (values.length > 0) params.set(key, values.join(","))
  }
  if (filters.eventPage > 1) params.set("page", String(filters.eventPage))

  return params.toString()
}

export function hasActiveBioFilters(filters: BioAnalyticsFilters): boolean {
  return (
    filters.productSlugs.length > 0 ||
    filters.destinations.length > 0 ||
    filters.utmSources.length > 0 ||
    filters.campaigns.length > 0 ||
    filters.screenCategories.length > 0 ||
    filters.referrerCategories.length > 0
  )
}
