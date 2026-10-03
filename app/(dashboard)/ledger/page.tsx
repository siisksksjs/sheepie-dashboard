import { getLedgerEntries, getStockOnHand } from "@/lib/actions/inventory"
import { getProducts } from "@/lib/actions/products"
import { getListingImageMap } from "@/lib/actions/quick-log"
import { LedgerClient } from "@/components/ledger/ledger-client"
import { getJakartaToday } from "@/lib/utils"

export const metadata = { title: "Ledger · Sheepie" }
export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams
  const [entries, products, stock, images] = await Promise.all([getLedgerEntries({ all: true }), getProducts(), getStockOnHand(), getListingImageMap()])
  return <LedgerClient entries={entries} products={products} stock={stock} images={images} today={getJakartaToday()} initialView={view === "samples" || view === "dead" ? view : "all"} />
}
