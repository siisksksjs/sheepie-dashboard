import { describe, expect, it } from "vitest"

import {
  calculateSalesOrder,
  getSalesPackMultiplier,
  isQualifyingSalesStatus,
} from "@/supabase/functions/_shared/sales-metrics"

describe("canonical sales metrics", () => {
  it("calculates GMV, Revenue, COGS, and Profit for a mixed order", () => {
    const result = calculateSalesOrder({
      channelFees: 20_000,
      lines: [
        { key: "A", sellingPrice: 100_000, quantity: 1, packSize: "single", unitCost: 40_000 },
        { key: "B", sellingPrice: 50_000, quantity: 2, packSize: "single", unitCost: 20_000 },
      ],
    })

    expect(result.totals).toMatchObject({
      gmv: 200_000,
      channelFees: 20_000,
      revenue: 180_000,
      cogs: 80_000,
      profit: 100_000,
      hasCompleteCostData: true,
    })
    expect(result.lines.map((line) => line.channelFees)).toEqual([10_000, 10_000])
  })

  it("uses physical units for pack COGS", () => {
    const result = calculateSalesOrder({
      channelFees: null,
      lines: [
        { key: "pack", sellingPrice: 270_000, quantity: 2, packSize: "bundle_3", unitCost: 30_000 },
      ],
    })

    expect(result.lines[0]).toMatchObject({ units: 6, gmv: 540_000, revenue: 540_000, cogs: 180_000, profit: 360_000 })
  })

  it("treats a missing fee as zero and flags missing costs", () => {
    const result = calculateSalesOrder({
      channelFees: null,
      lines: [{ key: "legacy", sellingPrice: 75_000, quantity: 1, packSize: null, unitCost: null }],
    })

    expect(result.totals).toMatchObject({ gmv: 75_000, channelFees: 0, revenue: 75_000, cogs: 0, profit: 75_000, hasCompleteCostData: false })
  })

  it("defines the one qualifying-order rule", () => {
    expect(isQualifyingSalesStatus("paid")).toBe(true)
    expect(isQualifyingSalesStatus("shipped")).toBe(true)
    expect(isQualifyingSalesStatus("cancelled")).toBe(false)
    expect(isQualifyingSalesStatus("returned")).toBe(false)
  })

  it("uses the canonical pack multipliers", () => {
    expect(["single", "bundle_2", "bundle_3", "bundle_4"].map(getSalesPackMultiplier)).toEqual([1, 2, 3, 4])
  })
})
