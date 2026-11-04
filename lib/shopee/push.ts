import { verifyPushSignature } from "./signing"
import { syncShopeeOrders, type ShopeeFailedOrder, type SyncDeps } from "./sync"

/** Shopee `order_status_push`. */
const ORDER_STATUS_PUSH_CODE = 3

export type ShopeePushDeps = SyncDeps & {
  pushKey: string
  callbackUrl: string
  /**
   * Orders whose unmapped/error queue row this push newly opened. Called at most
   * once, before the response; it should only schedule the email (the route
   * uses `after()`), and a throw from it never changes the response.
   */
  onFailedOrders?: (failed: ShopeeFailedOrder[]) => void
}

export type ShopeePushResult = {
  status: 200 | 401
  body: { ok: boolean; reason?: string }
}

type OrderStatusPush = { shopId: number; ordersn: string }

const IGNORED: ShopeePushResult = { status: 200, body: { ok: true, reason: "ignored" } }

/** The order push fields we use, or null for anything else (other push codes, malformed bodies). */
function parseOrderStatusPush(rawBody: string): OrderStatusPush | null {
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return null
  }
  if (!body || typeof body !== "object") return null

  const { code, shop_id: shopId, data } = body as { code?: unknown; shop_id?: unknown; data?: unknown }
  if (code !== ORDER_STATUS_PUSH_CODE || typeof shopId !== "number") return null
  const ordersn = (data as { ordersn?: unknown } | null | undefined)?.ordersn
  if (typeof ordersn !== "string" || ordersn === "") return null
  return { shopId, ordersn }
}

/** Error text for the queue and logs. Client and store errors never carry keys or tokens. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error"
}

function reportFailedOrders(failed: ShopeeFailedOrder[], deps: ShopeePushDeps): void {
  if (failed.length === 0 || !deps.onFailedOrders) return
  try {
    deps.onFailedOrders(failed)
  } catch (error) {
    console.error(`Shopee push: failure email could not be scheduled: ${errorMessage(error)}`)
  }
}

/**
 * Handles one Shopee push. Bad signature → 401. Anything that is not an
 * order status push for our shop → 200 ignored. Otherwise syncs the order
 * (never refreshing tokens); on any failure the order is queued as `error`
 * for the next poll and Shopee still gets 200 so it does not retry.
 */
export async function handleShopeePush(
  input: { rawBody: string; authorization: string | null },
  deps: ShopeePushDeps
): Promise<ShopeePushResult> {
  const signed =
    deps.pushKey !== "" &&
    verifyPushSignature({
      callbackUrl: deps.callbackUrl,
      rawBody: input.rawBody,
      authorization: input.authorization,
      pushKey: deps.pushKey,
    })
  if (!signed) {
    // Never log the body or the header value.
    console.warn("Shopee push rejected: invalid signature")
    return { status: 401, body: { ok: false, reason: "invalid_signature" } }
  }

  const push = parseOrderStatusPush(input.rawBody)
  if (!push) return IGNORED

  try {
    const conn = await deps.store.getConnection()
    // Not connected, not live yet, or another shop (e.g. Shopee's test push data).
    if (!conn || conn.shopId !== push.shopId || conn.syncStartAt === null) return IGNORED

    try {
      // Push is alive (the push_silent alert watches this), whatever the sync below does.
      await deps.store.markPushReceived(deps.now())
    } catch (error) {
      console.error(`Shopee push: could not record the push time: ${errorMessage(error)}`)
    }

    const summary = await syncShopeeOrders([push.ordersn], "push", deps)
    reportFailedOrders(summary.failedOrders, deps)
    return { status: 200, body: { ok: true } }
  } catch (error) {
    const message = errorMessage(error)
    try {
      const { opened } = await deps.store.queue(push.ordersn, "error", { message })
      if (opened) reportFailedOrders([{ orderSn: push.ordersn, reason: "error", message }], deps)
    } catch {
      // The 15-minute poll re-reads recent orders, so this one is not lost.
      console.error(`Shopee push: could not queue order ${push.ordersn} after a sync failure`)
    }
    return { status: 200, body: { ok: false, reason: "queued_for_retry" } }
  }
}
