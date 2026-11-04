import { ConnectionCard } from "@/components/shopee/connection-card"
import { ListingMapEditor } from "@/components/shopee/listing-map-editor"
import { SyncQueueList } from "@/components/shopee/sync-queue-list"
import { PageHeader } from "@/components/ui/page"
import { getShopeeSettings } from "@/lib/actions/shopee"
import { formatSyncAge } from "@/lib/shopee/settings-actions"

export const metadata = { title: "Shopee sync · Sheepie" }

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
      <PageHeader title="Shopee sync" description="Connect the Shopee shop, map its products to SKUs, and handle orders the sync could not." />
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
