import { ConnectionCard } from "@/components/shopee/connection-card"
import { ListingMapEditor } from "@/components/shopee/listing-map-editor"
import { SyncQueueList } from "@/components/shopee/sync-queue-list"
import { PageHeader } from "@/components/ui/page"
import { getShopeeSettings } from "@/lib/actions/shopee"
import { formatSyncAge } from "@/lib/shopee/settings-actions"

export const metadata = { title: "Shopee 同步 · Sheepie" }

export default async function ShopeeSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>
}) {
  const [{ connected, error }, settings] = await Promise.all([searchParams, getShopeeSettings()])
  const { status } = settings
  const now = new Date()
  const notice = connected === "1" ? "connected" : error === "connect_failed" ? "connect_failed" : null
  const authExpired = Boolean(status.refresh_expires_at && new Date(status.refresh_expires_at) <= now)

  return (
    <div className="mx-auto max-w-[720px] space-y-6">
      <PageHeader title="Shopee 同步" description="连接 Shopee 店铺，配好商品对应，处理同步不了的订单。" />
      <ConnectionCard
        status={status}
        syncAge={formatSyncAge(status.last_synced_until, now)}
        authExpired={authExpired}
        notice={notice}
      />
      <SyncQueueList queue={settings.queue} />
      <ListingMapEditor unmappedItems={settings.unmappedItems} mappings={settings.mappings} products={settings.products} />
    </div>
  )
}
