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
      if (result.success) toast.success(result.message ?? "Marked as handled.")
      else toast.error(result.error)
    })
  }

  const isReturn = item.reason === "return_review"

  function describe(): string {
    if (!isReturn) return item.message ?? "Something went wrong syncing this order."
    if (item.order_id) {
      return "The buyer asked Shopee for a return or refund. Open the order and choose whether the goods can be resold."
    }
    // The return came before the order ever reached the dashboard, so there is no order to open.
    return `${item.message ?? "Return requested before the order was synced"}. Check it in Shopee Seller Centre, then mark it handled.`
  }

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="num font-semibold">#{item.order_sn}</span>
        {isReturn ? <Badge variant="warning">Return to review</Badge> : <Badge variant="destructive">Sync error</Badge>}
      </div>
      <p className="mt-1 break-words text-[13.5px] text-muted-foreground">{describe()}</p>
      <div className="mt-3 flex gap-2">
        {isReturn && item.order_id && (
          <Button asChild size="sm">
            <Link href={`/orders/${item.order_id}`}>Review order</Link>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={resolve} disabled={resolving}>
          {resolving ? "Saving…" : "Mark handled"}
        </Button>
      </div>
    </li>
  )
}

export function SyncQueueList({ queue }: { queue: ShopeeQueueItem[] }) {
  return (
    <section>
      <h2 className="font-display text-[19px] font-semibold">Pending orders</h2>
      {queue.length > 0 ? (
        <ul className="glass mt-3 divide-y divide-primary/[0.07] overflow-hidden rounded-[22px]">
          {queue.map((item) => (
            <QueueRow key={item.order_sn} item={item} />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13.5px] text-muted-foreground">No pending orders.</p>
      )}
    </section>
  )
}
