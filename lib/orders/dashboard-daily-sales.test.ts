import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const dashboardSource = fs.readFileSync(
  path.resolve(process.cwd(), "app/(dashboard)/dashboard/page.tsx"),
  "utf8",
)
const ordersSource = fs.readFileSync(
  path.resolve(process.cwd(), "lib/actions/orders.ts"),
  "utf8",
)

describe("dashboard daily product sales contract", () => {
  it("loads bundle compositions and delegates aggregation to the daily sales helper", () => {
    const snippet = ordersSource.slice(
      ordersSource.indexOf("export async function getDailySalesSnippet"),
      ordersSource.indexOf("export async function getMonthlySalesByDay"),
    )

    expect(snippet).toContain('from("bundle_compositions")')
    expect(snippet).toContain("buildDailySalesSummary({")
    expect(snippet).not.toContain("byProductAndChannel")
  })
})
