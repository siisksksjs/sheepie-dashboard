import { getReportsBundle } from "@/lib/actions/orders"
import {
  getAdPerformanceSummary,
  getMonthlyAdsReportBundle,
} from "@/lib/actions/ad-campaigns"
import { ReportsClient } from "./reports-client"

type SearchParams = Promise<{ year?: string; month?: string }>

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const selectedYear = parseYearParam(params.year)
  const selectedMonth = selectedYear ? parseMonthParam(params.month) : undefined
  const reportYear = selectedYear ?? currentYear
  const reportMonthNumber = selectedMonth ?? currentMonth
  const reportMonth = `${reportYear}-${String(reportMonthNumber).padStart(2, "0")}-01`

  const [{ overview, monthly, channelProduct, returns, calendar }, adPerf, monthlyAds] =
    await Promise.all([
      getReportsBundle(selectedYear, selectedMonth),
      getAdPerformanceSummary(),
      getMonthlyAdsReportBundle(reportMonth),
    ])

  return (
    <ReportsClient
      initialOverview={overview}
      initialMonthly={monthly}
      initialChannelProduct={channelProduct}
      initialAdPerformance={adPerf}
      initialMonthlyAds={monthlyAds}
      initialReturnSummary={returns}
      initialCalendarDetails={calendar}
      selectedYear={selectedYear}
      selectedMonth={selectedMonth}
    />
  )
}

function parseYearParam(value?: string) {
  if (!value) {
    return undefined
  }

  const year = Number(value)

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return undefined
  }

  return year
}

function parseMonthParam(value?: string) {
  if (!value) {
    return undefined
  }

  const month = Number(value)

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return undefined
  }

  return month
}
