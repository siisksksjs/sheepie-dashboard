"use client"

import { Fragment, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { formatCurrency } from "@/lib/utils"
import { ArrowRight, CalendarDays } from "lucide-react"
import { PageHeader, Stat } from "@/components/ui/page"
import { PlatformBadge } from "@/components/shell/platform-badge"
import { PLATFORMS } from "@/components/shell/platforms"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import type { Channel, PackSize } from "@/lib/types/database.types"
import { getPackSizeLabel } from "@/lib/products/pack-sizes"
import {
  FinancialComparisonChart,
  FinancialTrendChart,
  UnitsTrendChart
} from "@/components/reports/financial-charts"
import { sortByGmvDescending } from "@/lib/reports/presentation"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

const channelLabels: Record<string, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  tiktok: "TikTok",
  offline: "Offline"
}

const COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899"
]

const channelColors: Record<string, string> = Object.fromEntries(
  Object.entries(PLATFORMS).map(([key, value]) => [key, value.color])
)

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
type HeatmapMetric = "units" | "orders" | "gmv" | "revenue"
type CalendarDaySummary = {
  orders: number
  units: number
  gmv: number
  revenue: number
  items: {
    sku: string
    name: string
    quantity: number
    gmv: number
    revenue: number
  }[]
}
type ChannelProductRow = {
  channel: string
  sku: string
  name: string
  pack_size: PackSize
  units_sold: number
  gmv: number
  revenue: number
  cost: number
  profit: number
}

type ReportBundle = Awaited<
  ReturnType<typeof import("@/lib/actions/orders").getReportsBundle>
>
type Props = {
  initialOverview: ReportBundle["overview"]
  initialMonthly: ReportBundle["monthly"]
  initialChannelProduct: ReportBundle["channelProduct"]
  initialReturnSummary: ReportBundle["returns"]
  initialCalendarDetails: ReportBundle["calendar"]
  selectedYear: number | undefined
  selectedMonth: number | undefined
}

