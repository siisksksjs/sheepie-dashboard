import { describe, expect, it } from "vitest"

import { hasActiveBioFilters, parseBioFilters, serializeBioFilters } from "./filters"

describe("parseBioFilters", () => {
  it("defaults to the 28-day preset and the first event page", () => {
    expect(parseBioFilters({})).toEqual({
      preset: "28d",
      startDate: null,
      endDate: null,
      productSlugs: [],
      destinations: [],
      utmSources: [],
      campaigns: [],
      screenCategories: [],
      referrerCategories: [],
      eventPage: 1,
    })
  })

  it("accepts repeated and comma-joined selections alike", () => {
    expect(parseBioFilters({ product: ["cervicloud", "lumicloud"] }).productSlugs).toEqual([
      "cervicloud",
      "lumicloud",
    ])
    expect(parseBioFilters({ product: "cervicloud,lumicloud" }).productSlugs).toEqual([
      "cervicloud",
      "lumicloud",
    ])
  })

  it("discards values outside the known enumerations", () => {
    const filters = parseBioFilters({
      preset: "everything",
      product: "cervicloud,sheepcloud",
      destination: "shopee,lazada",
      device: "mobile,watch",
      referrer: "instagram,carrier-pigeon",
    })

    expect(filters).toMatchObject({
      preset: "28d",
      productSlugs: ["cervicloud"],
      destinations: ["shopee"],
      screenCategories: ["mobile"],
      referrerCategories: ["instagram"],
    })
  })

  it("keeps free-text campaign and source values but bounds and dedupes them", () => {
    const filters = parseBioFilters({
      source: "instagram,instagram,tiktok",
      campaign: `${"x".repeat(201)},launch`,
    })

    expect(filters.utmSources).toEqual(["instagram", "tiktok"])
    expect(filters.campaigns).toEqual(["launch"])
  })

  it("rejects non-positive and non-integer pages", () => {
    expect(parseBioFilters({ page: "0" }).eventPage).toBe(1)
    expect(parseBioFilters({ page: "-3" }).eventPage).toBe(1)
    expect(parseBioFilters({ page: "2.5" }).eventPage).toBe(1)
    expect(parseBioFilters({ page: "4" }).eventPage).toBe(4)
  })
})

describe("serializeBioFilters", () => {
  it("round-trips a filter set", () => {
    const filters = parseBioFilters({
      preset: "custom",
      from: "2026-08-01",
      to: "2026-08-17",
      product: "cervicloud",
      device: "mobile",
      page: "3",
    })

    expect(parseBioFilters(Object.fromEntries(new URLSearchParams(serializeBioFilters(filters))))).toEqual(
      filters,
    )
  })

  it("omits custom dates for rolling presets and defaults for empty selections", () => {
    const query = serializeBioFilters(parseBioFilters({ preset: "7d", from: "2026-08-01" }))

    expect(query).toBe("preset=7d")
  })
})

describe("hasActiveBioFilters", () => {
  it("ignores the range when deciding whether filters are active", () => {
    expect(hasActiveBioFilters(parseBioFilters({ preset: "90d" }))).toBe(false)
    expect(hasActiveBioFilters(parseBioFilters({ device: "mobile" }))).toBe(true)
  })
})
