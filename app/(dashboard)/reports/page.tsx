import { getReportsBundle } from "@/lib/actions/orders"
import { getAdPerformanceSummary } from "@/lib/actions/ad-campaigns"
import { ReportsClient } from "./reports-client"

type SearchParams = Promise<{ year?: string; month?: string }>

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const currentYear = new Date().getFullYear()

  // Parse filters from URL
  const selectedYear = params.year ? parseInt(params.year) : currentYear
  const selectedMonth = params.month ? parseInt(params.month) : undefined

  const [{ overview, monthly, channelProduct, returns, calendar }, adPerf] = await Promise.all([
    getReportsBundle(selectedYear, selectedMonth),
    getAdPerformanceSummary(),
  ])

  return (
    <ReportsClient
      initialOverview={overview}
      initialMonthly={monthly}
      initialChannelProduct={channelProduct}
      initialAdPerformance={adPerf}
      initialReturnSummary={returns}
      initialCalendarDetails={calendar}
      selectedYear={selectedYear}
      selectedMonth={selectedMonth}
    />
  )
}
