import { formatJakartaDate, JAKARTA_TIMEZONE } from "./range"
import type { BioEvent } from "./types"

/**
 * Approved export columns. `visitor_id` is deliberately absent: the dashboard
 * reports on sessions, and a stable per-device id does not belong in a shared file.
 */
export const BIO_EXPORT_HEADERS = [
  "occurred_at_jakarta",
  "event_name",
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
  "scroll_depth",
  "is_returning",
  "screen_category",
  "language",
] as const

const FORMULA_LEAD = /^[=+\-@\t\r]/
const JAKARTA_DATETIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: JAKARTA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

/** Every cell is quoted, quotes are doubled, and formula leads are neutralized. */
export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '""'

  // Only string cells can carry an injected formula; numeric columns are ours.
  const text = String(value)
  const safe = typeof value === "string" && FORMULA_LEAD.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

function formatJakartaDateTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""
  return JAKARTA_DATETIME.format(parsed).replace(", ", " ")
}

export function toBioEventsCsv(events: BioEvent[]): string {
  const header = BIO_EXPORT_HEADERS.map((name) => escapeCsvCell(name)).join(",")

  const rows = events.map((event) =>
    [
      formatJakartaDateTime(event.occurred_at),
      event.event_name,
      event.session_id,
      event.sequence_no,
      event.section_id,
      event.product_slug,
      event.cta_id,
      event.cta_position,
      event.destination,
      event.referrer_category,
      event.utm_source,
      event.utm_medium,
      event.utm_campaign,
      event.utm_content,
      event.utm_term,
      event.elapsed_ms,
      event.scroll_depth,
      event.is_returning,
      event.screen_category,
      event.language,
    ]
      .map(escapeCsvCell)
      .join(","),
  )

  return [header, ...rows].join("\r\n")
}

export function exportFileName(now: Date = new Date()): string {
  return `sheepie-bio-events-${formatJakartaDate(now)}.csv`
}
