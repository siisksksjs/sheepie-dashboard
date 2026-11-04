"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { syncShopeeNow } from "@/lib/actions/shopee"
import { cn } from "@/lib/utils"

/** Runs the Shopee catch-up sync from the orders page, then reloads the list. */
export function ShopeeSyncNowButton() {
  const router = useRouter()
  const [syncing, startSyncing] = useTransition()

  function syncNow() {
    startSyncing(async () => {
      const result = await syncShopeeNow()
      if (result.success) {
        toast.success(result.message ?? "Sync finished.")
        router.refresh()
      } else toast.error(result.error)
    })
  }

  return (
    <button
      type="button"
      onClick={syncNow}
      disabled={syncing}
      className="inline-flex items-center gap-1 font-bold text-primary hover:underline disabled:pointer-events-none disabled:opacity-60"
    >
      <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} aria-hidden="true" />
      {syncing ? "Syncing…" : "Sync now"}
    </button>
  )
}
