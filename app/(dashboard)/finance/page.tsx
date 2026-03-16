import { getProducts } from "@/lib/actions/products"
import {
  getFinanceAccounts,
  getFinanceCategories,
  getFinanceEntries,
  getFinanceOverview,
  getFinanceTransfers,
  getInventoryPurchaseBatches,
} from "@/lib/actions/finance"
import { FinanceClient } from "@/components/finance/finance-client"

type SearchParams = Promise<{ year?: string; month?: string }>

export default async function FinancePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const currentYear = new Date().getFullYear()
  const selectedYear = params.year ? parseInt(params.year, 10) : currentYear
  const selectedMonth = params.month ? parseInt(params.month, 10) : undefined

  const [
    overview,
    entries,
    transfers,
    purchases,
    accounts,
    categories,
    products,
  ] = await Promise.all([
    getFinanceOverview(selectedYear, selectedMonth),
    getFinanceEntries({ year: selectedYear, month: selectedMonth, limit: 100 }),
    getFinanceTransfers({ year: selectedYear, month: selectedMonth, limit: 100 }),
    getInventoryPurchaseBatches({ year: selectedYear, month: selectedMonth, limit: 50 }),
    getFinanceAccounts(),
    getFinanceCategories(),
    getProducts(),
  ])

  return (
    <FinanceClient
      selectedYear={selectedYear}
      selectedMonth={selectedMonth}
      overview={overview}
      entries={entries}
      transfers={transfers}
      purchases={purchases}
      accounts={accounts}
      categories={categories}
      products={products.filter((product) => product.status === "active")}
    />
  )
}
