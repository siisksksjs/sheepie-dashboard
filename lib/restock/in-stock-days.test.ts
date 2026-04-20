import { describe, expect, it } from "vitest"

import { calculateInStockDays } from "./in-stock-days"

describe("calculateInStockDays", () => {
  it("counts only days where stock was sellable", () => {
    const inStockDays = calculateInStockDays({
      currentStock: 0,
      startDate: "2026-01-01",
      endDate: "2026-01-05",
      deltas: [
        { entry_date: "2026-01-01", quantity: -2 },
        { entry_date: "2026-01-03", quantity: 5 },
        { entry_date: "2026-01-05", quantity: -5 },
      ],
    })

    expect(inStockDays).toBe(4)
  })

  it("returns zero for invalid periods", () => {
    expect(
      calculateInStockDays({
        currentStock: 0,
        startDate: "2026-02-10",
        endDate: "2026-02-01",
        deltas: [],
      }),
    ).toBe(0)
  })
})
