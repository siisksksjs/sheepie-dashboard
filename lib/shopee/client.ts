import { signApiRequest } from "./signing"

const HOST = "https://partner.shopeemobile.com"
const ORDER_LIST_WINDOW_SECONDS = 15 * 86400
const ORDER_LIST_PAGE_SIZE = 100
const ORDER_DETAIL_BATCH_SIZE = 50
const ACCESS_EXPIRY_MARGIN_SECONDS = 300
const REFRESH_TOKEN_LIFETIME_MS = 30 * 86400 * 1000

export type ShopeeAuth = { shopId: number; accessToken: string }

export type ShopeeTokens = {
  accessToken: string
  refreshToken: string
  accessExpiresAt: Date
  refreshExpiresAt: Date
}

export type ShopeeOrderDetail = {
  order_sn: string
  order_status: string
  create_time: number
  update_time: number
  item_list: {
    item_id: number
    model_id: number
    item_name: string
    model_name: string
    model_quantity_purchased: number
    model_discounted_price: number
  }[]
}

export class ShopeeApiError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "ShopeeApiError"
    this.code = code
  }
}

type ShopeeResponse = {
  error?: string
  message?: string
  response?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * `now` returns epoch milliseconds (like `Date.now`).
 * Signing and token expiry both derive from it.
 */
export function createShopeeClient(opts: {
  partnerId: number
  partnerKey: string
  fetchImpl?: typeof fetch
  now?: () => number
}) {
  const { partnerId, partnerKey } = opts
  const fetchImpl = opts.fetchImpl ?? fetch
  const now = opts.now ?? Date.now

  function buildUrl(path: string, auth: ShopeeAuth | null, params: Record<string, string | number> = {}) {
    const timestamp = Math.floor(now() / 1000)
    const query = new URLSearchParams({
      partner_id: String(partnerId),
      timestamp: String(timestamp),
      sign: signApiRequest({
        partnerId,
        partnerKey,
        path,
        timestamp,
        accessToken: auth?.accessToken,
        shopId: auth?.shopId,
      }),
    })
    if (auth) {
      query.set("access_token", auth.accessToken)
      query.set("shop_id", String(auth.shopId))
    }
    for (const [key, value] of Object.entries(params)) query.set(key, String(value))
    return `${HOST}${path}?${query.toString()}`
  }

  async function call(
    method: "GET" | "POST",
    path: string,
    auth: ShopeeAuth | null,
    options: { params?: Record<string, string | number>; body?: unknown } = {}
  ): Promise<ShopeeResponse> {
    const res = await fetchImpl(buildUrl(path, auth, options.params), {
      method,
      headers: { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })

    let json: ShopeeResponse
    try {
      json = (await res.json()) as ShopeeResponse
    } catch {
      throw new ShopeeApiError(`http_${res.status}`, `Shopee API ${path}: HTTP ${res.status} with a non-JSON body`)
    }

    // Shopee reports failures as { error, message }, sometimes with HTTP 200.
    if (json.error) {
      throw new ShopeeApiError(json.error, `Shopee API ${path}: ${json.error} - ${json.message ?? ""}`.trim())
    }
    if (!res.ok) {
      throw new ShopeeApiError(`http_${res.status}`, `Shopee API ${path}: HTTP ${res.status}`)
    }
    return json
  }

  function toTokens(json: ShopeeResponse): ShopeeTokens {
    const nowMs = now()
    const expireIn = Number(json.expire_in ?? 14400)
    return {
      accessToken: String(json.access_token),
      refreshToken: String(json.refresh_token),
      accessExpiresAt: new Date(nowMs + (expireIn - ACCESS_EXPIRY_MARGIN_SECONDS) * 1000),
      refreshExpiresAt: new Date(nowMs + REFRESH_TOKEN_LIFETIME_MS),
    }
  }

  return {
    buildAuthUrl(redirect: string): string {
      return buildUrl("/api/v2/shop/auth_partner", null, { redirect })
    },

    async getTokens(code: string, shopId: number): Promise<ShopeeTokens> {
      const json = await call("POST", "/api/v2/auth/token/get", null, {
        body: { code, shop_id: shopId, partner_id: partnerId },
      })
      return toTokens(json)
    },

    async refreshTokens(refreshToken: string, shopId: number): Promise<ShopeeTokens> {
      const json = await call("POST", "/api/v2/auth/access_token/get", null, {
        body: { refresh_token: refreshToken, shop_id: shopId, partner_id: partnerId },
      })
      return toTokens(json)
    },

    async listOrderSns(tok: ShopeeAuth, range: { from: number; to: number }): Promise<string[]> {
      const seen = new Set<string>()
      for (let from = range.from; from < range.to; from += ORDER_LIST_WINDOW_SECONDS) {
        const to = Math.min(from + ORDER_LIST_WINDOW_SECONDS, range.to)
        let cursor = ""
        for (;;) {
          const json = await call("GET", "/api/v2/order/get_order_list", tok, {
            params: {
              time_range_field: "update_time",
              time_from: from,
              time_to: to,
              page_size: ORDER_LIST_PAGE_SIZE,
              cursor,
            },
          })
          const page = (json.response ?? {}) as {
            order_list?: { order_sn: string }[]
            more?: boolean
            next_cursor?: string
          }
          for (const order of page.order_list ?? []) seen.add(order.order_sn)
          if (!page.more || !page.next_cursor) break
          cursor = page.next_cursor
        }
      }
      return [...seen]
    },

    async getOrderDetails(tok: ShopeeAuth, sns: string[]): Promise<ShopeeOrderDetail[]> {
      const details: ShopeeOrderDetail[] = []
      for (let i = 0; i < sns.length; i += ORDER_DETAIL_BATCH_SIZE) {
        const json = await call("GET", "/api/v2/order/get_order_detail", tok, {
          params: {
            order_sn_list: sns.slice(i, i + ORDER_DETAIL_BATCH_SIZE).join(","),
            response_optional_fields: "item_list,order_status",
          },
        })
        const page = (json.response ?? {}) as { order_list?: ShopeeOrderDetail[] }
        details.push(...(page.order_list ?? []))
      }
      return details
    },
  }
}
