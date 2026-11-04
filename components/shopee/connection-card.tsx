"use client"

import { useEffect, useState, useTransition, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { startShopeeSync, syncShopeeNow, type ShopeeConnectionStatus } from "@/lib/actions/shopee"
import { formatDate, formatDateTime } from "@/lib/utils"

const CONNECT_HREF = "/api/shopee/connect"

type Props = {
  status: ShopeeConnectionStatus
  /** "Last synced" wording, worked out on the server. */
  syncAge: string
  /** The refresh token has run out, so only reconnecting brings the sync back. */
  authExpired: boolean
  /** From the OAuth callback redirect (`?connected=1` / `?error=connect_failed`). */
  notice: "connected" | "connect_failed" | null
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[13px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="num text-right text-[14px] font-semibold">{children}</dd>
    </div>
  )
}

export function ConnectionCard({ status, syncAge, authExpired, notice }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [syncing, startSyncing] = useTransition()
  const [starting, startStarting] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!notice) return
    if (notice === "connected") toast.success("Shopee connected.", { id: "shopee-connect" })
    else toast.error("Connecting Shopee failed. Try again.", { id: "shopee-connect" })
    router.replace(pathname, { scroll: false })
  }, [notice, pathname, router])

  function syncNow() {
    startSyncing(async () => {
      const result = await syncShopeeNow()
      if (result.success) toast.success(result.message ?? "Sync finished.")
      else toast.error(result.error)
    })
  }

  function goLive() {
    startStarting(async () => {
      const result = await startShopeeSync()
      if (result.success) {
        setConfirmOpen(false)
        toast.success(result.message ?? "Auto-sync started.")
      } else toast.error(result.error)
    })
  }

  if (!status.connected) {
    return (
      <section className="glass rounded-[22px] p-5">
        <h2 className="font-display text-[19px] font-semibold">Shopee shop</h2>
        <p className="mt-1 text-[14px] text-muted-foreground">Not connected yet. Once connected, Shopee orders sync here on their own.</p>
        <Button asChild className="mt-4 w-full sm:w-auto">
          <a href={CONNECT_HREF}>Connect Shopee</a>
        </Button>
      </section>
    )
  }

  return (
    <section className="glass rounded-[22px] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[19px] font-semibold">Shopee shop</h2>
        {status.sync_start_at ? <Badge variant="success">Auto-sync on</Badge> : <Badge variant="warning">Auto-sync not started</Badge>}
      </div>

      <dl className="mt-2 divide-y divide-primary/[0.07]">
        <Detail label="Shop ID">{status.shop_id}</Detail>
        <Detail label="Access expires">{status.refresh_expires_at ? formatDate(status.refresh_expires_at) : "—"}</Detail>
        <Detail label="Last synced">{syncAge}</Detail>
        {status.sync_start_at && <Detail label="Auto-sync since">{formatDateTime(status.sync_start_at)}</Detail>}
      </dl>

      {authExpired && <p className="mt-3 text-[13.5px] font-semibold text-destructive">Shopee access has expired. Reconnect Shopee to resume syncing.</p>}
      {status.consecutive_failures > 0 && (
        <p className="mt-3 rounded-[14px] border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-[13.5px] text-destructive" role="alert">
          Sync failed {status.consecutive_failures} time{status.consecutive_failures === 1 ? "" : "s"} in a row{status.last_sync_error ? `: ${status.last_sync_error}` : "."}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {!status.sync_start_at && (
          <Button onClick={() => setConfirmOpen(true)} className="w-full sm:w-auto">
            Start auto-sync
          </Button>
        )}
        <Button variant="outline" onClick={syncNow} disabled={syncing} className="w-full sm:w-auto">
          <RefreshCw className={syncing ? "mr-1.5 h-4 w-4 animate-spin" : "mr-1.5 h-4 w-4"} />
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
        <Button asChild variant={authExpired ? "default" : "ghost"} className="w-full sm:w-auto">
          <a href={CONNECT_HREF}>Reconnect</a>
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(open) => !starting && setConfirmOpen(open)}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md">
          <DialogHeader>
            <DialogTitle>Start auto-sync?</DialogTitle>
            <DialogDescription>From now on, new Shopee orders sync automatically — stop logging them by hand.</DialogDescription>
          </DialogHeader>
          <p className="text-[13.5px] text-muted-foreground">
            Orders placed before this moment that ship later will not sync; log those by hand as before. The start time cannot be changed once set.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={starting}>
              Cancel
            </Button>
            <Button onClick={goLive} disabled={starting}>
              {starting ? "Starting…" : "Start auto-sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
