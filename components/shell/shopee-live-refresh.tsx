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

    let cancelled = false
    let supabase: ReturnType<typeof createClient> | undefined
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | undefined

    const subscribe = async () => {
      supabase = createClient()
      // A session restored from cookies fires INITIAL_SESSION, which supabase-js does not pass
      // to Realtime, so the channel would join as anon and RLS would drop every orders event.
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session) await supabase.realtime.setAuth(data.session.access_token)
      if (cancelled) return
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
    }

    subscribe().catch(() => {
      // Realtime unavailable: pages still refresh on navigation.
    })

    return () => {
      cancelled = true
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
