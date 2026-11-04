import { triggerNotificationSender } from "@/lib/notifications/trigger-sender"
import { buildShopeeOrderPayload, type ListingMap } from "./build-order"
import { ShopeeApiError, type ShopeeAuth, type ShopeeOrderDetail, type createShopeeClient } from "./client"
import { mapShopeeStatus } from "./status"
import type { ApplyResult, ShopeeConnection, ShopeeStore } from "./store"

/** The cron poll refreshes the access token once less than this is left. */
const TOKEN_REFRESH_THRESHOLD_MS = 60 * 60 * 1000
/** Each poll re-reads this much before the last cursor to catch boundary orders. */
const POLL_OVERLAP_MS = 60 * 60 * 1000

export type SyncDeps = {
  shopee: ReturnType<typeof createShopeeClient>
  store: ShopeeStore
  now: () => Date
}

export type SyncSummary = {
  created: number
  updated: number
  queued: number
  skipped: number
  ledgerEntries: number
}

export type PollResult = {
  status: "not_connected" | "not_started" | "needs_reconnect" | "failed" | "ok"
  consecutiveFailures: number
  summary?: SyncSummary
  error?: string
}

type ReadyConnection = ShopeeConnection & { shopId: number; accessToken: string; syncStartAt: Date }

function emptySummary(): SyncSummary {
  return { created: 0, updated: 0, queued: 0, skipped: 0, ledgerEntries: 0 }
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

/** Error text for logs, the queue and last_sync_error. Client errors never carry keys or tokens. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

type OrderOutcome = { kind: "applied"; result: ApplyResult } | { kind: "queued" } | { kind: "skipped" }

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
    // Not in the dashboard, or staff already recorded the return: nothing to review.
    if (!order || order.status === "returned") return { kind: "skipped" }
    await store.queue(sn, "return_review", {}, order.id)
    return { kind: "queued" }
  }

  const built = buildShopeeOrderPayload(detail, action.status, listingMap)
  if (built.kind === "unmapped") {
    await store.queue(sn, "unmapped_item", { items: built.items })
    return { kind: "queued" }
  }

  return { kind: "applied", result: await store.applyOrder(built.payload, via) }
}

async function syncWithConnection(
  conn: ReadyConnection,
  sns: string[],
  via: "push" | "poll",
  deps: SyncDeps
): Promise<SyncSummary> {
  const { shopee, store } = deps
  const summary = emptySummary()
  if (sns.length === 0) return summary

  if (!conn.accessExpiresAt || conn.accessExpiresAt.getTime() <= deps.now().getTime()) {
    // Only the cron poll may refresh; everyone else reports and lets it catch up.
    throw new ShopeeApiError("expired_token", "Shopee access token has expired")
  }

  const details = await shopee.getOrderDetails(authOf(conn), sns)
  const listingMap = await store.loadListingMap()

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
      }
      if (outcome.kind !== "queued") {
        // Applied or deliberately skipped: any stale unmapped/error row is done.
        await store.resolveQueue(sn)
      }
    } catch (error) {
      await store.queue(sn, "error", { message: errorMessage(error) })
      summary.queued++
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
      await store.saveTokens(conn.shopId, tokens)
      conn = { ...conn, ...tokens }
    } catch (error) {
      const message = errorMessage(error)
      const consecutiveFailures = await store.recordFailure(message)
      // Only a Shopee rejection means the grant is gone; network errors retry next poll.
      const status = error instanceof ShopeeApiError ? "needs_reconnect" : "failed"
      return { status, consecutiveFailures, error: message }
    }
  }

  if (!isReady(conn)) {
    return { status: "not_started", consecutiveFailures: conn.consecutiveFailures }
  }

  try {
    const from = new Date((conn.lastSyncedUntil ?? conn.syncStartAt).getTime() - POLL_OVERLAP_MS)
    const to = now
    const listed = await shopee.listOrderSns(authOf(conn), {
      from: Math.floor(from.getTime() / 1000),
      to: Math.floor(to.getTime() / 1000),
    })
    const retries = await store.openRetryableSns()
    const summary = await syncWithConnection(conn, [...new Set([...listed, ...retries])], "poll", deps)

    await store.saveCursor(to)
    await store.resetFailures()
    return { status: "ok", consecutiveFailures: 0, summary }
  } catch (error) {
    const message = errorMessage(error)
    const consecutiveFailures = await store.recordFailure(message)
    return { status: "failed", consecutiveFailures, error: message }
  }
}
