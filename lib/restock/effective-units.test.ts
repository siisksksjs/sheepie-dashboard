import { describe, expect, it } from "vitest"

import { buildEffectiveUnitsBySku } from "./effective-units"

describe("buildEffectiveUnitsBySku", () => {
  it("expands a sold Lumi Calmi bundle into both component sales", () => {
    const result = buildEffectiveUnitsBySku({
      guidanceSkus: ["Lumi-001", "Calmi-001"],
      lineItems: [
        {
          sku: "Bundle-Lumi-Calmi",
          quantity: 1,
          pack_size: "single",
          selling_price: 220000,
        },
      ],
      bundleCompositions: [
        {
          bundle_sku: "Bundle-Lumi-Calmi",
          component_sku: "Lumi-001",
          quantity: 1,
        },
        {
          bundle_sku: "Bundle-Lumi-Calmi",
          component_sku: "Calmi-001",
          quantity: 1,
        },
      ],
    })

    expect(Object.fromEntries(result)).toEqual({
      "Lumi-001": 1,
      "Calmi-001": 1,
    })
  })

  it("combines direct component sales, bundle quantities, and pack multipliers", () => {
    const result = buildEffectiveUnitsBySku({
      guidanceSkus: ["Lumi-001", "Calmi-001"],
      lineItems: [
        {
          sku: "Lumi-001",
          quantity: 1,
          pack_size: "bundle_2",
          selling_price: 300000,
        },
        {
          sku: "Bundle-Lumi-Calmi",
          quantity: 2,
          pack_size: "single",
          selling_price: 440000,
        },
      ],
      bundleCompositions: [
        {
          bundle_sku: "Bundle-Lumi-Calmi",
          component_sku: "Lumi-001",
          quantity: 1,
        },
        {
          bundle_sku: "Bundle-Lumi-Calmi",
          component_sku: "Calmi-001",
          quantity: 1,
        },
      ],
    })

    expect(Object.fromEntries(result)).toEqual({
      "Lumi-001": 4,
      "Calmi-001": 2,
    })
  })

  it("ignores zero-price rows and preserves legacy Bundle-Cervi fallback", () => {
    const result = buildEffectiveUnitsBySku({
      guidanceSkus: ["Cervi-001", "Calmi-001"],
      lineItems: [
        {
          sku: "Bundle-Cervi",
          quantity: 1,
          pack_size: "single",
          selling_price: 750000,
        },
        {
          sku: "Calmi-001",
          quantity: 1,
          pack_size: "single",
          selling_price: 0,
        },
      ],
      bundleCompositions: [],
      legacyBundleMappings: [
        {
          bundleSku: "Bundle-Cervi",
          componentSkus: ["Cervi-001", "Calmi-001"],
        },
      ],
    })

    expect(Object.fromEntries(result)).toEqual({
      "Cervi-001": 1,
      "Calmi-001": 1,
    })
  })
})
