"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"

/** A burst of synced orders (a catch-up poll) refreshes the page once, not once per order. */
const REFRESH_DEBOUNCE_MS = 1000

/**
 * Keeps whatever page is open in step with Shopee: refreshes it when a synced
 * order is created or updated, and toasts when a new one arrives. Renders nothing.
 * Realtime is a convenience, so setup and teardown never throw.
 */
export function ShopeeLiveRefresh() {
  const router = useRouter()

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    const scheduleRefresh = () => {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS)
    }

    let supabase: ReturnType<typeof createClient> | undefined
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | undefined
    try {
      supabase = createClient()
      channel = supabase
        .channel("shopee-orders-live")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders", filter: "source=eq.shopee_api" },
          (payload) => {
            const orderId = (payload.new as { order_id?: string } | undefined)?.order_id
            toast(orderId ? `New Shopee order #${orderId}` : "New Shopee order")
            scheduleRefresh()
          },
        )
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: "source=eq.shopee_api" }, scheduleRefresh)
        .subscribe()
    } catch {
      // Realtime unavailable: pages still refresh on navigation.
    }

    return () => {
      clearTimeout(refreshTimer)
      try {
        if (supabase && channel) void supabase.removeChannel(channel)
      } catch {
        // Already torn down.
      }
    }
  }, [router])

  return null
}
