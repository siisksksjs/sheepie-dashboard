import { getProducts } from "@/lib/actions/products"
import { getListingImageMap } from "@/lib/actions/quick-log"
import { getStockOnHand } from "@/lib/actions/inventory"
import { NewLedgerEntryForm } from "@/components/ledger/new-ledger-entry-form"
import { SampleForm } from "@/components/ledger/sample-form"

export default async function NewLedgerEntryPage({ searchParams }: { searchParams: Promise<{ purpose?: string }> }) {
  const { purpose } = await searchParams
  const products = (await getProducts()).filter(product => product.status === "active")
  if (purpose === "sample") {
    const [images, stock] = await Promise.all([getListingImageMap(), getStockOnHand()])
    return <SampleForm products={products} images={images} stock={stock} />
  }
  return <NewLedgerEntryForm products={products} initialMovementType={purpose === "adjustment" ? "ADJUSTMENT" : undefined} />
}
