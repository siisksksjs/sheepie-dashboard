import { triggerNotificationSender } from "@/lib/notifications/trigger-sender"
import { buildShopeeOrderPayload, type ListingMap } from "./build-order"
import {
  ShopeeApiError,
  type ShopeeAuth,
  type ShopeeOrderDetail,
  type ShopeeTokens,
  type createShopeeClient,
} from "./client"
import { mapShopeeStatus } from "./status"
import type { ApplyResult, ShopeeConnection, ShopeeStore } from "./store"

/** The cron poll refreshes the access token once less than this is left. */
const TOKEN_REFRESH_THRESHOLD_MS = 60 * 60 * 1000
/** Each poll re-reads this much before the last cursor to catch boundary orders. */
const POLL_OVERLAP_MS = 60 * 60 * 1000
const RETURN_BEFORE_SYNC = "Return requested before the order was synced"
/** Waits before the 2nd and 3rd attempt to save freshly refreshed tokens. */
const SAVE_TOKENS_BACKOFF_MS = [200, 500]

export type SyncDeps = {
  shopee: ReturnType<typeof createShopeeClient>
  store: ShopeeStore
  now: () => Date
  /** Waits between token-save retries (default: a real timer). */
  sleep?: (ms: number) => Promise<void>
}

/** An order whose unmapped_item / error queue row was newly opened (not a retry of an open row). */
export type ShopeeFailedOrder = {
  orderSn: string
  reason: "error" | "unmapped_item"
  message?: string
  items?: { item_name: string; model_name: string }[]
}

export type SyncSummary = {
  created: number
  updated: number
  queued: number
  skipped: number
  ledgerEntries: number
  /** Only orders that newly failed in this run, so each failure is emailed once. */
  failedOrders: ShopeeFailedOrder[]
}

export type PollResult = {
  status: "not_connected" | "not_started" | "needs_reconnect" | "failed" | "ok"
  consecutiveFailures: number
  summary?: SyncSummary
  error?: string
}

type ReadyConnection = ShopeeConnection & { shopId: number; accessToken: string; syncStartAt: Date }

function emptySummary(): SyncSummary {
  return { created: 0, updated: 0, queued: 0, skipped: 0, ledgerEntries: 0, failedOrders: [] }
}

function isConnected(conn: ShopeeConnection | null): conn is ShopeeConnection & { shopId: number; accessToken: string } {
  return Boolean(conn && conn.shopId && conn.accessToken)
}

function isReady(conn: ShopeeConnection | null): conn is ReadyConnection {
  return isConnected(conn) && conn.syncStartAt !== null
}

function authOf(conn: ReadyConnection): ShopeeAuth {
  return { shopId: conn.shopId, accessToken: conn.accessToken }
}

/**
 * True only when Shopee itself rejected the request (an API error code), so the
 * grant is gone. Network and HTTP/gateway failures (`http_*`, which the client
 * also uses for non-JSON bodies) are temporary and retry on the next poll.
 */
function isShopeeRejection(error: unknown): boolean {
  return error instanceof ShopeeApiError && !error.code.startsWith("http_")
}

/** Error text for logs, the queue and last_sync_error. Client errors never carry keys or tokens. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Shopee has already rotated the refresh token by now, so losing the new pair
 * means reconnecting by hand: retry a brief database hiccup before giving up.
 */
async function saveRefreshedTokens(shopId: number, tokens: ShopeeTokens, deps: SyncDeps): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await deps.store.saveTokens(shopId, tokens)
      return
    } catch (error) {
      if (attempt >= SAVE_TOKENS_BACKOFF_MS.length) throw error
      await (deps.sleep ?? wait)(SAVE_TOKENS_BACKOFF_MS[attempt])
    }
  }
}

type OrderOutcome =
  | { kind: "applied"; result: ApplyResult }
  | { kind: "queued"; failed?: ShopeeFailedOrder }
  | { kind: "skipped" }

async function syncOne(
  detail: ShopeeOrderDetail,
  conn: ReadyConnection,
  listingMap: ListingMap,
  via: "push" | "poll",
  deps: SyncDeps
): Promise<OrderOutcome> {
  const { store } = deps
  const sn = detail.order_sn
  if (detail.create_time * 1000 < conn.syncStartAt.getTime()) return { kind: "skipped" }

  const action = mapShopeeStatus(detail.order_status)
  if (action.kind === "not_yet" || action.kind === "hold") return { kind: "skipped" }

  if (action.kind === "return_review") {
    const order = await store.findOrder(sn)
    if (!order) {
      // First sight is already a return (e.g. it failed or was unmapped until now):
      // staff still need to see it, so it takes over any open queue row.
      await store.queue(sn, "return_review", { message: RETURN_BEFORE_SYNC })
      return { kind: "queued" }
    }
    // Staff already recorded the return: nothing to review.
    if (order.status === "returned") return { kind: "skipped" }
    await store.queue(sn, "return_review", {}, order.id)
    return { kind: "queued" }
  }

  const built = buildShopeeOrderPayload(detail, action.status, listingMap)
  if (built.kind === "unmapped") {
    const { opened } = await store.queue(sn, "unmapped_item", { items: built.items })
    if (!opened) return { kind: "queued" }
    const items = built.items.map(({ item_name, model_name }) => ({ item_name, model_name }))
    return { kind: "queued", failed: { orderSn: sn, reason: "unmapped_item", items } }
  }

  return { kind: "applied", result: await store.applyOrder(built.payload, via) }
}

