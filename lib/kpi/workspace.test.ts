import fs from "node:fs"
import { describe, expect, it } from "vitest"
import { buildKpiActuals } from "@/lib/kpi/workspace"

describe("KPI GMV workspace", () => {
  it("allocates bundle sales to tracked components and excludes Cervi-002", () => {
    const result = buildKpiActuals({
      orders: [{ channel_fees: 36_000, order_line_items: [
        { sku: "Lumi-001", quantity: 1, pack_size: "single", selling_price: 60_000 },
        { sku: "Lumi-Calmi-Kit", quantity: 1, pack_size: "single", selling_price: 240_000 },
        { sku: "Cervi-002", quantity: 1, pack_size: "single", selling_price: 60_000 },
      ] }],
      products: [
        { sku: "Lumi-001", is_bundle: false },
        { sku: "Calmi-001", is_bundle: false },
        { sku: "Cervi-002", is_bundle: false },
        { sku: "Lumi-Calmi-Kit", is_bundle: true },
      ],
      bundleCompositions: [
        { bundle_sku: "Lumi-Calmi-Kit", component_sku: "Lumi-001", quantity: 1 },
        { bundle_sku: "Lumi-Calmi-Kit", component_sku: "Calmi-001", quantity: 1 },
      ],
    })

    expect(result.totals).toMatchObject({ actual_units: 3, actual_gmv: 300_000, actual_revenue: 270_000 })
    expect(result.other).toMatchObject({ actual_units: 1, actual_gmv: 60_000, actual_revenue: 54_000 })
    expect(result.bySku.get("Lumi-001")).toMatchObject({ actual_units: 2, actual_gmv: 180_000 })
    expect(result.bySku.get("Calmi-001")).toMatchObject({ actual_units: 1, actual_gmv: 120_000 })
    expect(Array.from(result.bySku.keys())).toEqual(["Lumi-001", "Calmi-001"])
  })

  it("does not expose a synthetic other-products KPI row", () => {
    const actionSource = fs.readFileSync("lib/actions/kpi.ts", "utf8")

    expect(actionSource).not.toContain('sku: "__other__"')
    expect(actionSource).not.toContain('name: "Other products and bundles"')
  })

  it("defines a target_gmv database migration", () => {
    const migration = fs.readFileSync("supabase/migrations/20260812_rename_kpi_target_revenue_to_gmv.sql", "utf8")
    const types = fs.readFileSync("lib/types/database.types.ts", "utf8")
    expect(migration).toMatch(/rename column target_revenue to target_gmv/i)
    expect(types).toContain("target_gmv: number")
    expect(types).not.toContain("target_revenue: number")
  })
})
