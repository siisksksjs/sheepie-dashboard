import type { SupabaseClient } from "@supabase/supabase-js"

import type { PollResult, ShopeeFailedOrder } from "./sync"
import type { ShopeeStore } from "./store"

/**
 * Warnings with a 24-hour quiet window, tracked in `last_alert_at` / `last_alert_kind`.
 * Failures are not alerts: every failure emails (see sendSyncFailureEmail / sendOrderFailureEmail).
 */
export type ShopeeAlert = "push_silent"

const DAY_MS = 24 * 60 * 60 * 1000
const SETTINGS_URL = "https://dashboard.sheepiesleep.com/more/shopee"
const SETTINGS_LINK = `<p><a href="${SETTINGS_URL}">${SETTINGS_URL}</a></p>`

const MESSAGES: Record<ShopeeAlert, { subject: string; sentence: string }> = {
  push_silent: {
    subject: "Sheepie Dashboard: no Shopee push received in 24 hours",
    sentence: "No Shopee push has arrived in the past 24 hours, but the scheduled sync picked up new orders, so push may have stopped; check the settings page.",
  },
}

const SYNC_FAILED_SUBJECT = "Sheepie Dashboard: Shopee sync failed"
const NEEDS_RECONNECT_SUBJECT = "Sheepie Dashboard: Shopee needs reconnecting"
const NEEDS_RECONNECT_SENTENCE =
  "Shopee access has expired, so orders cannot sync until you reconnect Shopee on the settings page."

function within24h(at: Date | null, now: Date): boolean {
  return at !== null && now.getTime() - at.getTime() < DAY_MS
}

/** Escapes text from Shopee or error messages before it goes into an email body. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Whether push_silent is due: sync is live, the poll created orders in the
 * last 24 hours, but no push arrived. Quiet for 24 hours after the last one.
 */
export function pickShopeeAlert(input: {
  /** sync_start_at is set. */
  syncLive: boolean
  lastPushAt: Date | null
  /** Orders the poll (not push) created in the last 24 hours. */
  pollCreatedLast24h: number
  lastAlertAt: Date | null
  lastAlertKind: ShopeeAlert | null
  now: Date
}): ShopeeAlert | null {
  const pushSilent = input.syncLive && !within24h(input.lastPushAt, input.now) && input.pollCreatedLast24h > 0
  if (!pushSilent) return null
  if (input.lastAlertKind === "push_silent" && within24h(input.lastAlertAt, input.now)) return null
  return "push_silent"
}

/** What every Shopee email needs: who to send to and how to reach Resend. */
export type EmailDeps = {
  supabase: SupabaseClient
  fetchImpl?: typeof fetch
}

export type AlertDeps = EmailDeps & {
  store: Pick<ShopeeStore, "markAlerted">
  /** The connection's `last_alert_at` / `last_alert_kind` before this send; restored if the send fails. */
  previousAlertAt?: Date | null
  previousAlertKind?: ShopeeAlert | null
  now?: () => Date
}

type PreparedEmail = { apiKey: string; from: string; recipients: string[] }

function uniqueEmails(users: Array<{ email?: string | null }>): string[] {
  return Array.from(new Set(users.map((user) => user.email).filter((email): email is string => Boolean(email))))
}

/** Checks the Resend env and lists every dashboard user's email. Throws without sending anything. */
async function prepareEmail(supabase: SupabaseClient): Promise<PreparedEmail> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured")
  if (!from) throw new Error("EMAIL_FROM is not configured")

  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`Listing alert recipients failed: ${error.message}`)
  const recipients = uniqueEmails(data?.users ?? [])
  if (recipients.length === 0) throw new Error("No recipients found")
  return { apiKey, from, recipients }
}

/** Posts one email through Resend. Errors carry the status and response text, never the key. */
async function postEmail(
  prepared: PreparedEmail,
  email: { subject: string; html: string },
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${prepared.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: prepared.from, to: prepared.recipients, ...email }),
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200)
    throw new Error(`Resend failed with ${response.status}${detail ? `: ${detail}` : ""}`)
  }
}

async function sendEmail(email: { subject: string; html: string }, deps: EmailDeps): Promise<void> {
  await postEmail(await prepareEmail(deps.supabase), email, deps.fetchImpl)
}

/**
 * Emails every dashboard user about `alert` through Resend. The 24-hour window is
 * claimed in `last_alert_at` / `last_alert_kind` BEFORE sending, so a failed write after an accepted
 * email can never make the same alert repeat every cron run. If the send fails the
 * claim is released (best effort); worst case is one missed alert, never spam.
 */