/** Queues the order as `error`, adding it to `summary.failedOrders` when the row newly opened. */
async function queueError(sn: string, message: string, summary: SyncSummary, store: ShopeeStore): Promise<void> {
  const { opened } = await store.queue(sn, "error", { message })
  summary.queued++
  if (opened) summary.failedOrders.push({ orderSn: sn, reason: "error", message })
}

/** Fills `summary` as it goes, so a caller that catches a later throw still sees the orders that failed. */
async function syncWithConnection(
  conn: ReadyConnection,
  sns: string[],
  via: "push" | "poll",
  deps: SyncDeps,
  summary: SyncSummary = emptySummary()
): Promise<SyncSummary> {
  const { shopee, store } = deps
  if (sns.length === 0) return summary

  if (!conn.accessExpiresAt || conn.accessExpiresAt.getTime() <= deps.now().getTime()) {
    // Only the cron poll may refresh; everyone else reports and lets it catch up.
    throw new ShopeeApiError("expired_token", "Shopee access token has expired")
  }

  const details = await shopee.getOrderDetails(authOf(conn), sns)
  const listingMap = await store.loadListingMap()

  // get_order_detail can silently omit orders. Queue those so the next poll
  // retries them instead of losing them once the cursor moves past.
  const returned = new Set(details.map((detail) => detail.order_sn))
  for (const sn of sns) {
    if (returned.has(sn)) continue
    await queueError(sn, "Shopee returned no detail", summary, store)
  }

  for (const detail of details) {
    const sn = detail.order_sn
    try {
      const outcome = await syncOne(detail, conn, listingMap, via, deps)
      if (outcome.kind === "applied") {
        if (outcome.result.action === "created") summary.created++
        else if (outcome.result.action === "updated") summary.updated++
        else summary.skipped++
        summary.ledgerEntries += outcome.result.ledgerEntries
      } else {
        summary[outcome.kind]++
        if (outcome.kind === "queued" && outcome.failed) summary.failedOrders.push(outcome.failed)
      }
      if (outcome.kind !== "queued") {
        // Applied or deliberately skipped: any stale unmapped/error row is done.
        await store.resolveQueue(sn)
      }
    } catch (error) {
      await queueError(sn, errorMessage(error), summary, store)
    }
  }

  if (summary.ledgerEntries > 0) {
    // Stock moved, so restock alerts may be due, same as a manual order.
    await triggerNotificationSender()
  }

  return summary
}

/**
 * Applies the given Shopee orders (push webhook or poll). Never refreshes the
 * access token: an expired one throws `ShopeeApiError('expired_token')`.
 */
export async function syncShopeeOrders(
  sns: string[],
  via: "push" | "poll",
  deps: SyncDeps
): Promise<SyncSummary> {
  const unique = [...new Set(sns)]
  const conn = await deps.store.getConnection()
  if (!isReady(conn)) return { ...emptySummary(), skipped: unique.length }
  return syncWithConnection(conn, unique, via, deps)
}

/**
 * The 15-minute catch-up: re-reads orders updated since one hour before the
 * last cursor, plus open unmapped/error queue items. The cron call
 * (`allowRefresh: true`) is the only place tokens are ever refreshed.
 */
export async function pollShopeeOrders(deps: SyncDeps, opts: { allowRefresh: boolean }): Promise<PollResult> {
  const { shopee, store } = deps
  let conn = await store.getConnection()
  if (!isConnected(conn)) {
    return { status: "not_connected", consecutiveFailures: conn?.consecutiveFailures ?? 0 }
  }

  const now = deps.now()
  const expiresAt = conn.accessExpiresAt?.getTime() ?? 0
  if (opts.allowRefresh && expiresAt - now.getTime() < TOKEN_REFRESH_THRESHOLD_MS) {
    try {
      if (!conn.refreshToken) throw new ShopeeApiError("missing_refresh_token", "Shopee connection has no refresh token")
      const tokens = await shopee.refreshTokens(conn.refreshToken, conn.shopId)
      await saveRefreshedTokens(conn.shopId, tokens, deps)
      conn = { ...conn, ...tokens }
    } catch (error) {
      const message = errorMessage(error)
      const consecutiveFailures = await store.recordFailure(message)
      const status = isShopeeRejection(error) ? "needs_reconnect" : "failed"
      return { status, consecutiveFailures, error: message }
    }
  }

  if (!isReady(conn)) {
    return { status: "not_started", consecutiveFailures: conn.consecutiveFailures }
  }

  const summary = emptySummary()
  try {
    const from = new Date((conn.lastSyncedUntil ?? conn.syncStartAt).getTime() - POLL_OVERLAP_MS)
    const to = now
    const listed = await shopee.listOrderSns(authOf(conn), {
      from: Math.floor(from.getTime() / 1000),
      to: Math.floor(to.getTime() / 1000),
    })
    const retries = await store.openRetryableSns()
    await syncWithConnection(conn, [...new Set([...listed, ...retries])], "poll", deps, summary)

    await store.saveCursor(to)
    await store.resetFailures()
    return { status: "ok", consecutiveFailures: 0, summary }
  } catch (error) {
    const message = errorMessage(error)
    const consecutiveFailures = await store.recordFailure(message)
    // Orders queued before the failure were newly opened in this run and must still be reported.
    return {
      status: "failed",
      consecutiveFailures,
      error: message,
      ...(summary.failedOrders.length > 0 ? { summary } : {}),
    }
  }
}
