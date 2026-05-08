const JAKARTA_TIME_ZONE = "Asia/Jakarta"

function getJakartaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: JAKARTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  }
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function utcDateFromParts(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day))
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

function formatRangeLabel(start: Date, end: Date) {
  const sameMonth = start.getUTCMonth() === end.getUTCMonth()
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear()
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const startLabel = [
    monthNames[start.getUTCMonth()],
    start.getUTCDate(),
    sameYear ? null : start.getUTCFullYear(),
  ].filter(Boolean).join(" ")
  const endLabel = [
    sameMonth ? null : monthNames[end.getUTCMonth()],
    end.getUTCDate(),
  ].filter(Boolean).join(" ")

  return `${startLabel}-${endLabel}, ${end.getUTCFullYear()}`
}

export function getCompletedWeeklyReportPeriod(now = new Date()) {
  const parts = getJakartaDateParts(now)
  const today = utcDateFromParts(parts.year, parts.month, parts.day)
  const dayOfWeek = today.getUTCDay()
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const currentWeekMonday = addDays(today, -daysSinceMonday)
  const periodStart = addDays(currentWeekMonday, -7)
  const periodEnd = addDays(currentWeekMonday, -1)

  return {
    periodStart: toDateKey(periodStart),
    periodEnd: toDateKey(periodEnd),
    label: formatRangeLabel(periodStart, periodEnd),
  }
}

export function getCompletedMonthlyReportPeriod(now = new Date()) {
  const parts = getJakartaDateParts(now)
  const currentMonthStart = utcDateFromParts(parts.year, parts.month, 1)
  const periodEnd = addDays(currentMonthStart, -1)
  const periodStart = utcDateFromParts(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, 1)
  const label = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(periodStart)

  return {
    periodStart: toDateKey(periodStart),
    periodEnd: toDateKey(periodEnd),
    label,
  }
}
