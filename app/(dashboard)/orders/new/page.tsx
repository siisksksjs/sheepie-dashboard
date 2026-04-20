import { getOrderEntryWorkspace } from "@/lib/actions/products"
import { NewOrderForm } from "@/components/orders/new-order-form"

export default async function NewOrderPage() {
  const { products, packSizes, channelPrices } = await getOrderEntryWorkspace()

  return (
    <NewOrderForm
      products={products}
      packSizes={packSizes}
      channelPrices={channelPrices}
    />
  )
}
