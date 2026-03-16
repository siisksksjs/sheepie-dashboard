import { getProducts } from "@/lib/actions/products"
import { NewOrderForm } from "@/components/orders/new-order-form"

export default async function NewOrderPage() {
  const products = await getProducts()
  const activeProducts = products.filter((product) => product.status === "active")

  return <NewOrderForm products={activeProducts} />
}
