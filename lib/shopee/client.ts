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

/** `order_selling_price` and `escrow_amount` from get_escrow_detail's `order_income`. */
export type ShopeeEscrow = { sellingPrice: number; escrowAmount: number }

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

  /**
   * Shopee can answer 200 without an error but also without usable tokens.
   * Saving those would silently break the connection, so they count as a
   * temporary (`http_*`) failure and the stored tokens stay.
   */
  function toTokens(path: string, json: ShopeeResponse): ShopeeTokens {
    const { access_token: accessToken, refresh_token: refreshToken, expire_in: rawExpireIn } = json
    const expireIn = rawExpireIn === undefined ? 14400 : rawExpireIn
    if (
      typeof accessToken !== "string" ||
      accessToken === "" ||
      typeof refreshToken !== "string" ||
      refreshToken === "" ||
      typeof expireIn !== "number" ||
      !Number.isFinite(expireIn)
    ) {
      // Never echo the body: it may hold a token.
      throw new ShopeeApiError("http_malformed", `Shopee API ${path}: malformed token response`)
    }
    const nowMs = now()
    return {
      accessToken,
      refreshToken,
      accessExpiresAt: new Date(nowMs + (expireIn - ACCESS_EXPIRY_MARGIN_SECONDS) * 1000),
      refreshExpiresAt: new Date(nowMs + REFRESH_TOKEN_LIFETIME_MS),
    }
  }

  return {
    buildAuthUrl(redirect: string): string {
      return buildUrl("/api/v2/shop/auth_partner", null, { redirect })
    },

    async getTokens(code: string, shopId: number): Promise<ShopeeTokens> {
      const path = "/api/v2/auth/token/get"
      const json = await call("POST", path, null, {
        body: { code, shop_id: shopId, partner_id: partnerId },
      })
      return toTokens(path, json)
    },

    async refreshTokens(refreshToken: string, shopId: number): Promise<ShopeeTokens> {
      const path = "/api/v2/auth/access_token/get"
      const json = await call("POST", path, null, {
        body: { refresh_token: refreshToken, shop_id: shopId, partner_id: partnerId },
      })
      return toTokens(path, json)
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
          if (!page.more) break
          if (!page.next_cursor) {
            // Stopping here would silently drop the rest of the window.
            throw new ShopeeApiError(
              "http_malformed_cursor",
              "Shopee API /api/v2/order/get_order_list: more pages but no next_cursor"
            )
          }
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

    /**
     * Shopee's income figures for one order, in IDR. An estimate until the
     * order is COMPLETED, final after. A response without both numbers is a
     * temporary (`http_malformed`) failure.
     */
    async getEscrowDetail(tok: ShopeeAuth, orderSn: string): Promise<ShopeeEscrow> {
      const path = "/api/v2/payment/get_escrow_detail"
      const json = await call("GET", path, tok, { params: { order_sn: orderSn } })
      const income = (json.response as { order_income?: Record<string, unknown> | null } | undefined)?.order_income
      const sellingPrice = income?.order_selling_price
      const escrowAmount = income?.escrow_amount
      if (
        typeof sellingPrice !== "number" ||
        !Number.isFinite(sellingPrice) ||
        typeof escrowAmount !== "number" ||
        !Number.isFinite(escrowAmount)
      ) {
        throw new ShopeeApiError("http_malformed", `Shopee API ${path}: malformed escrow response`)
      }
      return { sellingPrice, escrowAmount }
    },
  }
}
