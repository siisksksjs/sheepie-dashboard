import { beforeEach, describe, expect, it, vi } from "vitest"

import type { OrderStatus } from "@/lib/types/database.types"
import type { ListingMap, ShopeeOrderPayload } from "./build-order"
import {
  ShopeeApiError,
  type ShopeeAuth,
  type ShopeeOrderDetail,
  type ShopeeTokens,
  type createShopeeClient,
} from "./client"
import type { ApplyResult, ShopeeConnection, ShopeeStore } from "./store"
import { pollShopeeOrders, syncShopeeOrders, type SyncDeps } from "./sync"

const { triggerNotificationSender } = vi.hoisted(() => ({
  triggerNotificationSender: vi.fn(async () => ({ success: true, skipped: false })),
}))
vi.mock("@/lib/notifications/trigger-sender", () => ({ triggerNotificationSender }))

const NOW = new Date("2026-11-04T10:00:00Z")
const HOUR_MS = 3600_000
const SYNC_START = new Date("2026-11-01T00:00:00Z")
const AFTER_START = Math.floor(SYNC_START.getTime() / 1000) + 86400

type QueueRow = { reason: string; detail: unknown; orderId?: string; resolvedAt: Date | null }

function connection(overrides: Partial<ShopeeConnection> = {}): ShopeeConnection {
  return {
    channel: "shopee",
    shopId: 555,
    accessToken: "access_live_secret",
    refreshToken: "refresh_live_secret",
    accessExpiresAt: new Date(NOW.getTime() + 3 * HOUR_MS),
    refreshExpiresAt: new Date(NOW.getTime() + 20 * 24 * HOUR_MS),
    syncStartAt: SYNC_START,
    lastSyncedUntil: new Date(NOW.getTime() - 15 * 60_000),
    consecutiveFailures: 0,
    lastSyncError: null,
    lastAlertAt: null,
    updatedAt: NOW,
    ...overrides,
  }
}

function detail(sn: string, status: string, overrides: Partial<ShopeeOrderDetail> = {}): ShopeeOrderDetail {
  return {
    order_sn: sn,
    order_status: status,
    create_time: AFTER_START,
    update_time: AFTER_START + 600,
    item_list: [
      {
        item_id: 1,
        model_id: 10,
        item_name: "Sleep Mask",
        model_name: "Black",
        model_quantity_purchased: 2,
        model_discounted_price: 99000,
      },
    ],
    ...overrides,
  }
}

function makeStore(conn: ShopeeConnection | null) {
  const state = {
    connection: conn,
    queue: new Map<string, QueueRow>(),
    listing: new Map([["1:10", { sku: "SLP-001", pack_size: "single" }]]) as ListingMap,
    orders: new Map<string, { id: string; status: OrderStatus }>(),
    applyResult: (payload: ShopeeOrderPayload): ApplyResult | Error => {
      void payload
      return { action: "created", orderId: "order-uuid", ledgerEntries: 1 }
    },
  }

  const store = {
    getConnection: vi.fn(async () => state.connection),
    saveTokens: vi.fn(async (shopId: number, tokens: ShopeeTokens) => {
      state.connection = { ...state.connection!, shopId, ...tokens }
    }),
    saveCursor: vi.fn(async (until: Date) => {
      state.connection = { ...state.connection!, lastSyncedUntil: until }
    }),
    recordFailure: vi.fn(async (message: string) => {
      const count = state.connection!.consecutiveFailures + 1
      state.connection = { ...state.connection!, consecutiveFailures: count, lastSyncError: message }
      return count
    }),
    resetFailures: vi.fn(async () => {
      state.connection = { ...state.connection!, consecutiveFailures: 0, lastSyncError: null }
    }),
    loadListingMap: vi.fn(async () => state.listing),
    queue: vi.fn(async (sn: string, reason: string, detail: unknown, orderId?: string) => {
      // Mirrors createShopeeStore: return_review never touches an existing return_review row.
      if (reason === "return_review" && state.queue.get(sn)?.reason === "return_review") return
      state.queue.set(sn, { reason, detail, orderId, resolvedAt: null })
    }),
    resolveQueue: vi.fn(async (sn: string) => {
      const row = state.queue.get(sn)
      if (row && (row.reason === "unmapped_item" || row.reason === "error")) row.resolvedAt = NOW
    }),
    openRetryableSns: vi.fn(async () =>
      [...state.queue.entries()]
        .filter(([, row]) => (row.reason === "unmapped_item" || row.reason === "error") && !row.resolvedAt)
        .map(([sn]) => sn)
    ),
    findOrder: vi.fn(async (sn: string) => state.orders.get(sn) ?? null),
    applyOrder: vi.fn(async (payload: ShopeeOrderPayload, via: "push" | "poll") => {
      void via
      const result = state.applyResult(payload)
      if (result instanceof Error) throw result
      return result
    }),
  } satisfies ShopeeStore

  return { state, store }
}

