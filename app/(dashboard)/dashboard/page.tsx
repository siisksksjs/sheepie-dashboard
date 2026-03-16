import { getStockOnHand } from "@/lib/actions/inventory"
import { getSalesReport, getReturnSummary, getReorderRecommendations, getDailySalesSnippet } from "@/lib/actions/orders"
import { getAllBundlesWithAvailability } from "@/lib/actions/bundles"
import { getProjectedRevenue } from "@/lib/actions/products"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { formatCurrency } from "@/lib/utils"
import { Package, AlertTriangle, TrendingUp, Box, DollarSign } from "lucide-react"
import Link from "next/link"
import { DateFilter } from "./date-filter"

const channelLabels: Record<string, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  tiktok: "TikTok",
  offline: "Offline",
}

type SearchParams = Promise<{ date?: string }>

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const today = new Date().toISOString().split("T")[0]
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  const selectedDate = params.date && datePattern.test(params.date) ? params.date : today

  const [
    stockData,
    salesReport,
    returnSummary,
    reorderRecommendations,
    dailySales,
    bundles,
    projectedRevenue,
  ] = await Promise.all([
    getStockOnHand(),
    getSalesReport(),
    getReturnSummary(),
    getReorderRecommendations(),
    getDailySalesSnippet(selectedDate),
    getAllBundlesWithAvailability(),
    getProjectedRevenue(),
  ])
  const stats = {
    totalProducts: stockData.length,
    lowStockItems: stockData.filter((item) => item.is_low_stock).length,
    totalStock: stockData.reduce((sum, item) => sum + item.current_stock, 0),
  }
  const paidOrdersCount = salesReport.byChannel.reduce((sum, channel) => sum + channel.orders, 0)
  const totalUnitsSold = salesReport.byProduct.reduce((sum, product) => sum + product.units_sold, 0)
  const returnedUnits = returnSummary.returnedUnits || 0
  const grossUnitsSold = totalUnitsSold + returnedUnits
  const returnedBySku = new Map<string, number>(
    (returnSummary.bySku || []).map((item: any) => [item.sku, item.units])
  )

  // Build dynamic reorder points from sales velocity (use max for safety)
  const dynamicReorderPoints = new Map<string, { min: number; max: number }>(
    reorderRecommendations.recommendations.map((rec: any) => [
      rec.sku,
      { min: rec.reorderMin, max: rec.reorderMax }
    ])
  )

  // Get low stock items based on dynamic reorder points from Restock Guidance
  const lowStockItems = stockData
    .filter(item => item.status === 'active' && !item.is_bundle)
    .filter(item => {
      const dynamicPoint = dynamicReorderPoints.get(item.sku)
      if (dynamicPoint) {
        // Use dynamic reorder point (max) based on sales velocity
        return item.current_stock <= dynamicPoint.max
      }
      // Fall back to static reorder_point for products not in guidance
      return item.is_low_stock
    })
    .map(item => ({
      ...item,
      dynamic_reorder_point: dynamicReorderPoints.get(item.sku)
    }))

  // Get low stock bundles
  const lowStockBundles = bundles.filter(b => b.is_low_stock)

  return (
    <div>
      <h1 className="text-3xl font-display font-bold mb-2">Dashboard</h1>
      <p className="text-muted-foreground mb-8">
        Overview of your inventory and orders
      </p>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Products
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalProducts}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Active SKUs in catalog
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Low Stock Items
            </CardTitle>
            <AlertTriangle className={`h-4 w-4 ${lowStockItems.length > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${lowStockItems.length > 0 ? 'text-warning' : ''}`}>
              {lowStockItems.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Based on sales velocity
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Stock Units
            </CardTitle>
            <Box className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalStock}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Units on hand
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Revenue
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatCurrency(salesReport.byChannel.reduce((sum, ch) => sum + ch.revenue, 0))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              From {paidOrdersCount} paid or shipped orders
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Orders</CardTitle>
            <CardDescription>
              Quick order action and daily sales by selected date
            </CardDescription>
          </div>
          <Link href="/orders/new">
            <Button>Create Order</Button>
          </Link>
        </CardHeader>
        <CardContent>
          <DateFilter selectedDate={selectedDate} />

          <div className="mb-4 text-sm text-muted-foreground">
            {dailySales.totalOrders} orders and {dailySales.totalUnits} units sold on {dailySales.date}
          </div>
          <div className="mb-4 text-sm">
            Daily Total Revenue: <span className="font-semibold">{formatCurrency(dailySales.totalRevenue)}</span>
          </div>
          {dailySales.items.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No paid or shipped sales recorded for this day.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead>Platform</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailySales.items.map((item) => (
                  <TableRow key={`${item.sku}-${item.platform}`}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell className="text-right font-semibold">{item.quantity}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(item.revenue)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {channelLabels[item.platform] || item.platform}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Projected Revenue Card */}
      <Card className="mb-8 border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <CardTitle>
              Projected Revenue from Current Stock
              {returnedUnits > 0 && (
                <InfoTooltip
                  content="Net units exclude returns. Gross includes returns."
                  formula={`Net: ${totalUnitsSold} · Returned: ${returnedUnits} · Gross: ${grossUnitsSold}`}
                />
              )}
            </CardTitle>
          </div>
          <CardDescription>
            Potential revenue if all current stock sells at historical average prices
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="text-4xl font-bold text-primary">
              {formatCurrency(projectedRevenue.total_projected_revenue)}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Based on {stats.totalStock} units in stock across {stats.totalProducts} products
            </p>
          </div>

          {projectedRevenue.products_projection.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Products by Projected Revenue</h4>
              <div className="space-y-3">
                {projectedRevenue.products_projection.filter(p => p.current_stock > 0).map((product) => (
                    <div key={product.sku} className="flex items-center justify-between p-3 bg-card rounded-lg border">
                      <div className="flex-1">
                        <div className="font-medium">{product.name}</div>
                        {product.variant && (
                          <div className="text-sm text-muted-foreground">{product.variant}</div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">
                          {product.current_stock} units × {formatCurrency(product.avg_revenue_per_unit)}/unit avg
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-primary">
                          {formatCurrency(product.projected_revenue)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {product.total_units_sold > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              {product.total_units_sold} sold all time
                              {(returnedBySku.get(product.sku) || 0) > 0 ? (
                                <InfoTooltip
                                  content="Net units exclude returns. Gross includes returns."
                                  formula={`Net: ${product.total_units_sold} · Returned: ${returnedBySku.get(product.sku)} · Gross: ${product.total_units_sold + (returnedBySku.get(product.sku) || 0)}`}
                                />
                              ) : null}
                            </span>
                          ) : (
                            'No sales yet'
                          )}
                        </div>
                      </div>
                    </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Restock Guidance</CardTitle>
          <CardDescription>
            Based on average daily sales since {reorderRecommendations.startDate.toISOString().slice(0, 10)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Avg/Day</TableHead>
                <TableHead className="text-right">Lead+Buffer</TableHead>
                <TableHead className="text-right">Reorder Point</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reorderRecommendations.recommendations.map((rec) => (
                <TableRow key={`${rec.sku}-${rec.mode}`}>
                  <TableCell className="font-mono text-sm">{rec.sku}</TableCell>
                  <TableCell className="font-medium">{rec.name}</TableCell>
                  <TableCell>{rec.mode}</TableCell>
                  <TableCell className="text-right">{rec.avgDaily.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {rec.leadMin + rec.buffer}-{rec.leadMax + rec.buffer} days
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {rec.reorderMin}-{rec.reorderMax} units
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Low Stock Alerts */}
      {(lowStockItems.length > 0 || lowStockBundles.length > 0) && (
        <div className="space-y-4 mb-8">
          {/* Regular Products Low Stock */}
          {lowStockItems.length > 0 && (
            <Card className="border-warning/50 bg-warning/5">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  <CardTitle>Low Stock Alert - Products</CardTitle>
                </div>
                <CardDescription>
                  Based on sales velocity from Restock Guidance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Current Stock</TableHead>
                      <TableHead className="text-right">Reorder Point</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowStockItems.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                        <TableCell>
                          <div className="font-medium">{item.name}</div>
                          {item.variant && (
                            <div className="text-sm text-muted-foreground">{item.variant}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-semibold text-warning">
                            {item.current_stock}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {item.dynamic_reorder_point
                            ? `${item.dynamic_reorder_point.min}-${item.dynamic_reorder_point.max}`
                            : item.reorder_point}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Bundles Low Stock */}
          {lowStockBundles.length > 0 && (
            <Card className="border-warning/50 bg-warning/5">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  <CardTitle>Low Stock Alert - Bundles</CardTitle>
                </div>
                <CardDescription>
                  These bundles have low availability due to component stock levels
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Bundle</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead className="text-right">Reorder Point</TableHead>
                      <TableHead>Components</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowStockBundles.map((bundle) => (
                      <TableRow key={bundle.id}>
                        <TableCell className="font-mono text-sm">{bundle.sku}</TableCell>
                        <TableCell>
                          <div className="font-medium">{bundle.name}</div>
                          {bundle.variant && (
                            <div className="text-sm text-muted-foreground">{bundle.variant}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-semibold text-warning">
                            {bundle.available_stock}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {bundle.reorder_point}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {bundle.compositions.length} components
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Current Stock Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Stock Overview</CardTitle>
          <CardDescription>
            Current inventory levels (bundles calculated from components)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stockData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No products in inventory. Add products to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Current Stock</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockData.filter(item => !item.is_bundle).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      {item.variant && (
                        <div className="text-sm text-muted-foreground">{item.variant}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          item.is_low_stock
                            ? "font-semibold text-warning"
                            : "text-muted-foreground"
                        }
                      >
                        {item.current_stock}
                      </span>
                    </TableCell>
                    <TableCell>
                      {item.status === 'active' ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="outline">Discontinued</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Bundles with calculated availability */}
                {bundles.map((bundle) => (
                  <TableRow key={bundle.id} className="bg-muted/30">
                    <TableCell className="font-mono text-sm">{bundle.sku}</TableCell>
                    <TableCell>
                      <div className="font-medium">{bundle.name}</div>
                      <div className="text-xs text-muted-foreground">Bundle ({bundle.compositions?.length || 0} components)</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={bundle.is_low_stock ? "font-semibold text-warning" : "text-muted-foreground"}>
                        {bundle.available_stock}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">Bundle</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
