import { describe, expect, it } from "vitest"
import { ShopeeApiError, createShopeeClient } from "./client"

const PARTNER_KEY = "super_secret_partner_key"
const NOW_MS = 1730700000_000
const auth = { shopId: 123456789, accessToken: "tok_abc" }

type Call = { url: URL; init?: RequestInit }

function fakeFetch(respond: (call: Call, index: number) => unknown, status = 200) {
  const calls: Call[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: new URL(String(input)), init }
    calls.push(call)
    return new Response(JSON.stringify(respond(call, calls.length - 1)), { status })
  }) as typeof fetch
  return { calls, fetchImpl }
}

function makeClient(fetchImpl: typeof fetch) {
  return createShopeeClient({ partnerId: 2042739, partnerKey: PARTNER_KEY, fetchImpl, now: () => NOW_MS })
}

describe("buildAuthUrl", () => {
  it("builds a signed auth_partner url", () => {
    const client = makeClient(fakeFetch(() => ({})).fetchImpl)
    const url = new URL(client.buildAuthUrl("https://dashboard.sheepiesleep.com/api/shopee/callback"))
    expect(url.origin + url.pathname).toBe("https://partner.shopeemobile.com/api/v2/shop/auth_partner")
    expect(url.searchParams.get("partner_id")).toBe("2042739")
    expect(url.searchParams.get("timestamp")).toBe("1730700000")
    expect(url.searchParams.get("redirect")).toBe("https://dashboard.sheepiesleep.com/api/shopee/callback")
    expect(url.searchParams.get("sign")).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("tokens", () => {
  it("getTokens posts code and maps expiry", async () => {
    const { calls, fetchImpl } = fakeFetch(() => ({
      error: "",
      message: "",
      access_token: "a1",
      refresh_token: "r1",
      expire_in: 14400,
    }))
    const tokens = await makeClient(fetchImpl).getTokens("code123", 123456789)
    expect(calls[0].url.pathname).toBe("/api/v2/auth/token/get")
    expect(calls[0].init?.method).toBe("POST")
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ code: "code123", shop_id: 123456789, partner_id: 2042739 })
    expect(tokens.accessToken).toBe("a1")
    expect(tokens.refreshToken).toBe("r1")
    expect(tokens.accessExpiresAt.getTime()).toBe(NOW_MS + (14400 - 300) * 1000)
    expect(tokens.refreshExpiresAt.getTime()).toBe(NOW_MS + 30 * 86400 * 1000)
  })

  it("refreshTokens posts refresh token with partner and shop id", async () => {
    const { calls, fetchImpl } = fakeFetch(() => ({ access_token: "a2", refresh_token: "r2", expire_in: 14400 }))
    const tokens = await makeClient(fetchImpl).refreshTokens("r1", 123456789)
    expect(calls[0].url.pathname).toBe("/api/v2/auth/access_token/get")
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      refresh_token: "r1",
      shop_id: 123456789,
      partner_id: 2042739,
    })
    expect(tokens.accessToken).toBe("a2")
    expect(tokens.refreshToken).toBe("r2")
  })
})

describe("listOrderSns", () => {
  it("splits 20 days into two calls and follows cursor", async () => {
    const from = 1730000000
    const to = from + 20 * 86400
    const { calls, fetchImpl } = fakeFetch((call, i) => {
      if (i === 0) return { error: "", response: { order_list: [{ order_sn: "A" }, { order_sn: "B" }], more: true, next_cursor: "c2" } }
      if (i === 1) return { error: "", response: { order_list: [{ order_sn: "C" }], more: false } }
      return { error: "", response: { order_list: [{ order_sn: "D" }], more: false } }
    })
    const sns = await makeClient(fetchImpl).listOrderSns(auth, { from, to })

    expect(sns).toEqual(["A", "B", "C", "D"])
    expect(calls).toHaveLength(3)
    const p = calls.map((c) => c.url.searchParams)
    expect(calls[0].url.pathname).toBe("/api/v2/order/get_order_list")
    expect(calls[0].init?.method ?? "GET").toBe("GET")
    expect(p[0].get("time_range_field")).toBe("update_time")
    expect(p[0].get("page_size")).toBe("100")
    expect(p[0].get("time_from")).toBe(String(from))
    expect(p[0].get("time_to")).toBe(String(from + 15 * 86400))
    expect(p[0].get("cursor")).toBe("")
    expect(p[1].get("time_from")).toBe(String(from))
    expect(p[1].get("time_to")).toBe(String(from + 15 * 86400))
    expect(p[1].get("cursor")).toBe("c2")
    expect(p[2].get("time_from")).toBe(String(from + 15 * 86400))
    expect(p[2].get("time_to")).toBe(String(to))
    expect(p[2].get("cursor")).toBe("")
    expect(p[0].get("access_token")).toBe("tok_abc")
    expect(p[0].get("shop_id")).toBe("123456789")
  })

  it("returns an empty list for an empty range", async () => {
    const { calls, fetchImpl } = fakeFetch(() => ({}))
    expect(await makeClient(fetchImpl).listOrderSns(auth, { from: 100, to: 100 })).toEqual([])
    expect(calls).toHaveLength(0)
  })
})