function makeShopee(details: ShopeeOrderDetail[] = []) {
  const shopee = {
    buildAuthUrl: vi.fn(() => ""),
    getTokens: vi.fn(),
    refreshTokens: vi.fn(
      async (): Promise<ShopeeTokens> => ({
        accessToken: "access_new",
        refreshToken: "refresh_new",
        accessExpiresAt: new Date(NOW.getTime() + 4 * HOUR_MS),
        refreshExpiresAt: new Date(NOW.getTime() + 30 * 24 * HOUR_MS),
      })
    ),
    listOrderSns: vi.fn<(auth: ShopeeAuth, range: { from: number; to: number }) => Promise<string[]>>(
      async () => []
    ),
    getOrderDetails: vi.fn(async (_auth: unknown, sns: string[]) =>
      details.filter((d) => sns.includes(d.order_sn))
    ),
  }
  return shopee
}

function deps(store: ShopeeStore, shopee: ReturnType<typeof makeShopee>): SyncDeps {
  return {
    store,
    shopee: shopee as unknown as ReturnType<typeof createShopeeClient>,
    now: () => NOW,
  }
}

beforeEach(() => {
  triggerNotificationSender.mockClear()
})

describe("syncShopeeOrders", () => {
  it("skips everything before go-live", async () => {
    for (const conn of [null, connection({ syncStartAt: null })]) {
      const { store } = makeStore(conn)
      const shopee = makeShopee([detail("A", "PROCESSED")])

      const summary = await syncShopeeOrders(["A", "B"], "push", deps(store, shopee))

      expect(summary).toEqual({ created: 0, updated: 0, queued: 0, skipped: 2, ledgerEntries: 0 })
      expect(shopee.getOrderDetails).not.toHaveBeenCalled()
      expect(store.applyOrder).not.toHaveBeenCalled()
    }
  })

  it("skips orders created before sync_start_at", async () => {
    const { store } = makeStore(connection())
    const created = Math.floor(SYNC_START.getTime() / 1000) - 1
    const shopee = makeShopee([detail("A", "PROCESSED", { create_time: created })])

    const summary = await syncShopeeOrders(["A"], "push", deps(store, shopee))

    expect(summary.skipped).toBe(1)
    expect(store.applyOrder).not.toHaveBeenCalled()
    expect(store.queue).not.toHaveBeenCalled()
  })

  it("ready_to_ship is not created", async () => {
    const { store } = makeStore(connection())
    const shopee = makeShopee([detail("A", "READY_TO_SHIP"), detail("B", "IN_CANCEL")])

    const summary = await syncShopeeOrders(["A", "B"], "push", deps(store, shopee))

    expect(summary.skipped).toBe(2)
    expect(store.applyOrder).not.toHaveBeenCalled()
    expect(store.queue).not.toHaveBeenCalled()
  })

  it("unmapped order is queued and not applied", async () => {
    const { store } = makeStore(connection())
    const unmappedItem = {
      item_id: 2,
      model_id: 20,
      item_name: "Pillow",
      model_name: "Grey",
      model_quantity_purchased: 1,
      model_discounted_price: 150000,
    }
    const shopee = makeShopee([
      detail("A", "PROCESSED", { item_list: [...detail("A", "PROCESSED").item_list, unmappedItem] }),
    ])

    const summary = await syncShopeeOrders(["A"], "push", deps(store, shopee))

    expect(summary.queued).toBe(1)
    expect(store.queue).toHaveBeenCalledWith("A", "unmapped_item", {
      items: [{ item_id: 2, model_id: 20, item_name: "Pillow", model_name: "Grey" }],
    })
    expect(store.applyOrder).not.toHaveBeenCalled()
  })

  it("mapped order applies and resolves queue", async () => {
    const { state, store } = makeStore(connection())
    state.queue.set("A", { reason: "unmapped_item", detail: {}, resolvedAt: null })
    state.applyResult = () => ({ action: "created", orderId: "order-uuid", ledgerEntries: 2 })
    const shopee = makeShopee([detail("A", "SHIPPED")])

    const summary = await syncShopeeOrders(["A"], "push", deps(store, shopee))

    expect(summary).toEqual({ created: 1, updated: 0, queued: 0, skipped: 0, ledgerEntries: 2 })
    expect(store.applyOrder).toHaveBeenCalledTimes(1)
    const [payload, via] = store.applyOrder.mock.calls[0]
    expect(via).toBe("push")
    expect(payload).toMatchObject({
      order_sn: "A",
      status: "shipped",
      lines: [{ sku: "SLP-001", pack_size: "single", quantity: 2, selling_price: 99000 }],
    })
    expect(store.resolveQueue).toHaveBeenCalledWith("A")
    expect(state.queue.get("A")?.resolvedAt).toEqual(NOW)
    expect(triggerNotificationSender).toHaveBeenCalledTimes(1)
  })

  it("does not trigger notifications when no stock moved", async () => {
    const { state, store } = makeStore(connection())
    state.applyResult = () => ({ action: "unchanged", orderId: "order-uuid", ledgerEntries: 0 })
    const shopee = makeShopee([detail("A", "SHIPPED")])

    const summary = await syncShopeeOrders(["A"], "poll", deps(store, shopee))

    expect(summary).toEqual({ created: 0, updated: 0, queued: 0, skipped: 1, ledgerEntries: 0 })
    expect(triggerNotificationSender).not.toHaveBeenCalled()
  })

  it("queues returns for existing orders only", async () => {
    const { state, store } = makeStore(connection())
    state.orders.set("A", { id: "order-a", status: "shipped" })
    const shopee = makeShopee([detail("A", "TO_RETURN"), detail("B", "TO_RETURN")])

    const summary = await syncShopeeOrders(["A", "B"], "poll", deps(store, shopee))

    expect(summary).toMatchObject({ queued: 1, skipped: 1 })
    expect(store.queue).toHaveBeenCalledTimes(1)
    expect(store.queue).toHaveBeenCalledWith("A", "return_review", {}, "order-a")
    expect(store.applyOrder).not.toHaveBeenCalled()
  })

  it("returned order is not queued for return review", async () => {
    const { state, store } = makeStore(connection())
    state.orders.set("A", { id: "order-a", status: "returned" })
    const shopee = makeShopee([detail("A", "TO_RETURN")])

    const summary = await syncShopeeOrders(["A"], "poll", deps(store, shopee))

    expect(summary).toMatchObject({ queued: 0, skipped: 1 })
    expect(store.queue).not.toHaveBeenCalled()
  })

  it("skipping an order resolves its stale error row", async () => {
    const { state, store } = makeStore(connection())
    const beforeStart = Math.floor(SYNC_START.getTime() / 1000) - 1
    for (const sn of ["OLD", "RTS", "HOLD", "GONE", "RET"]) {
      state.queue.set(sn, { reason: sn === "HOLD" ? "unmapped_item" : "error", detail: {}, resolvedAt: null })
    }
    state.applyResult = () => ({ action: "skipped", orderId: null, ledgerEntries: 0 })
    const shopee = makeShopee([
      detail("OLD", "PROCESSED", { create_time: beforeStart }),
      detail("RTS", "READY_TO_SHIP"),
      detail("HOLD", "IN_CANCEL"),
      detail("GONE", "CANCELLED"),
      detail("RET", "TO_RETURN"),
    ])

    const summary = await syncShopeeOrders(["OLD", "RTS", "HOLD", "GONE", "RET"], "poll", deps(store, shopee))

    expect(summary).toEqual({ created: 0, updated: 0, queued: 0, skipped: 5, ledgerEntries: 0 })
    for (const sn of ["OLD", "RTS", "HOLD", "GONE", "RET"]) {
      expect(store.resolveQueue).toHaveBeenCalledWith(sn)
      expect(state.queue.get(sn)?.resolvedAt).toEqual(NOW)
    }
  })

  it("expired access token throws without refreshing", async () => {
    const { store } = makeStore(connection({ accessExpiresAt: new Date(NOW.getTime() - 60_000) }))
    const shopee = makeShopee([detail("A", "PROCESSED")])

    const error = await syncShopeeOrders(["A"], "push", deps(store, shopee)).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ShopeeApiError)
    expect((error as ShopeeApiError).code).toBe("expired_token")
    expect(shopee.refreshTokens).not.toHaveBeenCalled()
    expect(store.saveTokens).not.toHaveBeenCalled()
    expect(shopee.getOrderDetails).not.toHaveBeenCalled()
  })

  it("one bad order does not stop the batch", async () => {
    const { state, store } = makeStore(connection())
    state.applyResult = (payload) =>
      payload.order_sn === "A"
        ? new Error("Bundle SLP-001 has no component composition.")
        : { action: "created", orderId: "order-b", ledgerEntries: 1 }
    const shopee = makeShopee([detail("A", "PROCESSED"), detail("B", "PROCESSED")])

    const summary = await syncShopeeOrders(["A", "B"], "push", deps(store, shopee))

    expect(summary).toEqual({ created: 1, updated: 0, queued: 1, skipped: 0, ledgerEntries: 1 })
    expect(store.queue).toHaveBeenCalledWith("A", "error", {
      message: "Bundle SLP-001 has no component composition.",
    })
    expect(store.applyOrder).toHaveBeenCalledTimes(2)
    expect(store.resolveQueue).toHaveBeenCalledWith("B")
    expect(store.resolveQueue).not.toHaveBeenCalledWith("A")
  })
})

