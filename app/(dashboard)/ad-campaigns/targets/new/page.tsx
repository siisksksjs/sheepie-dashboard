import { TargetForm } from "@/components/ad-campaigns/target-form"
import { getProducts } from "@/lib/actions/products"

export default async function NewSkuSalesTargetPage() {
  const products = await getProducts()

  return <TargetForm mode="create" products={products} />
}
