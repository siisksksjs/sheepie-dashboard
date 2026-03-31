import { getFinanceAccounts, getInventoryPurchaseBatches } from "@/lib/actions/finance"
import { getProducts } from "@/lib/actions/products"
import { RestockClient } from "@/components/restock/restock-client"

export default async function RestockPage() {
  const [restocks, accounts, products] = await Promise.all([
    getInventoryPurchaseBatches(),
    getFinanceAccounts(),
    getProducts(),
  ])

  return (
    <RestockClient
      restocks={restocks}
      accounts={accounts.filter((account) => account.is_active)}
      products={products.filter((product) => product.status === "active" && !product.is_bundle)}
    />
  )
}
