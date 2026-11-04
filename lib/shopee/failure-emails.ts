import "server-only"

import { after } from "next/server"

import { createServiceClient } from "@/lib/supabase/service"
import { sendOrderFailureEmail, sendSafely } from "./alerts"
import type { ShopeeFailedOrder } from "./sync"

/**
 * Emails newly failed orders once the response has gone out (Next `after()`),
 * so a Shopee webhook or the Sync now button is never held up or failed by it.
 */
export function emailFailedOrdersLater(failed: ShopeeFailedOrder[]): void {
  if (failed.length === 0) return
  after(() =>
    sendSafely("Shopee order failure email failed", () =>
      sendOrderFailureEmail(failed, { supabase: createServiceClient() })
    )
  )
}
