import { readFileSync } from "node:fs"

import { afterEach, describe, expect, it, vi } from "vitest"

import { createSyncDeps } from "./deps"

function stubEnv(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
}

const VALID = {
  SHOPEE_PARTNER_ID: "2042739",
  SHOPEE_PARTNER_KEY: "partner_key_secret",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service_role_secret",
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("createSyncDeps", () => {
  it("builds deps from env", () => {
    stubEnv(VALID)
    const deps = createSyncDeps()
    expect(deps.shopee.buildAuthUrl("https://x/cb")).toContain("partner_id=2042739")
    expect(deps.now()).toBeInstanceOf(Date)
    expect(typeof deps.store.getConnection).toBe("function")
  })

  it("throws without a usable partner id or key, without echoing values", () => {
    for (const env of [
      { SHOPEE_PARTNER_ID: undefined },
      { SHOPEE_PARTNER_ID: "" },
      { SHOPEE_PARTNER_ID: "abc" },
      { SHOPEE_PARTNER_ID: "12.5" },
      { SHOPEE_PARTNER_KEY: undefined },
      { SHOPEE_PARTNER_KEY: "" },
    ]) {
      vi.unstubAllEnvs()
      stubEnv({ ...VALID, ...env })
      expect(() => createSyncDeps()).toThrow(/SHOPEE_PARTNER_(ID|KEY)/)
      try {
        createSyncDeps()
      } catch (error) {
        expect(String(error)).not.toContain("partner_key_secret")
      }
    }
  })
})

describe("service-role modules", () => {
  it("cannot be bundled into client code", () => {
    for (const path of ["lib/supabase/service.ts", "lib/shopee/deps.ts"]) {
      expect(readFileSync(path, "utf8"), path).toMatch(/^import "server-only"$/m)
    }
  })
})
