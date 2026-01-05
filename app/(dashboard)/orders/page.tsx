import { getOrders } from "@/lib/actions/orders"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Plus, ShoppingCart, Eye } from "lucide-react"
import Link from "next/link"

const statusBadges: Record<string, "default" | "success" | "destructive" | "outline"> = {
  paid: "success",
  shipped: "default",
  cancelled: "destructive",
  returned: "outline",
}

const channelLabels: Record<string, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  tiktok: "TikTok",
  offline: "Offline",
}

export default async function OrdersPage() {
  const orders = await getOrders({ limit: 100 })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">Orders</h1>
          <p className="text-muted-foreground">
            Manage customer orders and fulfillment
          </p>
        </div>
        <Link href="/orders/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Order
          </Button>
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center border rounded-lg p-12 bg-card">
          <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
          <p className="text-muted-foreground mb-4 text-center">
            Start tracking sales by creating your first order.
          </p>
          <Link href="/orders/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create First Order
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {orders.map((order: any) => (
              <div key={order.id} className="border rounded-lg p-4 bg-card space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium font-mono text-sm">{order.order_id}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(order.order_date)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs">
                      {channelLabels[order.channel]}
                    </Badge>
                    <Badge variant={statusBadges[order.status]} className="text-xs">
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </Badge>
                  </div>
                </div>

                {/* Products */}
                {order.order_line_items && order.order_line_items.length > 0 && (
                  <div className="space-y-1">
                    {order.order_line_items.map((item: any, idx: number) => (
                      <div key={idx} className="text-xs">
                        <span className="text-muted-foreground">
                          {item.quantity}x {item.product_name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {order.notes && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{order.notes}</p>
                )}

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">
                      Revenue: {formatCurrency(order.revenue)}
                    </span>
                    <span className="text-sm font-semibold text-success">
                      Net Profit: {formatCurrency(order.net_profit)}
                    </span>
                  </div>
                  <Link href={`/orders/${order.id}`}>
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block border rounded-lg bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Net Profit</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order: any) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium font-mono">
                      {order.order_id}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(order.order_date)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {channelLabels[order.channel]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {order.order_line_items && order.order_line_items.length > 0 ? (
                        <div className="space-y-1">
                          {order.order_line_items.map((item: any, idx: number) => (
                            <div key={idx} className="text-sm text-muted-foreground">
                              {item.quantity}x {item.product_name}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadges[order.status]}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(order.revenue)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-success">
                      {formatCurrency(order.net_profit)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/orders/${order.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
