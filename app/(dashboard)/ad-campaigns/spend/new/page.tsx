import { SpendForm } from "@/components/ad-campaigns/spend-form"
import { getProducts } from "@/lib/actions/products"

export default async function NewMonthlyAdSpendPage() {
  const products = await getProducts()

  return <SpendForm mode="create" products={products} />
}
