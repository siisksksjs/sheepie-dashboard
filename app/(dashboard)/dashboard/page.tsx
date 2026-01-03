import { getStockOnHand, getDashboardStats } from "@/lib/actions/inventory"
import { getOrderStats, getSalesReport } from "@/lib/actions/orders"
import { getAllBundlesWithAvailability } from "@/lib/actions/bundles"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { Package, AlertTriangle, TrendingUp, Box } from "lucide-react"

export default async function DashboardPage() {
  const stats = await getDashboardStats()
  const stockData = await getStockOnHand()
  const orderStats = await getOrderStats()
  const salesReport = await getSalesReport()
  const bundles = await getAllBundlesWithAvailability()

  // Get low stock items (regular products)
  const lowStockItems = stockData.filter(item => item.is_low_stock && item.status === 'active' && !item.is_bundle)

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
            <AlertTriangle className={`h-4 w-4 ${stats.lowStockItems > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${stats.lowStockItems > 0 ? 'text-warning' : ''}`}>
              {stats.lowStockItems}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Below reorder point
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
              From {orderStats.paidOrders} paid orders
            </p>
          </CardContent>
        </Card>
      </div>

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
                  The following products are at or below their reorder point
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
                      <TableHead className="text-right">Cost/Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowStockItems.map((item) => (
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
                          {item.reorder_point}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(item.cost_per_unit)}
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
            Current inventory levels across all products
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
                  <TableHead className="text-right">Reorder Point</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockData.map((item) => (
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
                    <TableCell className="text-right text-muted-foreground">
                      {item.reorder_point}
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
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
