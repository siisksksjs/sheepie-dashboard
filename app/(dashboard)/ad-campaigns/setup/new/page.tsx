import { SetupForm } from "@/components/ad-campaigns/setup-form"
import { getProducts } from "@/lib/actions/products"

export default async function NewSkuAdSetupPage() {
  const products = await getProducts()

  return <SetupForm mode="create" products={products} />
}
