import fs from "node:fs"
import { describe, expect, it } from "vitest"

describe("dashboard visual contract", () => {
  const source = fs.readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8")
  const stockOverview = source.slice(source.indexOf("{/* Current Stock Overview */}"))

  it("uses physical products for stock totals and never appends bundle overview rows", () => {
    expect(source).toContain("const physicalStockData = stockData.filter")
    expect(stockOverview).toContain("physicalStockData.map")
    expect(stockOverview).not.toContain("{/* Bundles with calculated availability */}")
    expect(stockOverview).not.toContain("bundles.map((bundle) =>")
  })

  it("uses a wide responsive KPI layout with contained numeric values", () => {
    expect(source).toContain("xl:grid-cols-3")
    expect(source).toContain("tabular-nums")
    expect(source).toContain("break-words")
  })
})