describe("getOrderDetails", () => {
  it("batches 120 sns as 50/50/20", async () => {
    const sns = Array.from({ length: 120 }, (_, i) => `SN${i}`)
    const { calls, fetchImpl } = fakeFetch((call) => ({
      error: "",
      response: {
        order_list: (call.url.searchParams.get("order_sn_list") ?? "").split(",").map((sn) => ({
          order_sn: sn,
          order_status: "READY_TO_SHIP",
          create_time: 1,
          update_time: 2,
          item_list: [],
        })),
      },
    }))
    const details = await makeClient(fetchImpl).getOrderDetails(auth, sns)

    expect(calls.map((c) => c.url.searchParams.get("order_sn_list")!.split(",").length)).toEqual([50, 50, 20])
    expect(calls[0].url.pathname).toBe("/api/v2/order/get_order_detail")
    expect(calls[0].url.searchParams.get("response_optional_fields")).toBe("item_list,order_status")
    expect(details).toHaveLength(120)
    expect(details[119].order_sn).toBe("SN119")
  })

  it("makes no request for an empty list", async () => {
    const { calls, fetchImpl } = fakeFetch(() => ({}))
    expect(await makeClient(fetchImpl).getOrderDetails(auth, [])).toEqual([])
    expect(calls).toHaveLength(0)
  })
})

describe("errors", () => {
  it("api error throws ShopeeApiError with code (even on HTTP 200)", async () => {
    const { fetchImpl } = fakeFetch(() => ({ error: "invalid_acceess_token", message: "Invalid access_token" }))
    const err = await makeClient(fetchImpl)
      .listOrderSns(auth, { from: 0, to: 100 })
      .catch((e) => e)
    expect(err).toBeInstanceOf(ShopeeApiError)
    expect(err.code).toBe("invalid_acceess_token")
    expect(err.message).toContain("Invalid access_token")
  })

  it("throws ShopeeApiError on error with non-2xx status", async () => {
    const { fetchImpl } = fakeFetch(() => ({ error: "error_auth", message: "bad sign" }), 403)
    await expect(makeClient(fetchImpl).refreshTokens("r", 1)).rejects.toMatchObject({ code: "error_auth" })
  })

  it("throws ShopeeApiError when the response is not JSON", async () => {
    const fetchImpl = (async () => new Response("<html>bad gateway</html>", { status: 502 })) as typeof fetch
    await expect(makeClient(fetchImpl).refreshTokens("r", 1)).rejects.toMatchObject({ code: "http_502" })
  })
})

describe("secrets", () => {
  it("requests never put partner key in url", async () => {
    const { calls, fetchImpl } = fakeFetch((call) => {
      if (call.url.pathname.includes("token")) return { access_token: "a", refresh_token: "r", expire_in: 100 }
      if (call.url.pathname.includes("get_order_list")) return { response: { order_list: [], more: false } }
      return { response: { order_list: [] } }
    })
    const client = makeClient(fetchImpl)
    const authUrl = client.buildAuthUrl("https://example.com/cb")
    await client.getTokens("c", 1)
    await client.refreshTokens("r", 1)
    await client.listOrderSns(auth, { from: 0, to: 100 })
    await client.getOrderDetails(auth, ["A"])
    for (const url of [authUrl, ...calls.map((c) => c.url.toString())]) {
      expect(url).not.toContain(PARTNER_KEY)
    }
    for (const c of calls) expect(String(c.init?.body ?? "")).not.toContain(PARTNER_KEY)
  })

  it("error messages never contain the key or tokens", async () => {
    const { fetchImpl } = fakeFetch(() => ({ error: "error_auth", message: "wrong sign" }))
    const err = await makeClient(fetchImpl)
      .listOrderSns(auth, { from: 0, to: 100 })
      .catch((e) => e)
    expect(err.message).not.toContain(PARTNER_KEY)
    expect(err.message).not.toContain(auth.accessToken)
  })
})
