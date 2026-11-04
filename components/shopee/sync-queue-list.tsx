"use client"

import { useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { resolveSyncQueueItem, type ShopeeQueueItem } from "@/lib/actions/shopee"

function QueueRow({ item }: { item: ShopeeQueueItem }) {
  const [resolving, startResolving] = useTransition()

  function resolve() {
    startResolving(async () => {
      const result = await resolveSyncQueueItem(item.order_sn)
      if (result.success) toast.success(result.message ?? "已处理")
      else toast.error(result.error)
    })
  }

  const isReturn = item.reason === "return_review"

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="num font-semibold">#{item.order_sn}</span>
        {isReturn ? <Badge variant="warning">退货待处理</Badge> : <Badge variant="destructive">同步出错</Badge>}
      </div>
      <p className="mt-1 break-words text-[13.5px] text-muted-foreground">
        {isReturn ? "买家在 Shopee 申请了退货或退款。请到订单页选择退回的货能不能再卖。" : item.message ?? "同步这张订单时出错了。"}
      </p>
      <div className="mt-3 flex gap-2">
        {isReturn && item.order_id && (
          <Button asChild size="sm">
            <Link href={`/orders/${item.order_id}`}>去处理</Link>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={resolve} disabled={resolving}>
          {resolving ? "处理中…" : "已处理"}
        </Button>
      </div>
    </li>
  )
}

export function SyncQueueList({ queue }: { queue: ShopeeQueueItem[] }) {
  return (
    <section>
      <h2 className="font-display text-[19px] font-semibold">待处理订单</h2>
      {queue.length > 0 ? (
        <ul className="glass mt-3 divide-y divide-primary/[0.07] overflow-hidden rounded-[22px]">
          {queue.map((item) => (
            <QueueRow key={item.order_sn} item={item} />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13.5px] text-muted-foreground">没有待处理的订单。</p>
      )}
    </section>
  )
}
