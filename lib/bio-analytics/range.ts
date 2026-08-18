import {
  BIO_RANGE_PRESETS,
  DEFAULT_BIO_RANGE_PRESET,
  type BioRange,
  type BioRangePreset,
} from "./types"

/** Sheepie reports in Jakarta time, which has a fixed +07:00 offset and no DST. */
export const JAKARTA_TIMEZONE = "Asia/Jakarta"
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export type RangeInput = {
  preset?: string | null
  startDate?: string | null
  endDate?: string | null
}

function isValidDate(value: string | null | undefined): value is string {
  const match = DATE_PATTERN.exec(value ?? "")
  if (!match) return false

  const [, year, month, day] = match
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() + 1 === Number(month) &&
    parsed.getUTCDate() === Number(day)
  )
}

/** The Jakarta calendar date an instant falls on. */
export function formatJakartaDate(instant: Date): string {
  return new Date(instant.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10)
}

/** Midnight Jakarta on the given calendar date, expressed as a UTC instant. */
export function jakartaStartOfDay(date: string): Date {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() - JAKARTA_OFFSET_MS)
}

export function shiftDate(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

export function rangeDayCount(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime()
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime()
  return Math.max(1, Math.round((end - start) / DAY_MS) + 1)
}

const PRESET_LOOKBACK_DAYS: Partial<Record<BioRangePreset, number>> = {
  today: 1,
  "7d": 7,
  "28d": 28,
  "90d": 90,
  "12m": 365,
}

function normalizePreset(value: string | null | undefined): BioRangePreset {
  return BIO_RANGE_PRESETS.includes(value as BioRangePreset)
    ? (value as BioRangePreset)
    : DEFAULT_BIO_RANGE_PRESET
}

/**
 * Resolves URL input into inclusive Jakarta calendar dates plus the exclusive
 * UTC instants the Supabase RPCs and the Umami API expect.
 */
export function parseRange(input: RangeInput, now: Date = new Date()): BioRange {
  const today = formatJakartaDate(now)
  let preset = normalizePreset(input.preset)
  let startDate: string
  let endDate: string

  if (preset === "custom" && isValidDate(input.startDate) && isValidDate(input.endDate)) {
    const [first, second] =
      input.startDate <= input.endDate
        ? [input.startDate, input.endDate]
        : [input.endDate, input.startDate]
    startDate = first > today ? today : first
    endDate = second > today ? today : second
  } else {
    if (preset === "custom") preset = DEFAULT_BIO_RANGE_PRESET
    endDate = today
    startDate = shiftDate(today, -(PRESET_LOOKBACK_DAYS[preset] ?? 28) + 1)
  }

  return {
    preset,
    start: jakartaStartOfDay(startDate),
    end: jakartaStartOfDay(shiftDate(endDate, 1)),
    startDate,
    endDate,
    days: rangeDayCount(startDate, endDate),
    timezone: JAKARTA_TIMEZONE,
  }
}

export type UmamiTimeUnit = "hour" | "day" | "month"

export function selectUmamiUnit(range: { days: number }): UmamiTimeUnit {
  if (range.days <= 7) return "hour"
  if (range.days <= 90) return "day"
  return "month"
}
