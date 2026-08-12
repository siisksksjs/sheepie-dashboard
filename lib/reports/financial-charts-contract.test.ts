import fs from "node:fs"
import { describe, expect, it } from "vitest"

describe("financial report charts", () => {
  const source = fs.readFileSync("components/reports/financial-charts.tsx", "utf8")
  const reportsSource = fs.readFileSync("app/(dashboard)/reports/reports-client.tsx", "utf8")

  it("uses compact axes and an opaque ordered tooltip", () => {
    expect(source).toContain("formatCompactRupiahAxis")
    expect(source).toContain("FINANCIAL_SERIES.map")
    expect(source).toContain("bg-card")
    expect(source).toContain("shadow-xl")
  })

  it("renders trend and horizontal comparison charts", () => {
    expect(source).toContain("export function FinancialTrendChart")
    expect(source).toContain("export function FinancialComparisonChart")
    expect(source).toContain('layout="vertical"')
  })

  it("renders units with a readable custom tooltip and subtle cursor", () => {
    expect(source).toContain("export function UnitsTrendChart")
    expect(source).toContain("Units Sold")
    expect(source).toContain('cursor={{ fill: "var(--muted)" }}')
  })

  it("uses valid theme colors instead of black SVG fallbacks", () => {
    expect(source).not.toContain("hsl(var(--")
    expect(reportsSource).not.toContain("hsl(var(--")
    expect(source).toContain('cursor={{ stroke: "var(--border)", strokeWidth: 1 }}')
  })
})
