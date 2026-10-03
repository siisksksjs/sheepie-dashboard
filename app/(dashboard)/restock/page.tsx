import { getInventoryPurchaseBatches } from "@/lib/actions/restock-batches"
import { getListingImageMap } from "@/lib/actions/quick-log"
import { getProducts } from "@/lib/actions/products"
import { RestockClient } from "@/components/restock/restock-client"

export const metadata = { title: "Restock · Sheepie" }

export default async function RestockPage() {
  const [restocks, products, images] = await Promise.all([
    getInventoryPurchaseBatches(),
    getProducts(),
    getListingImageMap(),
  ])

  return (
    <RestockClient
      images={images}
      restocks={restocks}
      products={products.filter((product) => product.status === "active" && !product.is_bundle)}
    />
  )
}