export async function sendShopeeAlert(alert: ShopeeAlert, deps: AlertDeps): Promise<void> {
  const prepared = await prepareEmail(deps.supabase)
  const { subject, sentence } = MESSAGES[alert]
  const html = `<p>${sentence}</p>${SETTINGS_LINK}`

  // If the claim fails nothing is sent.
  await deps.store.markAlerted((deps.now ?? (() => new Date()))(), alert)
  try {
    await postEmail(prepared, { subject, html }, deps.fetchImpl)
  } catch (sendError) {
    try {
      await deps.store.markAlerted(deps.previousAlertAt ?? null, deps.previousAlertKind ?? null)
    } catch (releaseError) {
      const message = releaseError instanceof Error ? releaseError.message : "Unknown error"
      console.error(`Shopee alert claim could not be released: ${message}`)
    }
    throw sendError
  }
}

/**
 * Emails every dashboard user about a failed cron poll, every run (no quiet
 * window). Does nothing unless the poll `failed` or `needs_reconnect`.
 * Throws on failure; the caller must keep that from failing the sync.
 */
export async function sendSyncFailureEmail(
  result: Pick<PollResult, "status" | "consecutiveFailures" | "error">,
  deps: EmailDeps
): Promise<void> {
  if (result.status === "needs_reconnect") {
    await sendEmail({ subject: NEEDS_RECONNECT_SUBJECT, html: `<p>${NEEDS_RECONNECT_SENTENCE}</p>${SETTINGS_LINK}` }, deps)
    return
  }
  if (result.status !== "failed") return

  const count = result.consecutiveFailures
  const html =
    `<p>The scheduled Shopee order sync failed (${count} ${count === 1 ? "time" : "times"} in a row). ` +
    `It tries again every 15 minutes.</p>` +
    `<p>Error: ${escapeHtml(result.error ?? "Unknown error")}</p>` +
    SETTINGS_LINK
  await sendEmail({ subject: SYNC_FAILED_SUBJECT, html }, deps)
}

function describeFailedOrder(order: ShopeeFailedOrder): string {
  if (order.reason === "unmapped_item") {
    const names = (order.items ?? []).map(({ item_name, model_name }) =>
      model_name ? `${item_name} (${model_name})` : item_name
    )
    return `${order.orderSn}: needs product mapping in /more/shopee${names.length ? `: ${names.join(", ")}` : ""}`
  }
  return `${order.orderSn}: ${order.message ?? "Unknown error"}`
}

/**
 * One email listing every order that newly failed in a sync run or push.
 * Does nothing for an empty list. Throws on failure; the caller must keep
 * that from failing the sync or push.
 */
export async function sendOrderFailureEmail(failed: ShopeeFailedOrder[], deps: EmailDeps): Promise<void> {
  if (failed.length === 0) return

  const subject = `Sheepie Dashboard: ${failed.length} Shopee ${failed.length === 1 ? "order" : "orders"} failed to sync`
  const lines = failed.map((order) => escapeHtml(describeFailedOrder(order))).join("<br>")
  const html =
    `<p>${failed.length === 1 ? "This Shopee order" : "These Shopee orders"} could not be added to the dashboard:</p>` +
    `<p>${lines}</p>` +
    `<p>Errors retry every 15 minutes. Unmapped products sync once they are mapped on the settings page.</p>` +
    SETTINGS_LINK
  await sendEmail({ subject, html }, deps)
}

/**
 * Decides and sends the push_silent warning for a finished cron poll. Returns
 * the alert sent, or null. Throws on failure; the caller must keep that from
 * failing the sync response.
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
    syncLive: conn.syncStartAt !== null,
    lastPushAt: conn.lastPushAt,
    pollCreatedLast24h: counts.poll,
    lastAlertAt: conn.lastAlertAt,
    lastAlertKind: conn.lastAlertKind,
    now,
  })
  if (!alert) return null

  await sendShopeeAlert(alert, { ...deps, previousAlertAt: conn.lastAlertAt, previousAlertKind: conn.lastAlertKind })
  return alert
}

/**
 * Runs one email send, logging a single safe line instead of throwing: an email
 * problem must never fail a sync or a push. Messages never carry keys or tokens.
 */
export async function sendSafely(label: string, send: () => Promise<unknown>): Promise<void> {
  try {
    await send()
  } catch (error) {
    console.error(`${label}: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Every email due after a cron poll, each isolated from the others: the sync
 * failure email, then one email for the newly failed orders, then the
 * push_silent check. Never throws.
 */
export async function sendPollEmails(
  result: PollResult,
  deps: AlertDeps & { store: Pick<ShopeeStore, "markAlerted" | "getConnection" | "countRecentSyncedVia"> }
): Promise<void> {
  await sendSafely("Shopee sync failure email failed", () => sendSyncFailureEmail(result, deps))
  await sendSafely("Shopee order failure email failed", () =>
    sendOrderFailureEmail(result.summary?.failedOrders ?? [], deps)
  )
  await sendSafely("Shopee alert failed", () => checkShopeeAlerts(result, deps))
}
