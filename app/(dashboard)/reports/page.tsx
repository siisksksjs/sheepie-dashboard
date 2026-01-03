"use client"

import { useState, useEffect } from "react"
import { getMonthlySalesReport, getChannelProductReport, getSalesReport } from "@/lib/actions/orders"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { formatCurrency } from "@/lib/utils"
import { TrendingUp, DollarSign, Package, ShoppingBag, Calendar } from "lucide-react"

const channelLabels: Record<string, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  tiktok: "TikTok",
  offline: "Offline",
}

const monthLabels: Record<number, string> = {
  1: "January", 2: "February", 3: "March", 4: "April",
  5: "May", 6: "June", 7: "July", 8: "August",
  9: "September", 10: "October", 11: "November", 12: "December",
}

export default function ReportsPage() {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const [selectedYear, setSelectedYear] = useState<number | undefined>(currentYear)
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(undefined)
  const [reportType, setReportType] = useState<"overview" | "monthly" | "channel-product">("overview")

  const [overviewReport, setOverviewReport] = useState<any>(null)
  const [monthlyReport, setMonthlyReport] = useState<any>(null)
  const [channelProductReport, setChannelProductReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReports()
  }, [selectedYear, selectedMonth, reportType])

  const loadReports = async () => {
    setLoading(true)

    if (reportType === "overview") {
      const data = await getSalesReport()
      setOverviewReport(data)
    } else if (reportType === "monthly") {
      const data = await getMonthlySalesReport(selectedYear, selectedMonth)
      setMonthlyReport(data)
    } else if (reportType === "channel-product") {
      const data = await getChannelProductReport(selectedYear, selectedMonth)
      setChannelProductReport(data)
    }

    setLoading(false)
  }

  const totalRevenue = overviewReport?.byChannel.reduce((sum: number, ch: any) => sum + ch.revenue, 0) || 0
  const totalFees = overviewReport?.byChannel.reduce((sum: number, ch: any) => sum + ch.fees, 0) || 0
  const totalProfit = overviewReport?.byProduct.reduce((sum: number, p: any) => sum + p.profit, 0) || 0
  const totalUnitsSold = overviewReport?.byProduct.reduce((sum: number, p: any) => sum + p.units_sold, 0) || 0

  return (
    <div>
      <h1 className="text-3xl font-display font-bold mb-2">Sales Reports</h1>
      <p className="text-muted-foreground mb-8">
        Revenue and profit analytics across channels and products
      </p>

      {/* Filters */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Select time period and report type</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reportType">Report Type</Label>
              <Select value={reportType} onValueChange={(value: any) => setReportType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="overview">Overview (All Time)</SelectItem>
                  <SelectItem value="monthly">Monthly Breakdown</SelectItem>
                  <SelectItem value="channel-product">Channel × Product</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Select
                value={selectedYear?.toString()}
                onValueChange={(value) => setSelectedYear(value === "all" ? undefined : parseInt(value))}
              >
                <SelectTrigger>
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
                value={selectedMonth?.toString()}
                onValueChange={(value) => setSelectedMonth(value === "all" ? undefined : parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Months" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <SelectItem key={month} value={month.toString()}>
                      {monthLabels[month]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {selectedYear && selectedMonth
              ? `Showing data for ${monthLabels[selectedMonth]} ${selectedYear}`
              : selectedYear
              ? `Showing data for ${selectedYear}`
              : "Showing all-time data"}
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading reports...</div>
      ) : (
        <>
          {/* Overview Report */}
          {reportType === "overview" && overviewReport && (
            <>
              {/* Summary Stats */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Revenue
                    </CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{formatCurrency(totalRevenue)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      From paid/shipped orders
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Profit
                    </CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-3xl font-bold ${totalProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(totalProfit)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Revenue minus costs
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Fees
                    </CardTitle>
                    <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-destructive">
                      {formatCurrency(totalFees)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Channel fees
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Units Sold
                    </CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{totalUnitsSold}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Total products sold
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Sales by Product */}
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle>Sales by Product</CardTitle>
                  <CardDescription>
                    Performance breakdown for each product
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {overviewReport.byProduct.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No sales data available
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Units Sold</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Profit</TableHead>
                          <TableHead className="text-right">Margin %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overviewReport.byProduct.map((product: any) => {
                          const margin = product.revenue > 0
                            ? ((product.profit / product.revenue) * 100)
                            : 0

                          return (
                            <TableRow key={product.sku}>
                              <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                              <TableCell>
                                <div className="font-medium">{product.name}</div>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {product.units_sold}
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
                  )}
                </CardContent>
              </Card>

              {/* Sales by Channel */}
              <Card>
                <CardHeader>
                  <CardTitle>Sales by Channel</CardTitle>
                  <CardDescription>
                    Revenue breakdown across sales channels
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {overviewReport.byChannel.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No sales data available
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Channel</TableHead>
                          <TableHead className="text-right">Orders</TableHead>
                          <TableHead className="text-right">Gross Revenue</TableHead>
                          <TableHead className="text-right">Channel Fees</TableHead>
                          <TableHead className="text-right">Net Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overviewReport.byChannel.map((channel: any) => (
                          <TableRow key={channel.channel}>
                            <TableCell className="font-medium">
                              {channelLabels[channel.channel]}
                            </TableCell>
                            <TableCell className="text-right">
                              {channel.orders}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(channel.revenue)}
                            </TableCell>
                            <TableCell className="text-right text-destructive">
                              -{formatCurrency(channel.fees)}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(channel.net_revenue)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Monthly Report */}
          {reportType === "monthly" && monthlyReport && (
            <>
              {/* Monthly Trends */}
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle>Monthly Sales Trends</CardTitle>
                  <CardDescription>
                    Sales performance over time
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {monthlyReport.byMonth.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No sales data for selected period
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right">Orders</TableHead>
                          <TableHead className="text-right">Units Sold</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Profit</TableHead>
                          <TableHead className="text-right">Margin %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthlyReport.byMonth.map((month: any) => {
                          const margin = month.revenue > 0
                            ? ((month.profit / month.revenue) * 100)
                            : 0

                          return (
                            <TableRow key={month.month}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4 text-muted-foreground" />
                                  {month.month}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{month.orders}</TableCell>
                              <TableCell className="text-right font-medium">
                                {month.units_sold}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(month.revenue)}
                              </TableCell>
                              <TableCell className="text-right text-destructive">
                                {formatCurrency(month.cost)}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
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
                  )}
                </CardContent>
              </Card>

              {/* Products for selected period */}
              <Card>
                <CardHeader>
                  <CardTitle>Product Performance</CardTitle>
                  <CardDescription>
                    Product sales for selected period
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {monthlyReport.byProduct.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No product sales for selected period
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Units Sold</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Profit</TableHead>
                          <TableHead className="text-right">Margin %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthlyReport.byProduct.map((product: any) => {
                          const margin = product.revenue > 0
                            ? ((product.profit / product.revenue) * 100)
                            : 0

                          return (
                            <TableRow key={product.sku}>
                              <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                              <TableCell className="font-medium">{product.name}</TableCell>
                              <TableCell className="text-right font-medium">
                                {product.units_sold}
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
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Channel × Product Report */}
          {reportType === "channel-product" && channelProductReport && (
            <Card>
              <CardHeader>
                <CardTitle>Channel × Product Analysis</CardTitle>
                <CardDescription>
                  Sales breakdown by channel and product
                </CardDescription>
              </CardHeader>
              <CardContent>
                {channelProductReport.data.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No sales data for selected period
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Channel</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Units Sold</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Profit</TableHead>
                        <TableHead className="text-right">Margin %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {channelProductReport.data.map((item: any, idx: number) => {
                        const margin = item.revenue > 0
                          ? ((item.profit / item.revenue) * 100)
                          : 0

                        return (
                          <TableRow key={`${item.channel}-${item.sku}-${idx}`}>
                            <TableCell className="font-medium">
                              {channelLabels[item.channel]}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                            <TableCell>{item.name}</TableCell>
                            <TableCell className="text-right font-medium">
                              {item.units_sold}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(item.revenue)}
                            </TableCell>
                            <TableCell className="text-right text-destructive">
                              {formatCurrency(item.cost)}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
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
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
