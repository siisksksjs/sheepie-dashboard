import { getMonthlySalesReport, getChannelProductReport, getSalesReport, getReturnSummary } from "@/lib/actions/orders"
import { getAdPerformanceSummary } from "@/lib/actions/ad-campaigns"
import { ReportsClient } from "./reports-client"

type SearchParams = Promise<{ year?: string; month?: string }>

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const currentYear = new Date().getFullYear()

  // Parse filters from URL
  const selectedYear = params.year ? parseInt(params.year) : currentYear
  const selectedMonth = params.month ? parseInt(params.month) : undefined

  // Fetch all data in parallel on the server
  const [overview, monthly, channelProduct, adPerf, returns] = await Promise.all([
    getSalesReport(selectedYear, selectedMonth),
    getMonthlySalesReport(selectedYear, selectedMonth),
    getChannelProductReport(selectedYear, selectedMonth),
    getAdPerformanceSummary(),
    getReturnSummary(selectedYear, selectedMonth),
  ])

  return (
    <ReportsClient
      initialOverview={overview}
      initialMonthly={monthly}
      initialChannelProduct={channelProduct}
      initialAdPerformance={adPerf}
      initialReturnSummary={returns}
      selectedYear={selectedYear}
      selectedMonth={selectedMonth}
    />
  )
}
