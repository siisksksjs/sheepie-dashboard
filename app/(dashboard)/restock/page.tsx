import { getInventoryPurchaseBatches } from "@/lib/actions/restock-batches"
import { getProducts } from "@/lib/actions/products"
import { RestockClient } from "@/components/restock/restock-client"

export const metadata = { title: "Restock · Sheepie" }

export default async function RestockPage() {
  const [restocks, products] = await Promise.all([
    getInventoryPurchaseBatches(),
    getProducts(),
  ])

  return (
    <RestockClient
      restocks={restocks}
      products={products.filter((product) => product.status === "active" && !product.is_bundle)}
    />
  )
}
