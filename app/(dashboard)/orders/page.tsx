import Link from "next/link"
import { Plus } from "lucide-react"
import { getOrders } from "@/lib/actions/orders"
import { getListingImageMap } from "@/lib/actions/quick-log"
import { getShopeeSyncSummary } from "@/lib/actions/shopee"
import { OrdersListClient } from "@/components/orders/orders-list-client"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page"
import { formatSyncAge } from "@/lib/shopee/settings-actions"

export const metadata = { title: "Orders · Sheepie" }

export default async function OrdersPage() {
  const [orders, images, summary] = await Promise.all([
    getOrders({ limit: 200 }),
    getListingImageMap(),
    // The sync line is a nicety: never let it take the orders page down.
    getShopeeSyncSummary().catch(() => null),
  ])

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Everything you've logged, newest first. Use + Log an order for your usual orders, or Log again on any row."
        actions={
          <Button asChild variant="outline">
            <Link href="/orders/new">
              <Plus className="mr-1.5 h-4 w-4" />
              New order from scratch
            </Link>
          </Button>
        }
      />
      {summary?.connected && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground">
          <span>Shopee last synced: {formatSyncAge(summary.lastSyncedUntil, new Date())}</span>
          {summary.pendingCount > 0 && (
            <Link href="/more/shopee" className="font-bold text-primary hover:underline">
              {summary.pendingCount === 1 ? "1 Shopee order needs attention →" : `${summary.pendingCount} Shopee orders need attention →`}
            </Link>
          )}
        </div>
      )}
      {orders.length === 0 ? (
        <div className="glass flex flex-col items-center rounded-[22px] px-6 py-14 text-center">
          <h3 className="font-display text-lg font-semibold">No orders yet</h3>
          <p className="mt-1 max-w-[42ch] text-sm text-muted-foreground">Log your first sale and it shows up here — and in Today&apos;s sky.</p>
          <Button asChild className="mt-4">
            <Link href="/orders/new">Log the first order</Link>
          </Button>
        </div>
      ) : (
        <OrdersListClient orders={orders} images={images} />
      )}
    </div>
  )
}
