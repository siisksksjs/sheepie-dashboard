import type { SupabaseClient } from "@supabase/supabase-js"

import type { PollResult } from "./sync"
import type { ShopeeStore } from "./store"

export type ShopeeAlert = "needs_reconnect" | "repeated_failures" | "push_silent"

const DAY_MS = 24 * 60 * 60 * 1000
const REPEATED_FAILURE_THRESHOLD = 3
const SETTINGS_URL = "https://dashboard.sheepiesleep.com/more/shopee"

const MESSAGES: Record<ShopeeAlert, { subject: string; sentence: string }> = {
  needs_reconnect: {
    subject: "Sheepie Dashboard：Shopee 需要重新连接",
    sentence: "Shopee 的授权已经失效，订单暂时无法同步，请到设置页重新连接。",
  },
  repeated_failures: {
    subject: "Sheepie Dashboard：Shopee 同步连续失败",
    sentence: "Shopee 订单同步已经连续失败多次，请到设置页查看最近的错误信息。",
  },
  push_silent: {
    subject: "Sheepie Dashboard：Shopee 推送 24 小时没有进来",
    sentence: "过去 24 小时内 Shopee 的订单都是靠定时拉单补进来的，实时推送可能已经中断，请到设置页检查。",
  },
}

/** Which alert (if any) is due. Quiet for 24 hours after the last alert. */
export function pickShopeeAlert(input: {
  needsReconnect: boolean
  consecutiveFailures: number
  pollCreatedLast24h: number
  pushCreatedLast24h: number
  lastAlertAt: Date | null
  now: Date
}): ShopeeAlert | null {
  if (input.lastAlertAt && input.now.getTime() - input.lastAlertAt.getTime() < DAY_MS) return null
  if (input.needsReconnect) return "needs_reconnect"
  if (input.consecutiveFailures >= REPEATED_FAILURE_THRESHOLD) return "repeated_failures"
  if (input.pollCreatedLast24h > 0 && input.pushCreatedLast24h === 0) return "push_silent"
  return null
}

export type AlertDeps = {
  supabase: SupabaseClient
  store: Pick<ShopeeStore, "markAlerted">
  /** The connection's `last_alert_at` before this send; restored if the send fails. */
  previousAlertAt?: Date | null
  fetchImpl?: typeof fetch
  now?: () => Date
}

function uniqueEmails(users: Array<{ email?: string | null }>): string[] {
  return Array.from(new Set(users.map((user) => user.email).filter((email): email is string => Boolean(email))))
}

/**
 * Emails every dashboard user about `alert` through Resend. The 24-hour window is
 * claimed in `last_alert_at` BEFORE sending, so a failed write after an accepted
 * email can never make the same alert repeat every cron run. If the send fails the
 * claim is released (best effort); worst case is one missed alert, never spam.
 */
export async function sendShopeeAlert(alert: ShopeeAlert, deps: AlertDeps): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured")
  if (!from) throw new Error("EMAIL_FROM is not configured")

  const { data, error } = await deps.supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`Listing alert recipients failed: ${error.message}`)
  const recipients = uniqueEmails(data?.users ?? [])
  if (recipients.length === 0) throw new Error("No recipients found")

  const { subject, sentence } = MESSAGES[alert]
  const html = `<p>${sentence}</p><p><a href="${SETTINGS_URL}">${SETTINGS_URL}</a></p>`

  // If the claim fails nothing is sent.
  await deps.store.markAlerted((deps.now ?? (() => new Date()))())
  try {
    const response = await (deps.fetchImpl ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: recipients, subject, html }),
    })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200)
      throw new Error(`Resend failed with ${response.status}${detail ? `: ${detail}` : ""}`)
    }
  } catch (sendError) {
    try {
      await deps.store.markAlerted(deps.previousAlertAt ?? null)
    } catch (releaseError) {
      const message = releaseError instanceof Error ? releaseError.message : "Unknown error"
      console.error(`Shopee alert claim could not be released: ${message}`)
    }
    throw sendError
  }
}

/**
 * Decides and sends the alert for a finished cron poll. Returns the alert sent, or null.
 * Throws on failure; the caller must keep that from failing the sync response.
 */
export async function checkShopeeAlerts(
  result: Pick<PollResult, "status" | "consecutiveFailures">,
  deps: AlertDeps & { store: Pick<ShopeeStore, "markAlerted" | "getConnection" | "countRecentSyncedVia"> }
): Promise<ShopeeAlert | null> {
  if (result.status === "not_connected" || result.status === "not_started") return null

  const conn = await deps.store.getConnection()
  if (!conn) return null

  const now = (deps.now ?? (() => new Date()))()
  const counts = await deps.store.countRecentSyncedVia(new Date(now.getTime() - DAY_MS))
  const alert = pickShopeeAlert({
    needsReconnect: result.status === "needs_reconnect",
    consecutiveFailures: result.consecutiveFailures,
    pollCreatedLast24h: counts.poll,
    pushCreatedLast24h: counts.push,
    lastAlertAt: conn.lastAlertAt,
    now,
  })
  if (!alert) return null

  await sendShopeeAlert(alert, { ...deps, previousAlertAt: conn.lastAlertAt })
  return alert
}
