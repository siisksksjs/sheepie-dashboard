import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

const { createServerClient } = vi.hoisted(() => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}))
vi.mock("@supabase/ssr", () => ({ createServerClient }))

import { updateSession } from "@/lib/supabase/middleware"
import { isPublicShopeeApiPath } from "./public-paths"

describe("isPublicShopeeApiPath", () => {
  it("public path list", () => {
    expect(isPublicShopeeApiPath("/api/shopee/push")).toBe(true)
    expect(isPublicShopeeApiPath("/api/shopee/sync")).toBe(true)
    expect(isPublicShopeeApiPath("/api/shopee/token")).toBe(true)
    expect(isPublicShopeeApiPath("/api/shopee/connect")).toBe(false)
    expect(isPublicShopeeApiPath("/api/shopee/callback")).toBe(false)
  })

  it("only matches the exact paths", () => {
    for (const path of ["/api/shopee", "/api/shopee/", "/api/shopee/push/x", "/api/shopee/pushx", "/x/api/shopee/sync"]) {
      expect(isPublicShopeeApiPath(path)).toBe(false)
    }
  })
})

describe("updateSession", () => {
  it("lets public Shopee endpoints through without a session", async () => {
    for (const path of ["/api/shopee/push", "/api/shopee/sync", "/api/shopee/token"]) {
      const response = await updateSession(new NextRequest(`https://dashboard.sheepiesleep.com${path}`))
      expect(response.status).toBe(200)
      expect(response.headers.get("location")).toBeNull()
    }
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it("still sends logged-out users on oauth routes to login", async () => {
    for (const path of ["/api/shopee/connect", "/api/shopee/callback"]) {
      const response = await updateSession(new NextRequest(`https://dashboard.sheepiesleep.com${path}`))
      expect(response.headers.get("location")).toBe("https://dashboard.sheepiesleep.com/login")
    }
  })
})
