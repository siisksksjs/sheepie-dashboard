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

const CONNECT_HREF = "/api/shopee/connect"

const dateFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Jakarta", dateStyle: "long" })
const dateTimeFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Jakarta", dateStyle: "long", timeStyle: "short" })

type Props = {
  status: ShopeeConnectionStatus
  /** "上次同步" wording, worked out on the server. */
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
    if (notice === "connected") toast.success("Shopee 已连接", { id: "shopee-connect" })
    else toast.error("连接 Shopee 失败，请再试一次", { id: "shopee-connect" })
    router.replace(pathname, { scroll: false })
  }, [notice, pathname, router])

  function syncNow() {
    startSyncing(async () => {
      const result = await syncShopeeNow()
      if (result.success) toast.success(result.message ?? "同步完成")
      else toast.error(result.error)
    })
  }

  function goLive() {
    startStarting(async () => {
      const result = await startShopeeSync()
      if (result.success) {
        setConfirmOpen(false)
        toast.success(result.message ?? "自动同步已开始")
      } else toast.error(result.error)
    })
  }

  if (!status.connected) {
    return (
      <section className="glass rounded-[22px] p-5">
        <h2 className="font-display text-[19px] font-semibold">Shopee 店铺</h2>
        <p className="mt-1 text-[14px] text-muted-foreground">还没连接。连接之后，Shopee 订单会自动同步到这里。</p>
        <Button asChild className="mt-4 w-full sm:w-auto">
          <a href={CONNECT_HREF}>连接 Shopee</a>
        </Button>
      </section>
    )
  }

  return (
    <section className="glass rounded-[22px] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[19px] font-semibold">Shopee 店铺</h2>
        {status.sync_start_at ? <Badge variant="success">自动同步中</Badge> : <Badge variant="warning">还没开始自动同步</Badge>}
      </div>

      <dl className="mt-2 divide-y divide-primary/[0.07]">
        <Detail label="店铺 ID">{status.shop_id}</Detail>
        <Detail label="授权到期">{status.refresh_expires_at ? dateFormat.format(new Date(status.refresh_expires_at)) : "—"}</Detail>
        <Detail label="上次同步">{syncAge}</Detail>
        {status.sync_start_at && <Detail label="自动同步开始于">{dateTimeFormat.format(new Date(status.sync_start_at))}</Detail>}
      </dl>

      {authExpired && <p className="mt-3 text-[13.5px] font-semibold text-destructive">授权已过期，需要重新连接 Shopee。</p>}
      {status.consecutive_failures > 0 && (
        <p className="mt-3 rounded-[14px] border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-[13.5px] text-destructive" role="alert">
          同步连续失败 {status.consecutive_failures} 次{status.last_sync_error ? `：${status.last_sync_error}` : ""}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {!status.sync_start_at && (
          <Button onClick={() => setConfirmOpen(true)} className="w-full sm:w-auto">
            开始自动同步
          </Button>
        )}
        <Button variant="outline" onClick={syncNow} disabled={syncing} className="w-full sm:w-auto">
          <RefreshCw className={syncing ? "mr-1.5 h-4 w-4 animate-spin" : "mr-1.5 h-4 w-4"} />
          {syncing ? "同步中…" : "立即同步"}
        </Button>
        <Button asChild variant={authExpired ? "default" : "ghost"} className="w-full sm:w-auto">
          <a href={CONNECT_HREF}>重新连接</a>
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(open) => !starting && setConfirmOpen(open)}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md">
          <DialogHeader>
            <DialogTitle>开始自动同步？</DialogTitle>
            <DialogDescription>从现在起，新的 Shopee 订单不再手动录</DialogDescription>
          </DialogHeader>
          <p className="text-[13.5px] text-muted-foreground">
            在这之前下单、之后才出货的订单不会自动同步，照原来的方式手动录。这个时间设定之后就不能再改。
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={starting}>
              取消
            </Button>
            <Button onClick={goLive} disabled={starting}>
              {starting ? "开始中…" : "确定开始"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
