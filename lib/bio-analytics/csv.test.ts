import { describe, expect, it } from "vitest"

import { BIO_EXPORT_HEADERS, escapeCsvCell, exportFileName, toBioEventsCsv } from "./csv"
import type { BioEvent } from "./types"

function event(overrides: Partial<BioEvent> = {}): BioEvent {
  return {
    id: "row-1",
    event_id: "11111111-1111-4111-8111-111111111111",
    occurred_at: "2026-08-17T13:05:09.000Z",
    received_at: "2026-08-17T13:05:10.000Z",
    schema_version: 1,
    event_name: "bio_outbound_click",
    visitor_id: "33333333-3333-4333-8333-333333333333",
    session_id: "22222222-2222-4222-8222-222222222222",
    sequence_no: 4,
    section_id: "bio-product-alignment",
    product_slug: "cervicloud",
    cta_id: "bio-cervicloud-shopee",
    cta_position: "product-primary",
    destination: "shopee",
    landing_path: "/bio",
    referrer_category: "instagram",
    utm_source: "instagram",
    utm_medium: "social",
    utm_campaign: "bio_launch",
    utm_content: "profile_link",
    utm_term: null,
    elapsed_ms: 18400,
    is_returning: false,
    screen_category: "mobile",
    language: "id-ID",
    timezone: "Asia/Jakarta",
    scroll_depth: null,
    ...overrides,
  }
}

describe("escapeCsvCell", () => {
  it("quotes every cell so delimiters can never leak", () => {
    expect(escapeCsvCell("plain")).toBe('"plain"')
    expect(escapeCsvCell("a,b")).toBe('"a,b"')
    expect(escapeCsvCell("line\nbreak")).toBe('"line\nbreak"')
  })

  it("doubles embedded quotes", () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
  })

  it("renders null and undefined as an empty cell", () => {
    expect(escapeCsvCell(null)).toBe('""')
    expect(escapeCsvCell(undefined)).toBe('""')
  })

  it("neutralizes spreadsheet formulas", () => {
    expect(escapeCsvCell("=1+1")).toBe(`"'=1+1"`)
    expect(escapeCsvCell("+SUM(A1)")).toBe(`"'+SUM(A1)"`)
    expect(escapeCsvCell("-2")).toBe(`"'-2"`)
    expect(escapeCsvCell("@cmd")).toBe(`"'@cmd"`)
    expect(escapeCsvCell("\tlead")).toBe(`"'\tlead"`)
  })

  it("leaves numbers and booleans untouched apart from quoting", () => {
    expect(escapeCsvCell(42)).toBe('"42"')
    expect(escapeCsvCell(-42)).toBe('"-42"')
    expect(escapeCsvCell(false)).toBe('"false"')
  })
})

describe("toBioEventsCsv", () => {
  it("emits a stable header row", () => {
    const [header] = toBioEventsCsv([]).split("\r\n")

    expect(header).toBe(BIO_EXPORT_HEADERS.map((name) => `"${name}"`).join(","))
    expect(BIO_EXPORT_HEADERS).not.toContain("visitor_id")
    expect(BIO_EXPORT_HEADERS).not.toContain("rate_key")
  })

  it("formats timestamps in Jakarta time", () => {
    const [, row] = toBioEventsCsv([event()]).split("\r\n")

    expect(row).toContain('"2026-08-17 20:05:09"')
  })

  it("writes one row per event with approved fields only", () => {
    const csv = toBioEventsCsv([event(), event({ id: "row-2", event_name: "bio_page_view" })])
    const rows = csv.split("\r\n")

    expect(rows).toHaveLength(3)
    expect(csv).not.toContain("33333333-3333-4333-8333-333333333333")
    expect(csv).toContain('"bio-cervicloud-shopee"')
  })

  it("survives injected delimiters inside campaign values", () => {
    const csv = toBioEventsCsv([event({ utm_campaign: 'launch","evil' })])

    expect(csv).toContain('"launch"",""evil"')
    expect(csv.split("\r\n")).toHaveLength(2)
  })
})

describe("exportFileName", () => {
  it("names the file after the Jakarta export date", () => {
    expect(exportFileName(new Date("2026-08-17T17:30:00.000Z"))).toBe("sheepie-bio-events-2026-08-18.csv")
  })
})
