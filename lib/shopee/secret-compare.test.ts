import { describe, expect, it } from "vitest"

import { secretsMatch } from "./secret-compare"

describe("secretsMatch", () => {
  it("accepts only the exact secret", () => {
    expect(secretsMatch("s3cret-value", "s3cret-value")).toBe(true)
    for (const provided of [null, undefined, "", "s3cret-valu", "s3cret-value ", "S3CRET-VALUE", "other"]) {
      expect(secretsMatch(provided, "s3cret-value")).toBe(false)
    }
  })

  it("never matches an empty expected secret", () => {
    expect(secretsMatch("", "")).toBe(false)
    expect(secretsMatch("anything", "")).toBe(false)
  })
})
