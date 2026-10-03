import fs from "node:fs"
import { describe, expect, it } from "vitest"

const orders = fs.readFileSync("lib/actions/orders.ts", "utf8")
const daily = fs.readFileSync("lib/orders/daily-sales.ts", "utf8")
const products = fs.readFileSync("lib/actions/products.ts", "utf8")

describe("sales calculation consumers", () => {
  it("uses the canonical calculator in order and daily report paths", () => {
    for (const source of [orders, daily, products]) {
      expect(source).toContain("calculateSalesOrder")
    }
  })

  it("exposes GMV alongside Revenue in report rows", () => {
    expect(orders).toMatch(/type ProductSalesRow = \{[\s\S]*gmv: number[\s\S]*revenue: number/)
    expect(orders).toMatch(/type ChannelSalesRow = \{[\s\S]*gmv: number[\s\S]*revenue: number/)
    expect(orders).toMatch(/type MonthlySalesRow = \{[\s\S]*gmv: number[\s\S]*revenue: number/)
  })
})
