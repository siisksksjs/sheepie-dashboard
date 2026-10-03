import { getInventoryPurchaseBatches } from "@/lib/actions/restock-batches"
import { getListingImageMap } from "@/lib/actions/quick-log"
import { getProducts } from "@/lib/actions/products"
import { RestockClient } from "@/components/restock/restock-client"

export const metadata = { title: "Restock · Sheepie" }

export default async function RestockPage({ searchParams }: { searchParams: Promise<{ sku?: string; quantity?: string; new?: string }> }) {
  const params = await searchParams
  const [restocks, products, images] = await Promise.all([
    getInventoryPurchaseBatches(),
    getProducts(),
    getListingImageMap(),
  ])
  const activeProducts = products.filter((product) => product.status === "active" && !product.is_bundle)
  const focusSku = activeProducts.find((product) => product.sku === params.sku)?.sku
  const quantity = Number(params.quantity)
  const initialQuantity = Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1
  const createInitially = Boolean(focusSku && params.new === "1")

  return (
    <RestockClient
      key={`${focusSku ?? "all"}:${createInitially}:${initialQuantity}`}
      focusSku={focusSku}
      initialQuantity={initialQuantity}
      createInitially={createInitially}
      images={images}
      restocks={restocks}
      products={activeProducts}
    />
  )
}