export function ReportsClient({
  initialOverview,
  initialMonthly,
  initialChannelProduct,
  initialReturnSummary,
  initialCalendarDetails,
  selectedYear,
  selectedMonth
}: Props) {
  const router = useRouter()
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<
    string | null
  >(null)
  const [selectedYearlyMonth, setSelectedYearlyMonth] = useState<number | null>(
    null
  )
  const [selectedYearlyCalendarDate, setSelectedYearlyCalendarDate] = useState<
    string | null
  >(null)
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>("units")

  // Update URL when filters change (navigates to new page with server-side data fetch)
  const updateFilters = (
    year: number | undefined,
    month: number | undefined
  ) => {
    const params = new URLSearchParams()
    const nextMonth = year ? month : undefined

    if (year) params.set("year", year.toString())
    if (nextMonth) params.set("month", nextMonth.toString())
    router.push(`/reports?${params.toString()}`)
  }

  const overviewReport = initialOverview
  const monthlyReport = initialMonthly
  const channelProductReport = initialChannelProduct
  const returnSummary = initialReturnSummary

  const totalGmv =
    overviewReport?.byChannel.reduce((sum: number, ch) => sum + ch.gmv, 0) || 0
  const totalRevenue =
    overviewReport?.byChannel.reduce(
      (sum: number, ch) => sum + ch.revenue,
      0
    ) || 0
  const totalCost =
    overviewReport?.byProduct.reduce(
      (sum: number, product) => sum + product.cost,
      0
    ) || 0
  const totalProfit =
    overviewReport?.byChannel.reduce((sum: number, ch) => sum + ch.profit, 0) ||
    0
  const totalUnitsSold =
    overviewReport?.byProduct.reduce(
      (sum: number, p) => sum + p.units_sold,
      0
    ) || 0
  const totalOrders =
    overviewReport?.byChannel.reduce((sum: number, ch) => sum + ch.orders, 0) ||
    0
  const returnedUnits = returnSummary?.returnedUnits || 0
  const returnedBySku = new Map<string, number>(
    (returnSummary?.bySku || []).map((item) => [item.sku, item.units])
  )
  const grossUnitsSold = totalUnitsSold + returnedUnits
  const avgOrderValue = totalOrders > 0 ? totalGmv / totalOrders : 0
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
  const channelsByGmv = sortByGmvDescending(overviewReport?.byChannel || [])
  const productsByGmv = sortByGmvDescending(overviewReport?.byProduct || [])
  const trendData =
    selectedMonth && monthlyReport?.byDay?.length > 0
      ? monthlyReport.byDay
      : monthlyReport?.byMonth || []
  const isDailyTrend = selectedMonth && monthlyReport?.byDay?.length > 0
  const canFilterMonth = typeof selectedYear === "number"
  const selectedMonthKey =
    selectedYear && selectedMonth
      ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`
      : null
  const detailedByDate: Record<string, CalendarDaySummary> =
    initialCalendarDetails?.byDate || {}
  const detailedByDateEntries = Object.entries(detailedByDate)
  const byDateMap = new Map<
    string,
    {
      orders: number
      units_sold: number
      gmv: number
      revenue: number
    }
  >(
    detailedByDateEntries.map(([date, value]) => [
      date,
      {
        orders: value.orders || 0,
        units_sold: value.units || 0,
        gmv: value.gmv || 0,
        revenue: value.revenue || 0
      }
    ])
  )
  const maxDayUnits =
    byDateMap.size > 0
      ? Math.max(
          ...Array.from(byDateMap.values()).map((day) => day.units_sold || 0)
        )
      : 0
  const maxDayOrders =
    byDateMap.size > 0
      ? Math.max(
          ...Array.from(byDateMap.values()).map((day) => day.orders || 0)
        )
      : 0
  const maxDayRevenue =
    byDateMap.size > 0
      ? Math.max(
          ...Array.from(byDateMap.values()).map((day) => day.revenue || 0)
        )
      : 0
  const maxDayGmv =
    byDateMap.size > 0
      ? Math.max(...Array.from(byDateMap.values()).map((day) => day.gmv || 0))
      : 0
  const maxHeatmapValue =
    heatmapMetric === "units"
      ? maxDayUnits
      : heatmapMetric === "orders"
        ? maxDayOrders
        : heatmapMetric === "gmv"
          ? maxDayGmv
          : maxDayRevenue
  const calendarCells: Array<{ date: string; day: number } | null> = []

  if (selectedYear && selectedMonth) {
    const firstDayWeekIndex = new Date(
      selectedYear,
      selectedMonth - 1,
      1
    ).getDay()
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate()

    for (let i = 0; i < firstDayWeekIndex; i += 1) {
      calendarCells.push(null)
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const isoDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      calendarCells.push({ date: isoDate, day })
    }
  }

  const yearCalendarMonths =
    selectedYear && !selectedMonth
      ? Array.from({ length: 12 }, (_, monthIndex) => {
          const monthNumber = monthIndex + 1
          const monthKey = `${selectedYear}-${String(monthNumber).padStart(2, "0")}`
          const firstDayWeekIndex = new Date(
            selectedYear,
            monthIndex,
            1
          ).getDay()
          const daysInMonth = new Date(selectedYear, monthNumber, 0).getDate()
          const cells: Array<{ date: string; day: number } | null> = []
          const summary = monthlyReport?.byMonth?.find(
            (item) => item.month === monthKey
          ) || {
            month: monthKey,
            orders: 0,
            units_sold: 0,
            gmv: 0,
            revenue: 0,
            cost: 0,
            profit: 0
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
            monthLabel: new Date(selectedYear, monthIndex).toLocaleString(
              "default",
              { month: "long" }
            ),
            summary,
            cells
          }
        })
      : []
  const maxMonthUnits =
    yearCalendarMonths.length > 0
      ? Math.max(
          ...yearCalendarMonths.map((month) => month.summary.units_sold || 0)
        )
      : 0
  const maxMonthOrders =
    yearCalendarMonths.length > 0
      ? Math.max(
          ...yearCalendarMonths.map((month) => month.summary.orders || 0)
        )
      : 0
  const maxMonthRevenue =
    yearCalendarMonths.length > 0
      ? Math.max(
          ...yearCalendarMonths.map((month) => month.summary.revenue || 0)
        )
      : 0
  const maxMonthGmv =
    yearCalendarMonths.length > 0
      ? Math.max(...yearCalendarMonths.map((month) => month.summary.gmv || 0))
      : 0
  const maxYearMonthValue =
    heatmapMetric === "units"
      ? maxMonthUnits
      : heatmapMetric === "orders"
        ? maxMonthOrders
        : heatmapMetric === "gmv"
          ? maxMonthGmv
          : maxMonthRevenue
  const selectedYearlyMonthBlock = selectedYearlyMonth
    ? yearCalendarMonths.find(
        (month) => month.monthNumber === selectedYearlyMonth
      ) || null
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
    return parsed.toLocaleDateString("default", {
      month: "short",
      day: "numeric"
    })
  }
  const selectedCalendarDetails = selectedCalendarDate
    ? detailedByDate[selectedCalendarDate]
    : null
  const selectedCalendarItems = selectedCalendarDetails?.items || []
  const selectedCalendarTotalGmv = selectedCalendarItems.reduce(
    (sum: number, item) => sum + item.gmv,
    0
  )
  const selectedCalendarTotalRevenue = selectedCalendarItems.reduce(
    (sum: number, item) => sum + item.revenue,
    0
  )
  const groupedChannelProductData = (
    (channelProductReport?.data || []) as ChannelProductRow[]
  ).reduce(
    (
      groups: Array<{
        sku: string
        name: string
        items: ChannelProductRow[]
      }>,
      item
    ) => {
      const lastGroup = groups[groups.length - 1]

      if (lastGroup && lastGroup.sku === item.sku) {
        lastGroup.items.push(item)
        return groups
      }

      groups.push({
        sku: item.sku,
        name: item.name,
        items: [item]
      })
      return groups
    },
    []
  )
  return (
    <div className="space-y-8">
      <PageHeader
        title="Sales performance"
        description="See what sold, what the platforms kept, and what you earned after product cost."
      />
      <section
        className="glass flex flex-wrap items-end gap-4 rounded-[22px] p-4 sm:p-5"
        aria-label="Report period"
      >
        <div className="w-full sm:mr-auto sm:w-auto">
          <p className="workspace-eyebrow">Reporting period</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-bold">
            <CalendarDays className="size-4" />
            {selectedYear
              ? `${selectedMonth ? new Date(Date.UTC(selectedYear, selectedMonth - 1, 1)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" }) + " " : ""}${selectedYear}`
              : "All recorded sales"}
          </p>
        </div>
        <div className="w-[calc(50%_-_8px)] space-y-1.5 sm:w-36">
          <Label htmlFor="year" className="text-xs">
            Year
          </Label>
          <Select
            value={selectedYear?.toString() || "all"}
            onValueChange={(value) =>
              updateFilters(
                value === "all" ? undefined : Number(value),
                value === "all" ? undefined : selectedMonth
              )
            }
          >
            <SelectTrigger id="year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {Array.from(
                new Set([
                  2024,
                  2025,
                  2026,
                  new Date().getFullYear(),
                  ...(monthlyReport?.byMonth || []).map(
                    (row: { month: string }) => Number(row.month.slice(0, 4))
                  ),
                  ...(selectedYear ? [selectedYear] : [])
                ])
              )
                .sort((a, b) => Number(b) - Number(a))
                .map((year) => (
                  <SelectItem key={String(year)} value={String(year)}>
                    {String(year)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[calc(50%_-_8px)] space-y-1.5 sm:w-44">
          <Label htmlFor="month" className="text-xs">
            Month
          </Label>
          <Select
            value={selectedMonth?.toString() || "all"}
            disabled={!canFilterMonth}
            onValueChange={(value) =>
              updateFilters(
                selectedYear,
                value === "all" ? undefined : Number(value)
              )
            }
          >
            <SelectTrigger id="month">
              <SelectValue placeholder="Choose a year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {Array.from({ length: 12 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {new Date(Date.UTC(2000, i, 1)).toLocaleString("en-GB", {
                    month: "long",
                    timeZone: "UTC"
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>
      <section
        className="glass overflow-hidden rounded-[26px]"
        aria-label="Sales earnings breakdown"
      >
        <div className="flex items-center justify-between border-b border-primary/10 px-5 py-4 sm:px-6">
          <h2 className="text-xl">From sale to earnings</h2>
          <span className="text-xs text-muted-foreground">
            Paid & shipped orders
          </span>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
          {[
            {
              label: "01 / GMV",
              value: totalGmv,
              note: "Sales before platform fees"
            },
            {
              label: "02 / Revenue",
              value: totalRevenue,
              note: `${formatCurrency(totalGmv - totalRevenue)} in platform fees`
            },
            {
              label: "03 / Product cost",
              value: totalCost,
              note: "Product cost of physical units"
            },
            {
              label: "04 / Gross profit",
              value: totalProfit,
              note: `${profitMargin.toFixed(1)}% of revenue · before operating expenses`
            }
          ].map((item, index) => (
            <div
              key={item.label}
              className={`relative min-w-0 ${index === 3 ? "rounded-2xl bg-primary/5 p-4 -m-2" : ""}`}
            >
              <p className="workspace-eyebrow">{item.label}</p>
              <p className="num mt-3 break-words font-display text-[25px] font-semibold leading-tight">
                {formatCurrency(item.value)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{item.note}</p>
              {index === 0 && (
                <ArrowRight className="absolute right-0 top-0 size-4 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      </section>
      {overviewReport.byProduct.some((row) => !row.has_complete_cost_data) && (
        <p
          role="status"
          className="rounded-2xl border border-[#c68942]/25 bg-[#fff5e8]/70 px-4 py-3 text-xs text-[#7f511e]"
        >
          Some historical unit costs are missing. Cost and gross profit may be
          incomplete for this period.
        </p>
      )}
      <section
        className="workspace-summary grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label="Sales summary"
      >
        <Stat
          label="Orders"
          value={totalOrders.toLocaleString()}
          note="Paid & shipped"
        />
        <Stat
          label="Net units sold"
          value={totalUnitsSold.toLocaleString()}
          note={`${returnedUnits} returned · ${grossUnitsSold} gross units`}
        />
        <Stat
          label="Average order GMV"
          value={formatCurrency(avgOrderValue)}
          note="Before platform fees"
        />
        <Stat
          label="Leading platform"
          value={
            channelsByGmv[0] ? (
              <span className="inline-flex items-center gap-2">
                <PlatformBadge
                  channel={channelsByGmv[0].channel as Channel}
                  size={28}
                />
                {channelLabels[channelsByGmv[0].channel]}
              </span>
            ) : (
              "—"
            )
          }
          note="Ranked by GMV in this period"
        />
      </section>

      {/* Tabbed Content */}
      <Tabs defaultValue="trends" className="space-y-4">
        <div className="w-full overflow-x-auto">
          <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-5">
            <TabsTrigger value="trends" className="flex-shrink-0">
              Trends
            </TabsTrigger>
            <TabsTrigger value="channels" className="flex-shrink-0">
              Channels
            </TabsTrigger>
            <TabsTrigger value="products" className="flex-shrink-0">
              Products
            </TabsTrigger>
            <TabsTrigger value="details" className="flex-shrink-0">
              Detailed breakdown
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex-shrink-0">
              Sales calendar
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          {trendData.length > 0 ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Sales & earnings over time</CardTitle>
                  <CardDescription>
                    {isDailyTrend
                      ? "Daily performance through selected month"
                      : "Monthly performance over time"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FinancialTrendChart
                    data={trendData}
                    xKey="month"
                    xTickFormatter={trendXAxisTickFormatter}
                    labelFormatter={trendTooltipLabelFormatter}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Units Sold Trend</CardTitle>
                  <CardDescription>
                    {isDailyTrend
                      ? "Daily product volume through selected month"
                      : "Product volumes over time"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <UnitsTrendChart
                    data={trendData}
                    xKey="month"
                    xTickFormatter={trendXAxisTickFormatter}
                    labelFormatter={trendTooltipLabelFormatter}
                  />
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

        <TabsContent value="calendar" className="space-y-4">
          {!selectedYear && (
            <div className="glass rounded-[24px] px-5 py-12 text-center">
              <CalendarDays className="mx-auto mb-3 size-6 text-muted-foreground" />
              <h2 className="text-xl">Choose a year to explore the calendar</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Then select a month or day to see the products that sold.
              </p>
            </div>
          )}
          {selectedMonth && selectedMonthKey && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle>
                      Daily Calendar View ({selectedMonthKey})
                    </CardTitle>
                    <CardDescription>
                      Orders and units per day with heatmap intensity by
                      selected metric
                    </CardDescription>
                  </div>
                  <div className="w-full md:w-[220px]">
                    <Label htmlFor="heatmap-metric">Heatmap Basis</Label>
                    <Select
                      value={heatmapMetric}
                      onValueChange={(value) =>
                        setHeatmapMetric(value as HeatmapMetric)
                      }
                    >
                      <SelectTrigger id="heatmap-metric">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="units">Units Sold</SelectItem>
                        <SelectItem value="orders">Order Count</SelectItem>
                        <SelectItem value="gmv">GMV</SelectItem>
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
                    <div
                      key={label}
                      className="px-2 py-1 text-xs font-medium text-muted-foreground"
                    >
                      {label}
                    </div>
                  ))}

                  {calendarCells.map((cell, idx) => {
                    if (!cell) {
                      return (
                        <div
                          key={`empty-${idx}`}
                          className="min-h-[84px] rounded-md border border-dashed border-muted/40"
                        />
                      )
                    }

                    const dayData = byDateMap.get(cell.date)
                    const orders = dayData?.orders || 0
                    const units = dayData?.units_sold || 0
                    const gmv = dayData?.gmv || 0
                    const revenue = dayData?.revenue || 0
                    const heatmapValue =
                      heatmapMetric === "units"
                        ? units
                        : heatmapMetric === "orders"
                          ? orders
                          : heatmapMetric === "gmv"
                            ? gmv
                            : revenue
                    const heatmapIntensity =
                      maxHeatmapValue > 0 ? heatmapValue / maxHeatmapValue : 0
                    const backgroundColor =
                      heatmapIntensity > 0
                        ? `rgba(16,185,129,${(0.12 + heatmapIntensity * 0.42).toFixed(3)})`
                        : undefined

                    return (
                      <button
                        key={cell.date}
                        type="button"
                        aria-label={formatHeatmapDayAriaLabel(
                          cell.date,
                          orders,
                          units,
                          gmv,
                          revenue
                        )}
                        className="min-h-[104px] rounded-md border p-2 text-left transition hover:border-primary/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        style={
                          backgroundColor ? { backgroundColor } : undefined
                        }
                        title={`${cell.date}: ${orders} orders, ${units} units, GMV ${formatCurrency(gmv)}, Revenue ${formatCurrency(revenue)}`}
                        onClick={() => setSelectedCalendarDate(cell.date)}
                      >
                        <div className="text-xs font-semibold">{cell.day}</div>
                        <div className="mt-2 space-y-1 text-[11px] leading-tight text-muted-foreground">
                          <div>{orders} orders</div>
                          <div>{units} units</div>
                          <div className="font-medium text-foreground">
                            GMV {formatCurrency(gmv)}
                          </div>
                          <div>Revenue {formatCurrency(revenue)}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-3 text-xs text-muted-foreground">
                  Peak {formatHeatmapMetricLabel(heatmapMetric)} in selected
                  month:{" "}
                  {formatHeatmapPeakValue(heatmapMetric, {
                    orders: maxDayOrders,
                    units: maxDayUnits,
                    gmv: maxDayGmv,
                    revenue: maxDayRevenue
                  })}
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
                      Orders and units per day across all months with heatmap
                      intensity by selected metric
                    </CardDescription>
                  </div>
                  <div className="w-full md:w-[220px]">
                    <Label htmlFor="heatmap-metric-year">Heatmap Basis</Label>
                    <Select
                      value={heatmapMetric}
                      onValueChange={(value) =>
                        setHeatmapMetric(value as HeatmapMetric)
                      }
                    >
                      <SelectTrigger id="heatmap-metric-year">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="units">Units Sold</SelectItem>
                        <SelectItem value="orders">Order Count</SelectItem>
                        <SelectItem value="gmv">GMV</SelectItem>
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
                  {yearCalendarMonths.map((monthBlock) =>
                    (() => {
                      const monthValue =
                        heatmapMetric === "units"
                          ? monthBlock.summary.units_sold
                          : heatmapMetric === "orders"
                            ? monthBlock.summary.orders
                            : heatmapMetric === "gmv"
                              ? monthBlock.summary.gmv
                              : monthBlock.summary.revenue
                      const monthIntensity =
                        maxYearMonthValue > 0
                          ? monthValue / maxYearMonthValue
                          : 0
                      const backgroundColor =
                        monthIntensity > 0
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
                            gmv: monthBlock.summary.gmv,
                            revenue: monthBlock.summary.revenue
                          })}
                          className="rounded-lg border bg-card p-3 text-left transition hover:border-primary/60 hover:shadow-sm"
                          style={
                            backgroundColor ? { backgroundColor } : undefined
                          }
                          onClick={() => {
                            setSelectedYearlyMonth(monthBlock.monthNumber)
                            setSelectedYearlyCalendarDate(null)
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold">
                              {monthBlock.monthLabel}
                            </h3>
                            <span className="text-[10px] text-muted-foreground">
                              {selectedYear}-
                              {String(monthBlock.monthNumber).padStart(2, "0")}
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                            <div>
                              <div className="text-[10px] text-muted-foreground">
                                Orders
                              </div>
                              <div className="font-semibold leading-tight">
                                {monthBlock.summary.orders}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted-foreground">
                                Units
                              </div>
                              <div className="font-semibold leading-tight">
                                {monthBlock.summary.units_sold}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted-foreground">
                                GMV
                              </div>
                              <div className="text-xs font-semibold leading-tight tabular-nums">
                                {formatCurrency(monthBlock.summary.gmv)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted-foreground">
                                Revenue
                              </div>
                              <div className="text-xs font-semibold leading-tight tabular-nums">
                                {formatCurrency(monthBlock.summary.revenue)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted-foreground">
                                Profit
                              </div>
                              <div
                                className={`text-xs font-semibold leading-tight ${
                                  monthBlock.summary.profit >= 0
                                    ? "text-success"
                                    : "text-destructive"
                                }`}
                              >
                                {formatCurrency(monthBlock.summary.profit)}
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })()
                  )}
                </div>

                <div className="mt-3 text-xs text-muted-foreground">
                  Peak {formatHeatmapMetricLabel(heatmapMetric)} in selected
                  year:{" "}
                  {formatHeatmapPeakValue(heatmapMetric, {
                    orders: maxDayOrders,
                    units: maxDayUnits,
                    gmv: maxDayGmv,
                    revenue: maxDayRevenue
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Channels Tab */}
        <TabsContent value="channels" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <Card>
              <CardHeader>
                <CardTitle>Financial Performance by Channel</CardTitle>
                <CardDescription>
                  Ranked by GMV with Revenue, Cost, and Profit
                </CardDescription>
              </CardHeader>
              <CardContent>
                {channelsByGmv.length > 0 ? (
                  <FinancialComparisonChart
                    data={channelsByGmv}
                    categoryKey="channel"
                    categoryFormatter={(value) => channelLabels[value] || value}
                    height={340}
                  />
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
                {channelsByGmv.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={channelsByGmv}
                          cx="50%"
                          cy="45%"
                          labelLine={false}
                          label={false}
                          outerRadius={88}
                          fill="#8884d8"
                          dataKey="orders"
                        >
                          {channelsByGmv.map((entry, index: number) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={
                                channelColors[entry.channel] ||
                                COLORS[index % COLORS.length]
                              }
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, _name, item) => [
                            `${Number(value).toLocaleString()} orders`,
                            channelLabels[String(item.payload.channel)] ||
                              String(item.payload.channel)
                          ]}
                          contentStyle={{
                            backgroundColor: "var(--card)",
                            border: "1px solid var(--border)"
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                      {channelsByGmv.map((entry) => (
                        <div
                          key={entry.channel}
                          className="flex items-center gap-1.5"
                        >
                          <PlatformBadge
                            channel={entry.channel as Channel}
                            size={22}
                          />
                          <span>
                            {channelLabels[entry.channel] || entry.channel}:{" "}
                            {entry.orders}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
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
              {overviewReport?.byChannel &&
              overviewReport.byChannel.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">GMV</TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center">
                          Revenue
                          <InfoTooltip
                            content="Revenue calculation"
                            formula="GMV - Allocated Channel Fees"
                          />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center">
                          Cost
                          <InfoTooltip
                            content="Cost calculation (COGS)"
                            formula="Historical unit cost × physical units"
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
                      <TableHead className="text-right">Fees</TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center">
                          Avg Order
                          <InfoTooltip
                            content="Average Order Value"
                            formula="Total GMV ÷ Number of Orders"
                          />
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {channelsByGmv.map((channel) => (
                      <TableRow key={channel.channel}>
                        <TableCell className="font-medium">
                          <PlatformBadge
                            channel={channel.channel as Channel}
                            size={26}
                            showLabel
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {channel.orders}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(channel.gmv)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(channel.revenue)}
                        </TableCell>
                        <TableCell className="text-right text-[#b96816]">
                          {formatCurrency(channel.cost)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <span
                            className={
                              channel.profit >= 0
                                ? "text-success"
                                : "text-destructive"
                            }
                          >
                            {formatCurrency(channel.profit)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-destructive">
                          {formatCurrency(channel.fees)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(channel.gmv / channel.orders)}
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
          <Card>
            <CardHeader>
              <CardTitle>Financial Performance by Product</CardTitle>
              <CardDescription>
                Ranked by GMV with Revenue, Cost, and Profit
              </CardDescription>
            </CardHeader>
            <CardContent>
              {productsByGmv.length > 0 ? (
                <FinancialComparisonChart
                  data={productsByGmv}
                  categoryKey="name"
                  height={Math.min(
                    620,
                    Math.max(360, productsByGmv.length * 76)
                  )}
                />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No product data
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Product Performance Details</CardTitle>
              <CardDescription>Comprehensive product metrics</CardDescription>
            </CardHeader>
            <CardContent>
              {overviewReport?.byProduct &&
              overviewReport.byProduct.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">GMV</TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center">
                          Revenue
                          <InfoTooltip
                            content="Revenue calculation"
                            formula="GMV - Allocated Channel Fees"
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
                      <TableHead className="text-right">Units Sold</TableHead>
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
                    {productsByGmv.map((product) => {
                      const returnedForSku = returnedBySku.get(product.sku) || 0
                      const margin =
                        product.revenue > 0
                          ? (product.profit / product.revenue) * 100
                          : 0

                      return (
                        <TableRow key={product.sku}>
                          <TableCell className="font-mono text-sm">
                            {product.sku}
                          </TableCell>
                          <TableCell className="font-medium">
                            {product.name}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(product.gmv)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(product.revenue)}
                          </TableCell>
                          <TableCell className="text-right text-destructive">
                            {formatCurrency(product.cost)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            <span
                              className={
                                product.profit >= 0
                                  ? "text-success"
                                  : "text-destructive"
                              }
                            >
                              {formatCurrency(product.profit)}
                            </span>
                          </TableCell>
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
                            <span
                              className={
                                margin >= 0
                                  ? "text-success"
                                  : "text-destructive"
                              }
                            >
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
              <CardDescription>
                Sales breakdown by channel and product
              </CardDescription>
            </CardHeader>
            <CardContent>
              {channelProductReport?.data &&
              channelProductReport.data.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Channel</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Pack</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">GMV</TableHead>
                        <TableHead className="text-right">
                          <span className="inline-flex items-center">
                            Revenue
                            <InfoTooltip
                              content="Revenue calculation"
                              formula="GMV - Allocated Channel Fees"
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
                          <TableRow
                            key={`${group.sku}-group`}
                            className="bg-muted/40 hover:bg-muted/40"
                          >
                            <TableCell colSpan={8} className="py-3">
                              <div className="flex items-center justify-between gap-4">
                                <div className="font-semibold">
                                  {group.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {group.items.length} channel
                                  {group.items.length > 1 ? "s" : ""}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                          {group.items.map((item, idx: number) => {
                            const margin =
                              item.revenue > 0
                                ? (item.profit / item.revenue) * 100
                                : 0

                            return (
                              <TableRow
                                key={`${item.channel}-${item.sku}-${idx}`}
                              >
                                <TableCell className="font-medium">
                                  {channelLabels[item.channel]}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {item.name}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {getPackSizeLabel(item.pack_size)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {item.units_sold}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(item.gmv)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(item.revenue)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <span
                                    className={
                                      item.profit >= 0
                                        ? "text-success"
                                        : "text-destructive"
                                    }
                                  >
                                    {formatCurrency(item.profit)}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span
                                    className={
                                      margin >= 0
                                        ? "text-success"
                                        : "text-destructive"
                                    }
                                  >
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
                <CardDescription>
                  Month-by-month performance breakdown
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">GMV</TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center">
                          Revenue
                          <InfoTooltip
                            content="Revenue calculation"
                            formula="GMV - Allocated Channel Fees"
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
                    {monthlyReport.byMonth.map((month) => {
                      const margin =
                        month.revenue > 0
                          ? (month.profit / month.revenue) * 100
                          : 0

                      return (
                        <TableRow key={month.month}>
                          <TableCell className="font-medium">
                            {month.month}
                          </TableCell>
                          <TableCell className="text-right">
                            {month.orders}
                          </TableCell>
                          <TableCell className="text-right">
                            {month.units_sold}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(month.gmv)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(month.revenue)}
                          </TableCell>
                          <TableCell className="text-right text-destructive">
                            {formatCurrency(month.cost)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={
                                month.profit >= 0
                                  ? "text-success"
                                  : "text-destructive"
                              }
                            >
                              {formatCurrency(month.profit)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={
                                margin >= 0
                                  ? "text-success"
                                  : "text-destructive"
                              }
                            >
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
      </Tabs>

      <Dialog
        open={Boolean(selectedCalendarDate)}
        onOpenChange={(open) => !open && setSelectedCalendarDate(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Daily Item Details</DialogTitle>
            <DialogDescription>{selectedCalendarDate || "-"}</DialogDescription>
          </DialogHeader>

          <div className="text-sm text-muted-foreground">
            Total GMV:{" "}
            <span className="font-semibold text-foreground">
              {formatCurrency(selectedCalendarTotalGmv)}
            </span>
            <span className="mx-2">·</span>
            Total Revenue:{" "}
            <span className="font-semibold text-foreground">
              {formatCurrency(selectedCalendarTotalRevenue)}
            </span>
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
                  <TableHead className="text-right">GMV</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedCalendarItems.map((item) => (
                  <TableRow key={item.sku}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(item.gmv)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(item.revenue)}
                    </TableCell>
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
              Daily orders, units, GMV, and revenue for the selected month.
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
                  <div
                    key={`modal-${label}`}
                    className="px-2 py-1 text-xs font-medium text-muted-foreground"
                  >
                    {label}
                  </div>
                ))}

                {selectedYearlyMonthDetails.map((cell, idx) => {
                  if (!cell) {
                    return (
                      <div
                        key={`modal-empty-${idx}`}
                        className="min-h-[84px] rounded-md border border-dashed border-muted/40"
                      />
                    )
                  }

                  const dayData = byDateMap.get(cell.date)
                  const orders = dayData?.orders || 0
                  const units = dayData?.units_sold || 0
                  const gmv = dayData?.gmv || 0
                  const revenue = dayData?.revenue || 0
                  const heatmapValue =
                    heatmapMetric === "units"
                      ? units
                      : heatmapMetric === "orders"
                        ? orders
                        : heatmapMetric === "gmv"
                          ? gmv
                          : revenue
                  const heatmapIntensity =
                    maxHeatmapValue > 0 ? heatmapValue / maxHeatmapValue : 0
                  const backgroundColor =
                    heatmapIntensity > 0
                      ? `rgba(16,185,129,${(0.12 + heatmapIntensity * 0.42).toFixed(3)})`
                      : undefined

                  return (
                    <button
                      key={cell.date}
                      type="button"
                      aria-label={formatHeatmapDayAriaLabel(
                        cell.date,
                        orders,
                        units,
                        gmv,
                        revenue
                      )}
                      className="min-h-[104px] rounded-md border p-2 text-left transition hover:border-primary/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      style={backgroundColor ? { backgroundColor } : undefined}
                      title={`${cell.date}: ${orders} orders, ${units} units, GMV ${formatCurrency(gmv)}, Revenue ${formatCurrency(revenue)}`}
                      onClick={() => setSelectedYearlyCalendarDate(cell.date)}
                    >
                      <div className="text-xs font-semibold">{cell.day}</div>
                      <div className="mt-2 space-y-1 text-[11px] leading-tight text-muted-foreground">
                        <div>{orders} orders</div>
                        <div>{units} units</div>
                        <div className="font-medium text-foreground">
                          GMV {formatCurrency(gmv)}
                        </div>
                        <div>Revenue {formatCurrency(revenue)}</div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {selectedYearlyDayDetails ? (
                <div className="rounded-lg border p-4">
                  <div className="mb-3">
                    <h3 className="font-semibold">
                      {selectedYearlyCalendarDate}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedYearlyDayDetails.orders} orders •{" "}
                      {selectedYearlyDayDetails.units} units • GMV{" "}
                      {formatCurrency(selectedYearlyDayDetails.gmv)} • Revenue{" "}
                      {formatCurrency(selectedYearlyDayDetails.revenue)}
                    </p>
                  </div>

                  {selectedYearlyDayDetails.items.length > 0 ? (
                    <div className="space-y-2">
                      {selectedYearlyDayDetails.items.map((item) => (
                        <div
                          key={`${selectedYearlyCalendarDate}-${item.sku}`}
                          className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
                        >
                          <div>
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.sku}
                            </div>
                          </div>
                          <div className="text-right">
                            <div>{item.quantity} units</div>
                            <div className="text-xs text-muted-foreground">
                              GMV {formatCurrency(item.gmv)} · Revenue{" "}
                              {formatCurrency(item.revenue)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No item details for this day.
                    </div>
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

function formatHeatmapDayAriaLabel(
  date: string,
  orders: number,
  units: number,
  gmv: number,
  revenue: number
) {
  return `Open details for ${date}: ${orders} orders, ${units} units, ${formatCurrency(gmv)} GMV, ${formatCurrency(revenue)} revenue`
}

function formatHeatmapMonthAriaLabel(input: {
  label: string
  year: number | undefined
  orders: number
  units: number
  gmv: number
  revenue: number
}) {
  return `Open ${input.label} ${input.year ?? ""} details: ${input.orders} orders, ${input.units} units, ${formatCurrency(input.gmv)} GMV, ${formatCurrency(input.revenue)} revenue`.trim()
}

function formatHeatmapMetricLabel(metric: HeatmapMetric) {
  if (metric === "units") return "units sold"
  if (metric === "orders") return "order count"
  if (metric === "gmv") return "GMV"
  return "Revenue"
}

function formatHeatmapPeakValue(
  metric: HeatmapMetric,
  values: { orders: number; units: number; gmv: number; revenue: number }
) {
  if (metric === "units") return `${values.units.toLocaleString()} units`
  if (metric === "orders") return `${values.orders.toLocaleString()} orders`
  if (metric === "gmv") return formatCurrency(values.gmv)
  return formatCurrency(values.revenue)
}
