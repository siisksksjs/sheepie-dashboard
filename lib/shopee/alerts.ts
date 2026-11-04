import type { SupabaseClient } from "@supabase/supabase-js"

import type { PollResult } from "./sync"
import type { ShopeeStore } from "./store"

export type ShopeeAlert = "needs_reconnect" | "repeated_failures" | "push_silent"

const DAY_MS = 24 * 60 * 60 * 1000
const REPEATED_FAILURE_THRESHOLD = 3
const SETTINGS_URL = "https://dashboard.sheepiesleep.com/more/shopee"

const MESSAGES: Record<ShopeeAlert, { subject: string; sentence: string }> = {
  needs_reconnect: {
    subject: "Sheepie Dashboard: Shopee needs reconnecting",
    sentence: "Shopee access has expired, so orders cannot sync until you reconnect Shopee on the settings page.",
  },
  repeated_failures: {
    subject: "Sheepie Dashboard: Shopee sync keeps failing",
    sentence: "The Shopee order sync has failed several times in a row; check the latest error on the settings page.",
  },
  push_silent: {
    subject: "Sheepie Dashboard: no Shopee push received in 24 hours",
    sentence: "No Shopee push has arrived in the past 24 hours, but the scheduled sync picked up new orders, so push may have stopped; check the settings page.",
  },
}

function within24h(at: Date | null, now: Date): boolean {
  return at !== null && now.getTime() - at.getTime() < DAY_MS
}

/**
 * Which alert (if any) is due: the most urgent condition, needs_reconnect >
 * repeated_failures > push_silent. Each kind is quiet for 24 hours after an
 * alert of that same kind, so another kind's alert never hides it. A quieted
 * condition does not fall through to a lower kind (that would alternate kinds
 * every run while one problem persists).
 */
export function pickShopeeAlert(input: {
  needsReconnect: boolean
  consecutiveFailures: number
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
  const due: ShopeeAlert | null = input.needsReconnect
    ? "needs_reconnect"
    : input.consecutiveFailures >= REPEATED_FAILURE_THRESHOLD
      ? "repeated_failures"
      : pushSilent
        ? "push_silent"
        : null
  if (!due) return null
  if (input.lastAlertKind === due && within24h(input.lastAlertAt, input.now)) return null
  return due
}

export type AlertDeps = {
  supabase: SupabaseClient
  store: Pick<ShopeeStore, "markAlerted">
  /** The connection's `last_alert_at` / `last_alert_kind` before this send; restored if the send fails. */
  previousAlertAt?: Date | null
  previousAlertKind?: ShopeeAlert | null
  fetchImpl?: typeof fetch
  now?: () => Date
}

function uniqueEmails(users: Array<{ email?: string | null }>): string[] {
  return Array.from(new Set(users.map((user) => user.email).filter((email): email is string => Boolean(email))))
}

/**
 * Emails every dashboard user about `alert` through Resend. The 24-hour window is
 * claimed in `last_alert_at` / `last_alert_kind` BEFORE sending, so a failed write after an accepted
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
  await deps.store.markAlerted((deps.now ?? (() => new Date()))(), alert)
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
      await deps.store.markAlerted(deps.previousAlertAt ?? null, deps.previousAlertKind ?? null)
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
