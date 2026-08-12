import fs from "node:fs"
import { describe, expect, it } from "vitest"
import { buildKpiActuals } from "@/lib/kpi/workspace"

describe("KPI GMV workspace", () => {
  it("preserves bundle totals and retains unmatched sales", () => {
    const result = buildKpiActuals({
      orders: [{ channel_fees: 30_000, order_line_items: [
        { sku: "Lumi-Calmi-Kit", quantity: 1, pack_size: "single", selling_price: 240_000 },
        { sku: "Other-001", quantity: 1, pack_size: "single", selling_price: 60_000 },
      ] }],
      products: [
        { sku: "Lumi-Calmi-Kit", name: "Kit", variant: null, is_bundle: true },
        { sku: "Other-001", name: "Other", variant: null, is_bundle: false },
      ],
      bundleCompositions: [
        { bundle_sku: "Lumi-Calmi-Kit", component_sku: "Lumi-001", quantity: 1 },
        { bundle_sku: "Lumi-Calmi-Kit", component_sku: "Calmi-001", quantity: 1 },
      ],
    })

    expect(result.totals).toMatchObject({ actual_gmv: 300_000, actual_revenue: 270_000 })
    expect(result.other).toMatchObject({ actual_gmv: 60_000, actual_revenue: 54_000 })
    expect(result.bySku.get("Lumi-001")?.actual_gmv).toBe(120_000)
    expect(result.bySku.get("Calmi-001")?.actual_gmv).toBe(120_000)
  })

  it("defines a target_gmv database migration", () => {
    const migration = fs.readFileSync("supabase/migrations/20260812_rename_kpi_target_revenue_to_gmv.sql", "utf8")
    const types = fs.readFileSync("lib/types/database.types.ts", "utf8")
    expect(migration).toMatch(/rename column target_revenue to target_gmv/i)
    expect(types).toContain("target_gmv: number")
    expect(types).not.toContain("target_revenue: number")
  })
})