describe("pollShopeeOrders", () => {
  it("reports not_connected and not_started without calling Shopee", async () => {
    const missing = makeStore(null)
    const shopee = makeShopee()
    expect(await pollShopeeOrders(deps(missing.store, shopee), { allowRefresh: true })).toEqual({
      status: "not_connected",
      consecutiveFailures: 0,
    })

    const notStarted = makeStore(connection({ syncStartAt: null }))
    expect(await pollShopeeOrders(deps(notStarted.store, shopee), { allowRefresh: true })).toEqual({
      status: "not_started",
      consecutiveFailures: 0,
    })
    expect(shopee.listOrderSns).not.toHaveBeenCalled()
  })

  it("poll retries open unmapped and error queue items", async () => {
    const { state, store } = makeStore(connection())
    state.listing = new Map() as ListingMap
    const shopee = makeShopee([detail("A", "PROCESSED"), detail("B", "SHIPPED"), detail("C", "TO_RETURN")])

    // First sight: A has no listing mapping yet, so it is queued.
    await syncShopeeOrders(["A"], "push", deps(store, shopee))
    expect(state.queue.get("A")?.reason).toBe("unmapped_item")
    state.queue.set("B", { reason: "error", detail: { message: "timeout" }, resolvedAt: null })
    state.queue.set("C", { reason: "return_review", detail: {}, orderId: "order-c", resolvedAt: null })

    // Staff maps the listing; A's update_time is now outside the poll window.
    state.listing = new Map([["1:10", { sku: "SLP-001", pack_size: "single" }]]) as ListingMap
    shopee.listOrderSns.mockResolvedValue([])
    shopee.getOrderDetails.mockClear()

    const result = await pollShopeeOrders(deps(store, shopee), { allowRefresh: true })

    expect(result.status).toBe("ok")
    expect(shopee.getOrderDetails.mock.calls[0][1]).toEqual(["A", "B"])
    expect(store.applyOrder.mock.calls.map(([payload]) => payload.order_sn)).toEqual(["A", "B"])
    expect(store.applyOrder.mock.calls.every(([, via]) => via === "poll")).toBe(true)
    expect(state.queue.get("A")?.resolvedAt).toEqual(NOW)
    expect(state.queue.get("B")?.resolvedAt).toEqual(NOW)
    expect(state.queue.get("C")?.resolvedAt).toBeNull()
  })

  it("poll window starts one hour before last cursor", async () => {
    const lastSyncedUntil = new Date(NOW.getTime() - 15 * 60_000)
    const { state, store } = makeStore(connection({ lastSyncedUntil, consecutiveFailures: 2 }))
    const shopee = makeShopee([detail("A", "PROCESSED"), detail("B", "PROCESSED")])
    shopee.listOrderSns.mockResolvedValue(["A", "B", "A"])
    state.queue.set("B", { reason: "error", detail: {}, resolvedAt: null })

    const result = await pollShopeeOrders(deps(store, shopee), { allowRefresh: true })

    expect(shopee.listOrderSns).toHaveBeenCalledWith(
      { shopId: 555, accessToken: "access_live_secret" },
      { from: (lastSyncedUntil.getTime() - HOUR_MS) / 1000, to: NOW.getTime() / 1000 }
    )
    expect(shopee.getOrderDetails.mock.calls[0][1]).toEqual(["A", "B"])
    expect(result).toEqual({
      status: "ok",
      consecutiveFailures: 0,
      summary: { created: 2, updated: 0, queued: 0, skipped: 0, ledgerEntries: 2 },
    })
    expect(store.saveCursor).toHaveBeenCalledWith(NOW)
    expect(state.connection?.lastSyncedUntil).toEqual(NOW)
    expect(store.resetFailures).toHaveBeenCalled()
    expect(state.connection?.consecutiveFailures).toBe(0)
  })

  it("sn missing from order detail is queued as error", async () => {
    const { state, store } = makeStore(connection())
    // Shopee lists A and B, but get_order_detail only returns A.
    const shopee = makeShopee([detail("A", "PROCESSED")])
    shopee.listOrderSns.mockResolvedValue(["A", "B"])

    const result = await pollShopeeOrders(deps(store, shopee), { allowRefresh: true })

    expect(result).toEqual({
      status: "ok",
      consecutiveFailures: 0,
      summary: { created: 1, updated: 0, queued: 1, skipped: 0, ledgerEntries: 1 },
    })
    expect(store.queue).toHaveBeenCalledWith("B", "error", { message: "Shopee returned no detail" })
    expect(store.applyOrder.mock.calls.map(([payload]) => payload.order_sn)).toEqual(["A"])
    expect(store.saveCursor).toHaveBeenCalledWith(NOW)
    expect(await store.openRetryableSns()).toEqual(["B"])
    expect(state.queue.get("B")?.resolvedAt).toBeNull()
  })

  it("first poll window starts one hour before sync_start_at", async () => {
    const { store } = makeStore(connection({ lastSyncedUntil: null }))
    const shopee = makeShopee()

    await pollShopeeOrders(deps(store, shopee), { allowRefresh: false })

    expect(shopee.listOrderSns.mock.calls[0][1]).toEqual({
      from: (SYNC_START.getTime() - HOUR_MS) / 1000,
      to: NOW.getTime() / 1000,
    })
  })

  it("failed poll keeps cursor and counts failure", async () => {
    const lastSyncedUntil = new Date(NOW.getTime() - 15 * 60_000)
    const { state, store } = makeStore(connection({ lastSyncedUntil, consecutiveFailures: 1 }))
    const shopee = makeShopee()
    shopee.listOrderSns.mockRejectedValue(
      new ShopeeApiError("error_server", "Shopee API /api/v2/order/get_order_list: error_server - busy")
    )

    const result = await pollShopeeOrders(deps(store, shopee), { allowRefresh: true })

    expect(result).toEqual({
      status: "failed",
      consecutiveFailures: 2,
      error: "Shopee API /api/v2/order/get_order_list: error_server - busy",
    })
    expect(store.saveCursor).not.toHaveBeenCalled()
    expect(store.resetFailures).not.toHaveBeenCalled()
    expect(state.connection?.lastSyncedUntil).toEqual(lastSyncedUntil)
    expect(store.recordFailure).toHaveBeenCalledTimes(1)
    const [message] = store.recordFailure.mock.calls[0]
    expect(message).not.toContain("access_live_secret")
    expect(message).not.toContain("refresh_live_secret")
  })

  it("refreshes only when allowRefresh and under one hour left", async () => {
    const soon = new Date(NOW.getTime() + 30 * 60_000)
    const later = new Date(NOW.getTime() + 2 * HOUR_MS)

    for (const [accessExpiresAt, allowRefresh] of [
      [soon, false],
      [later, true],
    ] as const) {
      const { store } = makeStore(connection({ accessExpiresAt }))
      const shopee = makeShopee()
      await pollShopeeOrders(deps(store, shopee), { allowRefresh })
      expect(shopee.refreshTokens).not.toHaveBeenCalled()
      expect(store.saveTokens).not.toHaveBeenCalled()
    }

    const { state, store } = makeStore(connection({ accessExpiresAt: soon }))
    const shopee = makeShopee()
    const result = await pollShopeeOrders(deps(store, shopee), { allowRefresh: true })

    expect(result.status).toBe("ok")
    expect(shopee.refreshTokens).toHaveBeenCalledWith("refresh_live_secret", 555)
    expect(store.saveTokens).toHaveBeenCalledWith(555, {
      accessToken: "access_new",
      refreshToken: "refresh_new",
      accessExpiresAt: new Date(NOW.getTime() + 4 * HOUR_MS),
      refreshExpiresAt: new Date(NOW.getTime() + 30 * 24 * HOUR_MS),
    })
    expect(state.connection?.refreshToken).toBe("refresh_new")
    expect(shopee.listOrderSns.mock.calls[0][0]).toEqual({ shopId: 555, accessToken: "access_new" })
  })

  it("refresh failure reports needsReconnect", async () => {
    const { state, store } = makeStore(
      connection({ accessExpiresAt: new Date(NOW.getTime() + 10 * 60_000), consecutiveFailures: 0 })
    )
    const shopee = makeShopee()
    shopee.refreshTokens.mockRejectedValue(
      new ShopeeApiError("error_auth", "Shopee API /api/v2/auth/access_token/get: error_auth - Invalid refresh_token")
    )

    const result = await pollShopeeOrders(deps(store, shopee), { allowRefresh: true })

    expect(result).toEqual({
      status: "needs_reconnect",
      consecutiveFailures: 1,
      error: "Shopee API /api/v2/auth/access_token/get: error_auth - Invalid refresh_token",
    })
    expect(store.recordFailure).toHaveBeenCalledTimes(1)
    expect(store.saveTokens).not.toHaveBeenCalled()
    expect(shopee.listOrderSns).not.toHaveBeenCalled()
    expect(store.saveCursor).not.toHaveBeenCalled()
    expect(state.connection?.refreshToken).toBe("refresh_live_secret")
  })

  it("shopee 5xx during refresh is failed not needs_reconnect", async () => {
    for (const code of ["http_502", "http_503"]) {
      const { state, store } = makeStore(
        connection({ accessExpiresAt: new Date(NOW.getTime() + 10 * 60_000), consecutiveFailures: 0 })
      )
      const shopee = makeShopee()
      const message = `Shopee API /api/v2/auth/access_token/get: HTTP ${code.slice(5)} with a non-JSON body`
      shopee.refreshTokens.mockRejectedValue(new ShopeeApiError(code, message))

      const result = await pollShopeeOrders(deps(store, shopee), { allowRefresh: true })

      expect(result).toEqual({ status: "failed", consecutiveFailures: 1, error: message })
      expect(store.recordFailure).toHaveBeenCalledWith(message)
      expect(shopee.listOrderSns).not.toHaveBeenCalled()
      expect(state.connection?.refreshToken).toBe("refresh_live_secret")
    }
  })

  it("network error during refresh is failed not needs_reconnect", async () => {
    const { state, store } = makeStore(
      connection({ accessExpiresAt: new Date(NOW.getTime() + 10 * 60_000), consecutiveFailures: 2 })
    )
    const shopee = makeShopee()
    shopee.refreshTokens.mockRejectedValue(new TypeError("fetch failed"))

    const result = await pollShopeeOrders(deps(store, shopee), { allowRefresh: true })

    expect(result).toEqual({ status: "failed", consecutiveFailures: 3, error: "fetch failed" })
    expect(store.recordFailure).toHaveBeenCalledWith("fetch failed")
    expect(store.saveTokens).not.toHaveBeenCalled()
    expect(shopee.listOrderSns).not.toHaveBeenCalled()
    expect(store.saveCursor).not.toHaveBeenCalled()
    expect(state.connection?.refreshToken).toBe("refresh_live_secret")
  })
})
