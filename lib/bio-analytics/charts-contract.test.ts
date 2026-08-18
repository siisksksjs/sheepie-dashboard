import fs from "node:fs"
import { describe, expect, it } from "vitest"

const chartsSource = fs.readFileSync("components/bio-analytics/charts.tsx", "utf8")
const tablesSource = fs.readFileSync("components/bio-analytics/tables.tsx", "utf8")
const filtersSource = fs.readFileSync("components/bio-analytics/filters.tsx", "utf8")
const clientSource = fs.readFileSync(
  "app/(dashboard)/bio-analytics/bio-analytics-client.tsx",
  "utf8",
)
const presentationSource = fs.readFileSync("components/bio-analytics/presentation.ts", "utf8")

const allSources = [chartsSource, tablesSource, filtersSource, clientSource, presentationSource]

describe("bio analytics charts match the dashboard chart system", () => {
  it("uses valid theme colors instead of black SVG fallbacks", () => {
    // globals.css stores plain hex, not HSL triplets: hsl(var(--x)) is invalid here.
    for (const source of allSources) {
      expect(source).not.toContain("hsl(var(--")
    }
  })

  it("reuses the shared chart tokens rather than redefining axis and grid styling", () => {
    expect(chartsSource).toContain('from "@/lib/charts/theme"')
    expect(chartsSource).toContain("{...CHART_GRID}")
    expect(chartsSource).toContain("{...CHART_AXIS}")
    expect(chartsSource).not.toMatch(/stroke="hsl/)
    expect(chartsSource).not.toMatch(/strokeDasharray="3 3"/)
  })

  it("matches the existing tooltip, legend, and bar treatments", () => {
    expect(chartsSource).toContain("min-w-48 rounded-xl border bg-card p-3 text-sm shadow-xl")
    expect(chartsSource).toContain(
      "mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground",
    )
    expect(chartsSource).toContain('cursor={CHART_LINE_CURSOR}')
    expect(chartsSource).toContain('cursor={CHART_BAR_CURSOR}')
    expect(chartsSource).toContain('layout="vertical"')
    expect(chartsSource).toContain('barCategoryGap="20%"')
    expect(chartsSource).toContain("ResponsiveContainer")
  })
})

describe("bio analytics dashboard language", () => {
  // Spot-check words that only appear in Indonesian copy, not in shared brand nouns.
  const indonesianMarkers = [
    "Pengunjung",
    "Peristiwa",
    "Rentang",
    "Perangkat",
    "Kampanye",
    "Unduh",
    "Memuat",
    "Tidak ada",
    "Belum ada",
    "Sumber:",
    "Halaman",
  ]

  it("renders entirely in English", () => {
    for (const source of allSources) {
      for (const marker of indonesianMarkers) {
        expect(source).not.toContain(marker)
      }
    }
  })

  it("keeps outbound clicks distinct from purchases", () => {
    expect(chartsSource).toContain("not a purchase")
    expect(clientSource).toContain("not purchases and not revenue")
    // Every mention of a purchase must be a disclaimer, never a metric name.
    for (const source of allSources) {
      const claims = source
        .split("\n")
        .filter((line) => /\bpurchases?\b/i.test(line))
        .filter((line) => !/\bnot\b/i.test(line))
      expect(claims).toEqual([])
    }
  })
})
