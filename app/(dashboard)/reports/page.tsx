"use client"

import { useState, useEffect } from "react"
import { getMonthlySalesReport, getChannelProductReport, getSalesReport, getReturnSummary } from "@/lib/actions/orders"
import { getAdPerformanceSummary } from "@/lib/actions/ad-campaigns"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"
import { TrendingUp, DollarSign, Package, ShoppingBag, ArrowUpRight, Target } from "lucide-react"
import Link from "next/link"
import { InfoTooltip } from "@/components/ui/info-tooltip"
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

export default function ReportsPage() {
  const currentYear = new Date().getFullYear()

  const [selectedYear, setSelectedYear] = useState<number | undefined>(currentYear)
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(undefined)

  const [overviewReport, setOverviewReport] = useState<any>(null)
  const [monthlyReport, setMonthlyReport] = useState<any>(null)
  const [channelProductReport, setChannelProductReport] = useState<any>(null)
  const [adPerformance, setAdPerformance] = useState<any>(null)
  const [returnSummary, setReturnSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAllReports()
  }, [selectedYear, selectedMonth])

  const loadAllReports = async () => {
    setLoading(true)

    const [overview, monthly, channelProduct, adPerf, returns] = await Promise.all([
      getSalesReport(selectedYear, selectedMonth),
      getMonthlySalesReport(selectedYear, selectedMonth),
      getChannelProductReport(selectedYear, selectedMonth),
      getAdPerformanceSummary(),
      getReturnSummary(selectedYear, selectedMonth),
    ])

    setOverviewReport(overview)
    setMonthlyReport(monthly)
    setChannelProductReport(channelProduct)
    setAdPerformance(adPerf)
    setReturnSummary(returns)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading comprehensive reports...</p>
      </div>
    )
  }

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
                value={selectedMonth?.toString() || "all"}
                onValueChange={(value) => setSelectedMonth(value === "all" ? undefined : parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Months" />
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
          {monthlyReport?.byMonth && monthlyReport.byMonth.length > 0 ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Revenue & Profit Trends</CardTitle>
                  <CardDescription>Monthly performance over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={monthlyReport.byMonth}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
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
                  <CardDescription>Product volumes over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={monthlyReport.byMonth}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip
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
                            formula="cost_per_unit × quantity"
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
                      {channelProductReport.data.map((item: any, idx: number) => {
                        const margin = item.revenue > 0
                          ? ((item.profit / item.revenue) * 100)
                          : 0

                        return (
                          <TableRow key={`${item.channel}-${item.sku}-${idx}`}>
                            <TableCell className="font-medium">
                              {channelLabels[item.channel]}
                            </TableCell>
                            <TableCell>{item.name}</TableCell>
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
                            formula="cost_per_unit × quantity"
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
    </div>
  )
}
