import { describe, expect, it } from "vitest"
import {
  FINANCIAL_SERIES,
  formatCompactRupiahAxis,
  sortByGmvDescending,
} from "@/lib/reports/presentation"

describe("report presentation", () => {
  it("formats readable compact Rupiah axis values", () => {
    expect(formatCompactRupiahAxis(0)).toBe("Rp 0")
    expect(formatCompactRupiahAxis(500_000)).toBe("Rp 500 rb")
    expect(formatCompactRupiahAxis(25_000_000)).toBe("Rp 25 jt")
    expect(formatCompactRupiahAxis(1_250_000_000)).toBe("Rp 1,3 M")
  })

  it("keeps the canonical financial order", () => {
    expect(FINANCIAL_SERIES.map((item) => item.key)).toEqual([
      "gmv",
      "revenue",
      "cost",
      "profit",
    ])
  })

  it("sorts report rows by GMV without mutating input", () => {
    const input = [{ name: "A", gmv: 10 }, { name: "B", gmv: 30 }]

    expect(sortByGmvDescending(input).map((row) => row.name)).toEqual(["B", "A"])
    expect(input.map((row) => row.name)).toEqual(["A", "B"])
  })
})
