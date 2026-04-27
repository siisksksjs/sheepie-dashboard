import { describe, expect, it } from "vitest"

import {
  decodeProductSkuParam,
  getBundleCompositionHref,
  getProductEditHref,
} from "./routes"

describe("product route helpers", () => {
  it("encodes SKU path segments for edit and bundle links", () => {
    const sku = "Bundle/Cervi #1"

    expect(getProductEditHref(sku)).toBe("/products/Bundle%2FCervi%20%231/edit")
    expect(getBundleCompositionHref(sku)).toBe("/products/Bundle%2FCervi%20%231/bundles")
  })

  it("decodes route params before product lookups", () => {
    expect(decodeProductSkuParam("Bundle%2FCervi%20%231")).toBe("Bundle/Cervi #1")
  })

  it("keeps malformed route params unchanged", () => {
    expect(decodeProductSkuParam("Bundle%")).toBe("Bundle%")
  })
})
