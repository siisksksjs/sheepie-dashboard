import { getOrderEntryWorkspace } from "@/lib/actions/products"
import { getOrderById } from "@/lib/actions/orders"
import { getShopeeSyncSummary } from "@/lib/actions/shopee"
import { NewOrderForm, type NewOrderInitial } from "@/components/orders/new-order-form"
import { DEFAULT_PACK_SIZE } from "@/lib/products/pack-sizes"

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams
  const [{ products, packSizes, channelPrices }, source, shopeeSummary] = await Promise.all([
    getOrderEntryWorkspace(),
    from && /^[0-9a-f-]{36}$/.test(from) ? getOrderById(from).catch(() => null) : Promise.resolve(null),
    // Without a summary the form simply skips the manual-entry confirm.
    getShopeeSyncSummary().catch(() => null),
  ])
  const shopeeSyncLive = shopeeSummary?.syncStartAt != null

  const initial: NewOrderInitial | undefined = source
    ? {
        channel: source.order.channel,
        channelFees: source.order.channel_fees,
        notes: source.order.notes,
        lineItems: source.lineItems.map((item) => ({
          sku: item.sku,
          pack_size: item.pack_size ?? DEFAULT_PACK_SIZE,
          quantity: item.quantity,
          selling_price: item.selling_price,
        })),
      }
    : undefined

  return <NewOrderForm products={products} packSizes={packSizes} channelPrices={channelPrices} initial={initial} shopeeSyncLive={shopeeSyncLive} />
}
