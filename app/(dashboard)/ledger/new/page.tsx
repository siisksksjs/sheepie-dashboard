import { getProducts } from "@/lib/actions/products"
import { NewLedgerEntryForm } from "@/components/ledger/new-ledger-entry-form"

export default async function NewLedgerEntryPage() {
  const products = await getProducts()
  const activeProducts = products.filter((product) => product.status === "active")

  return <NewLedgerEntryForm products={activeProducts} />
}
