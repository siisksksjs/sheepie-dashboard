import { describe, expect, it } from "vitest"

import {
  DEFAULT_PACK_SIZE,
  getPackMultiplier,
  getPackSizeLabel,
  isValidPackSize,
  PACK_SIZE_OPTIONS,
} from "./pack-sizes"

describe("pack size helpers", () => {
  it("exposes the supported pack-size vocabulary", () => {
    expect(PACK_SIZE_OPTIONS.map((item) => item.value)).toEqual([
      "single",
      "bundle_2",
      "bundle_3",
      "bundle_4",
    ])
  })

  it("returns the correct multiplier per pack size", () => {
    expect(getPackMultiplier("single")).toBe(1)
    expect(getPackMultiplier("bundle_2")).toBe(2)
    expect(getPackMultiplier("bundle_3")).toBe(3)
    expect(getPackMultiplier("bundle_4")).toBe(4)
  })

  it("guards unknown values and preserves the single default", () => {
    expect(DEFAULT_PACK_SIZE).toBe("single")
    expect(isValidPackSize("bundle_3")).toBe(true)
    expect(isValidPackSize("legacy")).toBe(false)
  })

  it("returns a human label for the pack size", () => {
    expect(getPackSizeLabel("bundle_2")).toBe("Bundle of 2")
  })
})
