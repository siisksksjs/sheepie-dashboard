import { verifyPushSignature } from "./signing"
import { syncShopeeOrders, type SyncDeps } from "./sync"

/** Shopee `order_status_push`. */
const ORDER_STATUS_PUSH_CODE = 3

export type ShopeePushDeps = SyncDeps & { pushKey: string; callbackUrl: string }

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
  if (!signed) return { status: 401, body: { ok: false, reason: "invalid_signature" } }

  const push = parseOrderStatusPush(input.rawBody)
  if (!push) return IGNORED

  try {
    const conn = await deps.store.getConnection()
    // Not connected, not live yet, or another shop (e.g. Shopee's test push data).
    if (!conn || conn.shopId !== push.shopId || conn.syncStartAt === null) return IGNORED

    await syncShopeeOrders([push.ordersn], "push", deps)
    return { status: 200, body: { ok: true } }
  } catch (error) {
    const message = errorMessage(error)
    try {
      await deps.store.queue(push.ordersn, "error", { message })
    } catch {
      // The 15-minute poll re-reads recent orders, so this one is not lost.
      console.error(`Shopee push: could not queue order ${push.ordersn} after a sync failure`)
    }
    return { status: 200, body: { ok: false, reason: "queued_for_retry" } }
  }
}
