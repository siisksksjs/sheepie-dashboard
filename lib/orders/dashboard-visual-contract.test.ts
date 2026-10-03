import fs from "node:fs"
import { describe, expect, it } from "vitest"

describe("Today page contract", () => {
  const page = fs.readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8")
  const data = fs.readFileSync("lib/queries/today.ts", "utf8")

  it("builds stock from physical products only — bundles never appear as stock rows", () => {
    expect(data).toContain(".filter((s) => !s.is_bundle && s.status === \"active\")")
    expect(page).toContain("stock.map((s) =>")
    expect(page).not.toContain("bundles.map(")
  })

  it("keeps money and counts in tabular figures", () => {
    expect(page).toContain("num")
    expect(page).toContain("formatCurrency")
  })
})
