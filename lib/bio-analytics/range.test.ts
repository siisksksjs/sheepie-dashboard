import { describe, expect, it } from "vitest"

import {
  JAKARTA_TIMEZONE,
  formatJakartaDate,
  parseRange,
  rangeDayCount,
  selectUmamiUnit,
} from "./range"

const NOW = new Date("2026-08-17T12:00:00+07:00")

describe("parseRange", () => {
  it("reports Jakarta as the explicit reporting timezone", () => {
    expect(parseRange({ preset: "7d" }, NOW)).toMatchObject({ timezone: JAKARTA_TIMEZONE })
  })

  it("converts inclusive Jakarta dates into exclusive UTC bounds", () => {
    const range = parseRange(
      { preset: "custom", startDate: "2026-08-01", endDate: "2026-08-17" },
      NOW,
    )

    expect(range.start.toISOString()).toBe("2026-07-31T17:00:00.000Z")
    expect(range.end.toISOString()).toBe("2026-08-17T17:00:00.000Z")
    expect(range.startDate).toBe("2026-08-01")
    expect(range.endDate).toBe("2026-08-17")
  })

  it("covers exactly one Jakarta day for today", () => {
    const range = parseRange({ preset: "today" }, NOW)

    expect(range.start.toISOString()).toBe("2026-08-16T17:00:00.000Z")
    expect(range.end.toISOString()).toBe("2026-08-17T17:00:00.000Z")
    expect(range.days).toBe(1)
  })

  it("makes rolling presets inclusive of today", () => {
    expect(parseRange({ preset: "7d" }, NOW)).toMatchObject({
      startDate: "2026-08-11",
      endDate: "2026-08-17",
      days: 7,
    })
    expect(parseRange({ preset: "28d" }, NOW)).toMatchObject({ startDate: "2026-07-21", days: 28 })
    expect(parseRange({ preset: "90d" }, NOW)).toMatchObject({ startDate: "2026-05-20", days: 90 })
  })

  it("falls back to the default preset for invalid custom dates", () => {
    expect(parseRange({ preset: "custom", startDate: "2026-13-40", endDate: "" }, NOW)).toMatchObject({
      preset: "28d",
      endDate: "2026-08-17",
    })
    expect(parseRange({ preset: "nonsense" }, NOW)).toMatchObject({ preset: "28d" })
  })

  it("swaps a reversed custom range instead of returning an empty window", () => {
    expect(
      parseRange({ preset: "custom", startDate: "2026-08-17", endDate: "2026-08-01" }, NOW),
    ).toMatchObject({ startDate: "2026-08-01", endDate: "2026-08-17" })
  })

  it("never lets a custom range end in the future", () => {
    expect(
      parseRange({ preset: "custom", startDate: "2026-08-10", endDate: "2027-01-01" }, NOW),
    ).toMatchObject({ endDate: "2026-08-17" })
  })
})

describe("selectUmamiUnit", () => {
  it("uses the finest unit that keeps a chart readable", () => {
    expect(selectUmamiUnit({ days: 1 })).toBe("hour")
    expect(selectUmamiUnit({ days: 7 })).toBe("hour")
    expect(selectUmamiUnit({ days: 8 })).toBe("day")
    expect(selectUmamiUnit({ days: 90 })).toBe("day")
    expect(selectUmamiUnit({ days: 91 })).toBe("month")
  })
})

describe("formatJakartaDate", () => {
  it("formats an instant as its Jakarta calendar date", () => {
    expect(formatJakartaDate(new Date("2026-08-17T17:30:00.000Z"))).toBe("2026-08-18")
    expect(formatJakartaDate(new Date("2026-08-17T16:59:59.000Z"))).toBe("2026-08-17")
  })
})

describe("rangeDayCount", () => {
  it("counts inclusive Jakarta days", () => {
    expect(rangeDayCount("2026-08-17", "2026-08-17")).toBe(1)
    expect(rangeDayCount("2026-08-11", "2026-08-17")).toBe(7)
  })
})
