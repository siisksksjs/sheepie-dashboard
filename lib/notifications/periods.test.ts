import { describe, expect, it } from "vitest"

import {
  getCompletedMonthlyReportPeriod,
  getCompletedWeeklyReportPeriod,
} from "./periods"

describe("report periods", () => {
  it("returns the completed Monday-Sunday week in Jakarta time", () => {
    expect(getCompletedWeeklyReportPeriod(new Date("2026-05-11T01:00:00.000Z"))).toEqual({
      periodStart: "2026-05-04",
      periodEnd: "2026-05-10",
      label: "May 4-10, 2026",
    })
  })

  it("returns the completed previous month in Jakarta time", () => {
    expect(getCompletedMonthlyReportPeriod(new Date("2026-06-01T01:00:00.000Z"))).toEqual({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      label: "May 2026",
    })
  })
})
