"use client"

import { Fragment, useState } from "react"
import { useRouter } from "next/navigation"
import type { MonthlyAdsReportBundle } from "@/lib/ads/reporting"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatCurrency } from "@/lib/utils"
import { TrendingUp, DollarSign, Package, ShoppingBag, Target } from "lucide-react"
import Link from "next/link"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import type { Channel } from "@/lib/types/database.types"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

const channelLabels: Record<string, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  tiktok: "TikTok",
  offline: "Offline",
}

const platformLabels: Record<string, string> = {
  tiktok_ads: "TikTok Ads",
  shopee_ads: "Shopee Ads",
  facebook_ads: "Facebook Ads",
  google_ads: "Google Ads",
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

const channelColors: Record<string, string> = {
  shopee: '#ff6b35',
  tokopedia: '#10b981',
  tiktok: '#3b82f6',
  offline: '#8b5cf6',
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
type HeatmapMetric = "units" | "orders" | "revenue"
type CalendarDaySummary = {
  orders: number
  units: number
  revenue: number
  items: { sku: string; name: string; quantity: number; revenue: number }[]
}
type ChannelProductRow = {
  channel: string
  sku: string
  name: string
  units_sold: number
  revenue: number
  cost: number
  profit: number
}

type Props = {
  initialOverview: any
  initialMonthly: any
  initialChannelProduct: any
  initialAdPerformance: any
  initialMonthlyAds: MonthlyAdsReportBundle
  initialReturnSummary: any
  initialCalendarDetails: any
  selectedYear: number | undefined
  selectedMonth: number | undefined
}

export function ReportsClient({
  initialOverview,
  initialMonthly,
  initialChannelProduct,
  initialAdPerformance,
  initialMonthlyAds,
  initialReturnSummary,
  initialCalendarDetails,
  selectedYear,
  selectedMonth,
}: Props) {
  const router = useRouter()
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null)
  const [selectedYearlyMonth, setSelectedYearlyMonth] = useState<number | null>(null)
  const [selectedYearlyCalendarDate, setSelectedYearlyCalendarDate] = useState<string | null>(null)
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>("units")

  // Update URL when filters change (navigates to new page with server-side data fetch)
  const updateFilters = (year: number | undefined, month: number | undefined) => {
    const params = new URLSearchParams()
    const nextMonth = year ? month : undefined

    if (year) params.set("year", year.toString())
    if (nextMonth) params.set("month", nextMonth.toString())
    router.push(`/reports?${params.toString()}`)
  }

  const overviewReport = initialOverview
  const monthlyReport = initialMonthly
  const channelProductReport = initialChannelProduct
  const adPerformance = initialAdPerformance
  const monthlyAds = initialMonthlyAds
  const returnSummary = initialReturnSummary

  const totalRevenue = overviewReport?.byChannel.reduce((sum: number, ch: any) => sum + ch.revenue, 0) || 0
  const totalFees = overviewReport?.byChannel.reduce((sum: number, ch: any) => sum + ch.fees, 0) || 0
  const totalProfit = overviewReport?.byProduct.reduce((sum: number, p: any) => sum + p.profit, 0) || 0
  const totalUnitsSold = overviewReport?.byProduct.reduce((sum: number, p: any) => sum + p.units_sold, 0) || 0
  const totalOrders = overviewReport?.byChannel.reduce((sum: number, ch: any) => sum + ch.orders, 0) || 0
  const returnedUnits = returnSummary?.returnedUnits || 0
  const returnedBySku = new Map<string, number>(
    (returnSummary?.bySku || []).map((item: any) => [item.sku, item.units])
  )
  const grossUnitsSold = totalUnitsSold + returnedUnits
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
  const trendData = (selectedMonth && monthlyReport?.byDay?.length > 0)
    ? monthlyReport.byDay
    : (monthlyReport?.byMonth || [])
  const isDailyTrend = selectedMonth && monthlyReport?.byDay?.length > 0
  const canFilterMonth = typeof selectedYear === "number"
  const selectedMonthKey = selectedYear && selectedMonth
    ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`
    : null
  const byDay = monthlyReport?.byDay || []
  const detailedByDate: Record<string, CalendarDaySummary> = initialCalendarDetails?.byDate || {}
  const detailedByDateEntries = Object.entries(detailedByDate)
  const byDateMap = new Map<string, {
    orders: number
    units_sold: number
    revenue: number
  }>(
    detailedByDateEntries.map(([date, value]) => [
      date,
      {
        orders: value.orders || 0,
        units_sold: value.units || 0,
        revenue: value.revenue || 0,
      },
    ])
  )
  const maxDayUnits = byDateMap.size > 0
    ? Math.max(...Array.from(byDateMap.values()).map((day) => day.units_sold || 0))
    : 0
  const maxDayOrders = byDateMap.size > 0
    ? Math.max(...Array.from(byDateMap.values()).map((day) => day.orders || 0))
    : 0
  const maxDayRevenue = byDateMap.size > 0
    ? Math.max(...Array.from(byDateMap.values()).map((day) => day.revenue || 0))
    : 0
  const maxHeatmapValue = heatmapMetric === "units"
    ? maxDayUnits
    : heatmapMetric === "orders"
      ? maxDayOrders
      : maxDayRevenue
  const calendarCells: Array<{ date: string; day: number } | null> = []

  if (selectedYear && selectedMonth) {
    const firstDayWeekIndex = new Date(selectedYear, selectedMonth - 1, 1).getDay()
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate()

    for (let i = 0; i < firstDayWeekIndex; i += 1) {
      calendarCells.push(null)
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const isoDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      calendarCells.push({ date: isoDate, day })
    }
  }

  const yearCalendarMonths = selectedYear && !selectedMonth
    ? Array.from({ length: 12 }, (_, monthIndex) => {
        const monthNumber = monthIndex + 1
        const monthKey = `${selectedYear}-${String(monthNumber).padStart(2, "0")}`
        const firstDayWeekIndex = new Date(selectedYear, monthIndex, 1).getDay()
        const daysInMonth = new Date(selectedYear, monthNumber, 0).getDate()
        const cells: Array<{ date: string; day: number } | null> = []
        const summary = monthlyReport?.byMonth?.find((item: any) => item.month === monthKey) || {
          month: monthKey,
          orders: 0,
          units_sold: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        }

        for (let i = 0; i < firstDayWeekIndex; i += 1) {
          cells.push(null)
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
          const isoDate = `${selectedYear}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`
          cells.push({ date: isoDate, day })
        }

        return {
          monthNumber,
          monthKey,
          monthLabel: new Date(selectedYear, monthIndex).toLocaleString("default", { month: "long" }),
          summary,
          cells,
        }
      })
    : []
  const maxMonthUnits = yearCalendarMonths.length > 0
    ? Math.max(...yearCalendarMonths.map((month) => month.summary.units_sold || 0))
    : 0
  const maxMonthOrders = yearCalendarMonths.length > 0
    ? Math.max(...yearCalendarMonths.map((month) => month.summary.orders || 0))
    : 0
  const maxMonthRevenue = yearCalendarMonths.length > 0
    ? Math.max(...yearCalendarMonths.map((month) => month.summary.revenue || 0))
    : 0
  const maxYearMonthValue = heatmapMetric === "units"
    ? maxMonthUnits
    : heatmapMetric === "orders"
      ? maxMonthOrders
      : maxMonthRevenue
  const selectedYearlyMonthBlock = selectedYearlyMonth
    ? yearCalendarMonths.find((month) => month.monthNumber === selectedYearlyMonth) || null
    : null
  const selectedYearlyMonthDetails = selectedYearlyMonthBlock
    ? selectedYearlyMonthBlock.cells
    : []
  const selectedYearlyDayDetails = selectedYearlyCalendarDate
    ? detailedByDate[selectedYearlyCalendarDate]
    : null

  const trendXAxisTickFormatter = (value: string) => {
    if (!isDailyTrend) return value
    return value?.split("-")?.[2] || value
  }
  const trendTooltipLabelFormatter = (label: string) => {
    if (!isDailyTrend) return label
    const parsed = new Date(`${label}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) return label
    return parsed.toLocaleDateString("default", { month: "short", day: "numeric" })
  }
  const selectedCalendarDetails = selectedCalendarDate ? detailedByDate[selectedCalendarDate] : null
  const selectedCalendarItems = selectedCalendarDetails?.items || []
  const selectedCalendarTotalRevenue = selectedCalendarItems.reduce((sum: number, item: any) => sum + item.revenue, 0)
  const groupedChannelProductData = ((channelProductReport?.data || []) as ChannelProductRow[]).reduce((groups: Array<{
    sku: string
    name: string
    items: ChannelProductRow[]
  }>, item) => {
    const lastGroup = groups[groups.length - 1]

    if (lastGroup && lastGroup.sku === item.sku) {
      lastGroup.items.push(item)
      return groups
    }

    groups.push({
      sku: item.sku,
      name: item.name,
      items: [item],
    })
    return groups
  }, [])
  const monthlyAdsLabel = formatMonthLabel(monthlyAds.month)
  const monthlyAdsMissingSpendRows: NonNullable<
    MonthlyAdsReportBundle["missingSpendScopes"]
  > = monthlyAds.missingSpendScopes ?? []
  const monthlyAdsProductLabels = new Map<string, string>(
    monthlyAds.channelBreakdown.map((row) => [row.sku, formatMonthlyAdsProductLabel(row)]),
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold mb-2">Sales Analytics</h1>
        <p className="text-muted-foreground">
          Comprehensive revenue, profit, and performance analytics
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Time Period</CardTitle>
          <CardDescription>Filter reports by year and month</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Select
                value={selectedYear?.toString() || "all"}
                onValueChange={(value) =>
                  updateFilters(
                    value === "all" ? undefined : parseInt(value, 10),
                    value === "all" ? undefined : selectedMonth,
                  )
                }
              >
                <SelectTrigger id="year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="month">Month</Label>
              <Select
                value={selectedMonth?.toString() || "all"}
                onValueChange={(value) =>
                  updateFilters(selectedYear, value === "all" ? undefined : parseInt(value, 10))
                }
                disabled={!canFilterMonth}
              >
                <SelectTrigger id="month">
                  <SelectValue placeholder={canFilterMonth ? "All Months" : "Select a year first"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <SelectItem key={month} value={month.toString()}>
                      {new Date(2000, month - 1).toLocaleString('default', { month: 'long' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
              Total Revenue
              <InfoTooltip
                content="Revenue calculation"
                formula="Selling Price - Allocated Channel Fees"
              />
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalOrders} orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
              Net Profit
              <InfoTooltip
                content="Profit calculation"
                formula="Revenue - Cost"
              />
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(totalProfit)}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center">
              {profitMargin.toFixed(1)}% margin
              <InfoTooltip
                content="Profit Margin calculation"
                formula="(Profit ÷ Revenue) × 100"
              />
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Units Sold
              {returnedUnits > 0 && (
                <InfoTooltip
                  content="Net units exclude returns. Gross includes returns."
                  formula={`Net: ${totalUnitsSold} · Returned: ${returnedUnits} · Gross: ${grossUnitsSold}`}
                />
              )}
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUnitsSold}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total products
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Order Value
            </CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgOrderValue)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Per order
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Ads Profitability</CardTitle>
          <CardDescription>
            SKU-level ads profitability and channel attribution for {monthlyAdsLabel}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {monthlyAds.load_error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              Unable to load the monthly ads report: {monthlyAds.load_error}
            </div>
          ) : monthlyAds.skuSummaries.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No reportable SKU activity was found for this month.
            </div>
          ) : (
            <>
              {monthlyAdsMissingSpendRows.length > 0 ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
                  <div className="mb-2 text-sm font-semibold text-destructive">
                    Spend rows still missing for ads-active channel scopes
                  </div>
                  <div className="space-y-1 text-sm text-destructive">
                    {monthlyAdsMissingSpendRows.map((row) => (
                      <div key={`${row.sku}-${row.channels.join("|")}`}>
                        {row.sku} · {formatChannelScope(row.channels)} · budget cap{" "}
                        {formatCurrency(row.budget_cap)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Target Units
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCount(monthlyAds.totals.total_target_units)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Actual Units
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCount(monthlyAds.totals.total_actual_units)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Ads Spend
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(monthlyAds.totals.total_ads_spent)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Profit Before Ads
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`text-2xl font-bold ${
                        monthlyAds.totals.profit_before_ads >= 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {formatCurrency(monthlyAds.totals.profit_before_ads)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Profit After Ads
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`text-2xl font-bold ${
                        monthlyAds.totals.profit_after_ads >= 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {formatCurrency(monthlyAds.totals.profit_after_ads)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Target Achievement
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {monthlyAds.totals.target_achievement_percent.toFixed(1)}%
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Ads Units</TableHead>
                      <TableHead className="text-right">Organic Units</TableHead>
                      <TableHead className="text-right">Ads Spend</TableHead>
                      <TableHead className="text-right">Budget Cap</TableHead>
                      <TableHead className="text-right">Profit After Ads</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyAds.skuSummaries.map((summary) => (
                      <TableRow key={summary.sku}>
                        <TableCell>
                          <div className="font-medium">
                            {monthlyAdsProductLabels.get(summary.sku) || summary.sku}
                          </div>
                          <div className="text-xs text-muted-foreground">{summary.sku}</div>
                        </TableCell>
                        <TableCell className="text-right">{formatCount(summary.target_units)}</TableCell>
                        <TableCell className="text-right">{formatCount(summary.actual_units)}</TableCell>
                        <TableCell className="text-right">
                          {formatCount(summary.ads_active_channel_units)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCount(summary.organic_channel_units)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(summary.total_ads_spent)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(summary.total_budget_cap)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold ${
                            summary.profit_after_ads >= 0 ? "text-success" : "text-destructive"
                          }`}
                        >
                          {formatCurrency(summary.profit_after_ads)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Classification</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Ads Spend</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Profit After Ads</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyAds.channelBreakdown.map((row) => (
                      <TableRow key={`${row.sku}-${row.channel}`}>
                        <TableCell>
                          <div className="font-medium">{formatMonthlyAdsProductLabel(row)}</div>
                          <div className="text-xs text-muted-foreground">{row.sku}</div>
                        </TableCell>
                        <TableCell>{channelLabels[row.channel]}</TableCell>
                        <TableCell>
                          <Badge variant={row.classification === "ads-active" ? "success" : "secondary"}>
                            {formatAdsClassificationLabel(row.classification)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCount(row.units)}</TableCell>
                        <TableCell className="text-right">
                          {row.actual_spend_missing
                            ? "Missing"
                            : row.uses_shared_budget
                              ? "Shared at SKU level"
                              : formatCurrency(row.ads_spent)}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                        <TableCell
                          className={`text-right font-semibold ${
                            row.profit_after_ads >= 0 ? "text-success" : "text-destructive"
                          }`}
                        >
                          {row.actual_spend_missing
                            ? "Missing"
                            : row.uses_shared_budget
                              ? "Shared at SKU level"
                              : formatCurrency(row.profit_after_ads)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Tabbed Content */}
      <Tabs defaultValue="trends" className="space-y-4">
        <div className="w-full overflow-x-auto">
          <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-5">
            <TabsTrigger value="trends" className="flex-shrink-0">Trends</TabsTrigger>
            <TabsTrigger value="channels" className="flex-shrink-0">Channels</TabsTrigger>
            <TabsTrigger value="products" className="flex-shrink-0">Products</TabsTrigger>
            <TabsTrigger value="details" className="flex-shrink-0">Details</TabsTrigger>
            <TabsTrigger value="ads" className="flex-shrink-0">Ad Performance</TabsTrigger>
          </TabsList>
        </div>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          {selectedMonth && selectedMonthKey && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle>Daily Calendar View ({selectedMonthKey})</CardTitle>
                    <CardDescription>
                      Orders and units per day with heatmap intensity by selected metric
                    </CardDescription>
                  </div>
                  <div className="w-full md:w-[220px]">
                    <Label htmlFor="heatmap-metric">Heatmap Basis</Label>
                    <Select value={heatmapMetric} onValueChange={(value) => setHeatmapMetric(value as HeatmapMetric)}>
                      <SelectTrigger id="heatmap-metric">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="units">Units Sold</SelectItem>
                        <SelectItem value="orders">Order Count</SelectItem>
                        <SelectItem value="revenue">Revenue</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Low</span>
                  <div className="h-3 w-6 rounded border bg-[rgba(16,185,129,0.12)]" />
                  <div className="h-3 w-6 rounded border bg-[rgba(16,185,129,0.3)]" />
                  <div className="h-3 w-6 rounded border bg-[rgba(16,185,129,0.5)]" />
                  <span>High</span>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {WEEKDAY_LABELS.map((label) => (
                    <div key={label} className="px-2 py-1 text-xs font-medium text-muted-foreground">
                      {label}
                    </div>
                  ))}

                  {calendarCells.map((cell, idx) => {
                    if (!cell) {
                      return <div key={`empty-${idx}`} className="min-h-[84px] rounded-md border border-dashed border-muted/40" />
                    }

                    const dayData = byDateMap.get(cell.date)
                    const orders = dayData?.orders || 0
                    const units = dayData?.units_sold || 0
                    const revenue = dayData?.revenue || 0
                    const heatmapValue = heatmapMetric === "units"
                      ? units
                      : heatmapMetric === "orders"
                        ? orders
                        : revenue
                    const heatmapIntensity = maxHeatmapValue > 0 ? heatmapValue / maxHeatmapValue : 0
                    const backgroundColor = heatmapIntensity > 0
                      ? `rgba(16,185,129,${(0.12 + heatmapIntensity * 0.42).toFixed(3)})`
                      : undefined

                    return (
                      <button
                        key={cell.date}
                        type="button"
                        aria-label={formatHeatmapDayAriaLabel(cell.date, orders, units, revenue)}
                        className="min-h-[84px] rounded-md border p-2 text-left transition hover:border-primary/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        style={backgroundColor ? { backgroundColor } : undefined}
                        title={`${cell.date}: ${orders} orders, ${units} units, ${formatCurrency(revenue)}`}
                        onClick={() => setSelectedCalendarDate(cell.date)}
                      >
                        <div className="text-xs font-semibold">{cell.day}</div>
                        <div className="mt-2 space-y-1 text-[11px] leading-tight text-muted-foreground">
                          <div>{orders} orders</div>
                          <div>{units} units</div>
                          <div>{formatCurrency(revenue)}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-3 text-xs text-muted-foreground">
                  Peak day in selected month: {maxDayOrders} orders / {maxDayUnits} units / {formatCurrency(maxDayRevenue)}
                </div>
              </CardContent>
            </Card>
          )}

          {!selectedMonth && yearCalendarMonths.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle>Daily Calendar View ({selectedYear})</CardTitle>
                    <CardDescription>
                      Orders and units per day across all months with heatmap intensity by selected metric
                    </CardDescription>
                  </div>
                  <div className="w-full md:w-[220px]">
                    <Label htmlFor="heatmap-metric-year">Heatmap Basis</Label>
                    <Select value={heatmapMetric} onValueChange={(value) => setHeatmapMetric(value as HeatmapMetric)}>
                      <SelectTrigger id="heatmap-metric-year">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="units">Units Sold</SelectItem>
                        <SelectItem value="orders">Order Count</SelectItem>
                        <SelectItem value="revenue">Revenue</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Low</span>
                  <div className="h-3 w-6 rounded border bg-[rgba(16,185,129,0.12)]" />
                  <div className="h-3 w-6 rounded border bg-[rgba(16,185,129,0.3)]" />
                  <div className="h-3 w-6 rounded border bg-[rgba(16,185,129,0.5)]" />
                  <span>High</span>
                </div>

                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {yearCalendarMonths.map((monthBlock) => (
                    (() => {
                      const monthValue = heatmapMetric === "units"
                        ? monthBlock.summary.units_sold
                        : heatmapMetric === "orders"
                          ? monthBlock.summary.orders
                          : monthBlock.summary.revenue
                      const monthIntensity = maxYearMonthValue > 0 ? monthValue / maxYearMonthValue : 0
                      const backgroundColor = monthIntensity > 0
                        ? `rgba(16,185,129,${(0.12 + monthIntensity * 0.42).toFixed(3)})`
                        : undefined

                      return (
                        <button
                          key={monthBlock.monthNumber}
                          type="button"
                          aria-label={formatHeatmapMonthAriaLabel({
                            label: monthBlock.monthLabel,
                            year: selectedYear,
                            orders: monthBlock.summary.orders,
                            units: monthBlock.summary.units_sold,
                            revenue: monthBlock.summary.revenue,
                          })}
                          className="rounded-lg border bg-card p-3 text-left transition hover:border-primary/60 hover:shadow-sm"
                          style={backgroundColor ? { backgroundColor } : undefined}
                          onClick={() => {
                            setSelectedYearlyMonth(monthBlock.monthNumber)
                            setSelectedYearlyCalendarDate(null)
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold">{monthBlock.monthLabel}</h3>
                            <span className="text-[10px] text-muted-foreground">
                              {selectedYear}-{String(monthBlock.monthNumber).padStart(2, "0")}
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                            <div>
                              <div className="text-[10px] text-muted-foreground">Orders</div>
                              <div className="font-semibold leading-tight">{monthBlock.summary.orders}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted-foreground">Units</div>
                              <div className="font-semibold leading-tight">{monthBlock.summary.units_sold}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted-foreground">Revenue</div>
                              <div className="text-xs font-semibold leading-tight">{formatCurrency(monthBlock.summary.revenue)}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted-foreground">Profit</div>
                              <div
                                className={`text-xs font-semibold leading-tight ${
                                  monthBlock.summary.profit >= 0 ? "text-success" : "text-destructive"
                                }`}
                              >
                                {formatCurrency(monthBlock.summary.profit)}
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })()
                  ))}
                </div>

                <div className="mt-3 text-xs text-muted-foreground">
                  Peak day in selected year: {maxDayOrders} orders / {maxDayUnits} units / {formatCurrency(maxDayRevenue)}
                </div>
              </CardContent>
            </Card>
          )}

          {trendData.length > 0 ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Revenue & Profit Trends</CardTitle>
                  <CardDescription>
                    {isDailyTrend ? "Daily performance through selected month" : "Monthly performance over time"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tickFormatter={trendXAxisTickFormatter} />
                      <YAxis />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                        labelFormatter={trendTooltipLabelFormatter}
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} name="Revenue" />
                      <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} name="Profit" />
                      <Line type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={2} name="Cost" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Units Sold Trend</CardTitle>
                  <CardDescription>
                    {isDailyTrend ? "Daily product volume through selected month" : "Product volumes over time"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tickFormatter={trendXAxisTickFormatter} />
                      <YAxis />
                      <Tooltip
                        labelFormatter={trendTooltipLabelFormatter}
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      />
                      <Legend />
                      <Bar dataKey="units_sold" fill="#8b5cf6" name="Units Sold" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No trend data available for selected period
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Channels Tab */}
        <TabsContent value="channels" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Revenue by Channel</CardTitle>
                <CardDescription>Channel performance comparison</CardDescription>
              </CardHeader>
              <CardContent>
                {overviewReport?.byChannel && overviewReport.byChannel.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={overviewReport.byChannel}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="channel" tickFormatter={(value) => channelLabels[value]} />
                      <YAxis />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                        labelFormatter={(label) => channelLabels[label as string]}
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      />
                      <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No channel data
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Orders by Channel</CardTitle>
                <CardDescription>Order distribution</CardDescription>
              </CardHeader>
              <CardContent>
                {overviewReport?.byChannel && overviewReport.byChannel.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={overviewReport.byChannel}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry: any) => `${channelLabels[entry.channel]}: ${entry.orders}`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="orders"
                      >
                        {overviewReport.byChannel.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={channelColors[entry.channel] || COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No channel data
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Channel Performance Details</CardTitle>
              <CardDescription>Detailed breakdown by channel</CardDescription>
            </CardHeader>
            <CardContent>
              {overviewReport?.byChannel && overviewReport.byChannel.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Fees</TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center">
                          Revenue
                          <InfoTooltip
                            content="Revenue calculation"
                            formula="Selling Price - Allocated Channel Fees"
                          />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center">
                          Profit
                          <InfoTooltip
                            content="Profit calculation"
                            formula="Revenue - Cost"
                          />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center">
                          Avg Order
                          <InfoTooltip
                            content="Average Order Value"
                            formula="Total Revenue ÷ Number of Orders"
                          />
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overviewReport.byChannel.map((channel: any) => (
                      <TableRow key={channel.channel}>
                        <TableCell className="font-medium">
                          {channelLabels[channel.channel]}
                        </TableCell>
                        <TableCell className="text-right">{channel.orders}</TableCell>
                        <TableCell className="text-right text-destructive">
                          {formatCurrency(channel.fees)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(channel.revenue)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <span className={channel.profit >= 0 ? 'text-success' : 'text-destructive'}>
                            {formatCurrency(channel.profit)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(channel.revenue / channel.orders)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No channel data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Revenue by Product</CardTitle>
                <CardDescription>Product revenue comparison</CardDescription>
              </CardHeader>
              <CardContent>
                {overviewReport?.byProduct && overviewReport.byProduct.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={overviewReport.byProduct} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={120} />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      />
                      <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No product data
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Profit by Product</CardTitle>
                <CardDescription>Product profitability</CardDescription>
              </CardHeader>
              <CardContent>
                {overviewReport?.byProduct && overviewReport.byProduct.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={overviewReport.byProduct} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={120} />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      />
                      <Bar dataKey="profit" fill="#3b82f6" name="Profit" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No product data
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Product Performance Details</CardTitle>
              <CardDescription>Comprehensive product metrics</CardDescription>
            </CardHeader>
            <CardContent>
              {overviewReport?.byProduct && overviewReport.byProduct.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Units Sold</TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center">
                          Revenue
                          <InfoTooltip
                            content="Revenue calculation"
                            formula="Selling Price - Allocated Channel Fees"
                          />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center">
                          Cost
                          <InfoTooltip
                            content="Cost calculation (COGS)"
                            formula="line item COGS snapshot × quantity"
                          />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center">
                          Profit
                          <InfoTooltip
                            content="Profit calculation"
                            formula="Revenue - Cost"
                          />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center">
                          Margin %
                          <InfoTooltip
                            content="Profit Margin calculation"
                            formula="(Profit ÷ Revenue) × 100"
                          />
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overviewReport.byProduct.map((product: any) => {
                      const returnedForSku = returnedBySku.get(product.sku) || 0
                      const margin = product.revenue > 0
                        ? ((product.profit / product.revenue) * 100)
                        : 0

                      return (
                        <TableRow key={product.sku}>
                          <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell className="text-right font-medium">
                            <span className="inline-flex items-center justify-end gap-1">
                              {product.units_sold}
                              {returnedForSku > 0 ? (
                                <InfoTooltip
                                  content="Net units exclude returns. Gross includes returns."
                                  formula={`Net: ${product.units_sold} · Returned: ${returnedForSku} · Gross: ${product.units_sold + returnedForSku}`}
                                />
                              ) : null}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(product.revenue)}
                          </TableCell>
                          <TableCell className="text-right text-destructive">
                            {formatCurrency(product.cost)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            <span className={product.profit >= 0 ? 'text-success' : 'text-destructive'}>
                              {formatCurrency(product.profit)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={margin >= 0 ? 'text-success' : 'text-destructive'}>
                              {margin.toFixed(1)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No product data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Channel × Product Matrix</CardTitle>
              <CardDescription>Sales breakdown by channel and product</CardDescription>
            </CardHeader>
            <CardContent>
              {channelProductReport?.data && channelProductReport.data.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Channel</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">
                          <span className="inline-flex items-center">
                            Revenue
                            <InfoTooltip
                              content="Revenue calculation"
                              formula="Selling Price - Allocated Channel Fees"
                            />
                          </span>
                        </TableHead>
                        <TableHead className="text-right">
                          <span className="inline-flex items-center">
                            Profit
                            <InfoTooltip
                              content="Profit calculation"
                              formula="Revenue - Cost"
                            />
                          </span>
                        </TableHead>
                        <TableHead className="text-right">
                          <span className="inline-flex items-center">
                            Margin
                            <InfoTooltip
                              content="Profit Margin calculation"
                              formula="(Profit ÷ Revenue) × 100"
                            />
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedChannelProductData.map((group) => (
                        <Fragment key={`${group.sku}-group`}>
                          <TableRow key={`${group.sku}-group`} className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={6} className="py-3">
                              <div className="flex items-center justify-between gap-4">
                                <div className="font-semibold">{group.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {group.items.length} channel{group.items.length > 1 ? "s" : ""}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                          {group.items.map((item, idx: number) => {
                            const margin = item.revenue > 0
                              ? ((item.profit / item.revenue) * 100)
                              : 0

                            return (
                              <TableRow key={`${item.channel}-${item.sku}-${idx}`}>
                                <TableCell className="font-medium">
                                  {channelLabels[item.channel]}
                                </TableCell>
                                <TableCell className="text-muted-foreground">{item.name}</TableCell>
                                <TableCell className="text-right">{item.units_sold}</TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(item.revenue)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className={item.profit >= 0 ? 'text-success' : 'text-destructive'}>
                                    {formatCurrency(item.profit)}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className={margin >= 0 ? 'text-success' : 'text-destructive'}>
                                    {margin.toFixed(1)}%
                                  </span>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No detailed data available
                </div>
              )}
            </CardContent>
          </Card>

          {monthlyReport?.byMonth && monthlyReport.byMonth.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Monthly Summary</CardTitle>
                <CardDescription>Month-by-month performance breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center">
                          Revenue
                          <InfoTooltip
                            content="Revenue calculation"
                            formula="Selling Price - Allocated Channel Fees"
                          />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center">
                          Cost
                          <InfoTooltip
                            content="Cost calculation (COGS)"
                            formula="line item COGS snapshot × quantity"
                          />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center">
                          Profit
                          <InfoTooltip
                            content="Profit calculation"
                            formula="Revenue - Cost"
                          />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center">
                          Margin
                          <InfoTooltip
                            content="Profit Margin calculation"
                            formula="(Profit ÷ Revenue) × 100"
                          />
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyReport.byMonth.map((month: any) => {
                      const margin = month.revenue > 0
                        ? ((month.profit / month.revenue) * 100)
                        : 0

                      return (
                        <TableRow key={month.month}>
                          <TableCell className="font-medium">{month.month}</TableCell>
                          <TableCell className="text-right">{month.orders}</TableCell>
                          <TableCell className="text-right">{month.units_sold}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(month.revenue)}
                          </TableCell>
                          <TableCell className="text-right text-destructive">
                            {formatCurrency(month.cost)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={month.profit >= 0 ? 'text-success' : 'text-destructive'}>
                              {formatCurrency(month.profit)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={margin >= 0 ? 'text-success' : 'text-destructive'}>
                              {margin.toFixed(1)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Ad Performance Tab */}
        <TabsContent value="ads" className="space-y-4">
          {adPerformance && adPerformance.campaigns_metrics.length > 0 ? (
            <>
              {/* Overall Ad Metrics Cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Ad Spend
                    </CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(adPerformance.total_ad_spend)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Across all campaigns
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        Total Revenue
                        <InfoTooltip
                          content="Revenue from ad-driven orders"
                          formula="Selling Price - Channel Fees"
                        />
                      </span>
                    </CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(adPerformance.total_revenue)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      From ad-driven orders
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        Overall ROAS
                        <InfoTooltip
                          content="Return on Ad Spend"
                          formula="Total Revenue ÷ Total Ad Spend"
                        />
                      </span>
                    </CardTitle>
                    <Target className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${
                      adPerformance.overall_roas >= 2 ? 'text-success' :
                      adPerformance.overall_roas >= 1 ? 'text-warning' :
                      'text-destructive'
                    }`}>
                      {adPerformance.overall_roas.toFixed(2)}x
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Return on ad spend
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        Avg Cost/Order
                        <InfoTooltip
                          content="Average cost per order from ads"
                          formula="Total Ad Spend ÷ Total Orders"
                        />
                      </span>
                    </CardTitle>
                    <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(adPerformance.avg_cost_per_order)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {adPerformance.total_orders} total orders
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Campaign Performance Table */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Campaign Performance</CardTitle>
                      <CardDescription>
                        Detailed metrics for all campaigns ({adPerformance.active_campaigns_count} active)
                      </CardDescription>
                    </div>
                    <Link href="/ad-campaigns">
                      <Button variant="outline" size="sm">
                        View All Campaigns
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Mobile View */}
                  <div className="md:hidden space-y-3">
                    {adPerformance.campaigns_metrics.map((campaign: any) => (
                      <div key={campaign.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{campaign.campaign_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {platformLabels[campaign.platform]}
                            </p>
                          </div>
                          <Badge variant={campaign.status === 'active' ? 'success' : 'secondary'}>
                            {campaign.status}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Spend:</span>
                            <span className="font-medium">{formatCurrency(campaign.total_spend)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Revenue:</span>
                            <span className="font-medium">{formatCurrency(campaign.revenue)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">ROAS:</span>
                            <span className={`font-semibold ${
                              campaign.roas >= 2 ? 'text-success' :
                              campaign.roas >= 1 ? 'text-warning' :
                              'text-destructive'
                            }`}>
                              {campaign.roas.toFixed(2)}x
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop View */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Campaign</TableHead>
                          <TableHead>Platform</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead className="text-right">Spend</TableHead>
                          <TableHead className="text-right">Orders</TableHead>
                          <TableHead className="text-right">
                            <span className="inline-flex items-center">
                              Revenue
                              <InfoTooltip
                                content="Revenue from campaign"
                                formula="Selling Price - Channel Fees"
                              />
                            </span>
                          </TableHead>
                          <TableHead className="text-right">
                            <span className="inline-flex items-center">
                              ROAS
                              <InfoTooltip
                                content="Return on Ad Spend"
                                formula="Revenue ÷ Ad Spend"
                              />
                            </span>
                          </TableHead>
                          <TableHead className="text-right">
                            <span className="inline-flex items-center">
                              Cost/Order
                              <InfoTooltip
                                content="Average cost per order"
                                formula="Ad Spend ÷ Orders"
                              />
                            </span>
                          </TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {adPerformance.campaigns_metrics.map((campaign: any) => {
                          const startDate = new Date(campaign.start_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                          })
                          const endDate = campaign.end_date
                            ? new Date(campaign.end_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric'
                              })
                            : 'Ongoing'

                          return (
                            <TableRow key={campaign.id}>
                              <TableCell className="font-medium">
                                <Link href={`/ad-campaigns/${campaign.id}`} className="hover:underline">
                                  {campaign.campaign_name}
                                </Link>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {platformLabels[campaign.platform]}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {startDate} - {endDate}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(campaign.total_spend)}
                              </TableCell>
                              <TableCell className="text-right">
                                {campaign.orders_count}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(campaign.revenue)}
                              </TableCell>
                              <TableCell className="text-right">
                                <span className={`font-semibold ${
                                  campaign.roas >= 2 ? 'text-success' :
                                  campaign.roas >= 1 ? 'text-warning' :
                                  'text-destructive'
                                }`}>
                                  {campaign.roas.toFixed(2)}x
                                </span>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {formatCurrency(campaign.cost_per_order)}
                              </TableCell>
                              <TableCell>
                                <Badge variant={
                                  campaign.status === 'active' ? 'success' :
                                  campaign.status === 'completed' ? 'secondary' :
                                  'default'
                                }>
                                  {campaign.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Spend vs Revenue Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Spend vs Revenue by Campaign</CardTitle>
                  <CardDescription>Compare ad spend with generated revenue</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={adPerformance.campaigns_metrics}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="campaign_name"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                      />
                      <YAxis />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      />
                      <Legend />
                      <Bar dataKey="total_spend" fill="#ef4444" name="Ad Spend" />
                      <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No ad campaigns yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start tracking your ad spend and measure ROAS by creating your first campaign
                </p>
                <Link href="/ad-campaigns/new">
                  <Button>
                    Create First Campaign
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(selectedCalendarDate)} onOpenChange={(open) => !open && setSelectedCalendarDate(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Daily Item Details</DialogTitle>
            <DialogDescription>
              {selectedCalendarDate || "-"}
            </DialogDescription>
          </DialogHeader>

          <div className="text-sm text-muted-foreground">
            Total Revenue: <span className="font-semibold text-foreground">{formatCurrency(selectedCalendarTotalRevenue)}</span>
          </div>

          {selectedCalendarItems.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No sold items for this day.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Sold</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedCalendarItems.map((item: any) => (
                  <TableRow key={item.sku}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(item.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedYearlyMonth)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedYearlyMonth(null)
            setSelectedYearlyCalendarDate(null)
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {selectedYearlyMonthBlock?.monthLabel} {selectedYear} Heatmap
            </DialogTitle>
            <DialogDescription>
              Daily orders, units, and revenue for the selected month.
            </DialogDescription>
          </DialogHeader>

          {selectedYearlyMonthBlock ? (
            <div className="space-y-5">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Low</span>
                <div className="h-3 w-6 rounded border bg-[rgba(16,185,129,0.12)]" />
                <div className="h-3 w-6 rounded border bg-[rgba(16,185,129,0.3)]" />
                <div className="h-3 w-6 rounded border bg-[rgba(16,185,129,0.5)]" />
                <span>High</span>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={`modal-${label}`} className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    {label}
                  </div>
                ))}

                {selectedYearlyMonthDetails.map((cell, idx) => {
                  if (!cell) {
                    return <div key={`modal-empty-${idx}`} className="min-h-[84px] rounded-md border border-dashed border-muted/40" />
                  }

                  const dayData = byDateMap.get(cell.date)
                  const orders = dayData?.orders || 0
                  const units = dayData?.units_sold || 0
                  const revenue = dayData?.revenue || 0
                  const heatmapValue = heatmapMetric === "units"
                    ? units
                    : heatmapMetric === "orders"
                      ? orders
                      : revenue
                  const heatmapIntensity = maxHeatmapValue > 0 ? heatmapValue / maxHeatmapValue : 0
                  const backgroundColor = heatmapIntensity > 0
                    ? `rgba(16,185,129,${(0.12 + heatmapIntensity * 0.42).toFixed(3)})`
                    : undefined

                    return (
                      <button
                        key={cell.date}
                        type="button"
                        aria-label={formatHeatmapDayAriaLabel(cell.date, orders, units, revenue)}
                        className="min-h-[84px] rounded-md border p-2 text-left transition hover:border-primary/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        style={backgroundColor ? { backgroundColor } : undefined}
                        title={`${cell.date}: ${orders} orders, ${units} units, ${formatCurrency(revenue)}`}
                        onClick={() => setSelectedYearlyCalendarDate(cell.date)}
                      >
                      <div className="text-xs font-semibold">{cell.day}</div>
                      <div className="mt-2 space-y-1 text-[11px] leading-tight text-muted-foreground">
                        <div>{orders} orders</div>
                         <div>{units} units</div>
                         <div>{formatCurrency(revenue)}</div>
                       </div>
                      </button>
                    )
                  })}
              </div>

              {selectedYearlyDayDetails ? (
                <div className="rounded-lg border p-4">
                  <div className="mb-3">
                    <h3 className="font-semibold">{selectedYearlyCalendarDate}</h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedYearlyDayDetails.orders} orders • {selectedYearlyDayDetails.units} units • {formatCurrency(selectedYearlyDayDetails.revenue)}
                    </p>
                  </div>

                  {selectedYearlyDayDetails.items.length > 0 ? (
                    <div className="space-y-2">
                      {selectedYearlyDayDetails.items.map((item) => (
                        <div key={`${selectedYearlyCalendarDate}-${item.sku}`} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
                          <div>
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">{item.sku}</div>
                          </div>
                          <div className="text-right">
                            <div>{item.quantity} units</div>
                            <div className="text-xs text-muted-foreground">{formatCurrency(item.revenue)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No item details for this day.</div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Click a day to inspect the item-level breakdown.
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function formatMonthLabel(value: string) {
  const parsed = new Date(`${value}T00:00:00`)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleDateString("default", { month: "long", year: "numeric" })
}

function formatMonthlyAdsProductLabel(row: MonthlyAdsReportBundle["channelBreakdown"][number]) {
  if (!row.product_name) {
    return row.sku
  }

  return row.product_variant ? `${row.product_name} (${row.product_variant})` : row.product_name
}

function formatAdsClassificationLabel(
  classification: MonthlyAdsReportBundle["channelBreakdown"][number]["classification"],
) {
  return classification === "ads-active" ? "Ads-Active" : "Organic"
}

function formatChannelScope(channels: readonly Channel[] | undefined) {
  if (!channels || channels.length === 0) {
    return "No channels"
  }

  return channels.map((channel) => channelLabels[channel]).join(" + ")
}

function formatHeatmapDayAriaLabel(
  date: string,
  orders: number,
  units: number,
  revenue: number,
) {
  return `Open details for ${date}: ${orders} orders, ${units} units, ${formatCurrency(revenue)} revenue`
}

function formatHeatmapMonthAriaLabel(input: {
  label: string
  year: number | undefined
  orders: number
  units: number
  revenue: number
}) {
  return `Open ${input.label} ${input.year ?? ""} details: ${input.orders} orders, ${input.units} units, ${formatCurrency(input.revenue)} revenue`
    .trim()
}
