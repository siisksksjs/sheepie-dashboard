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
        <div className="border rounded-lg bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Channel Fees</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">
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
                    <Badge variant={statusBadges[order.status]}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {order.channel_fees ? formatCurrency(order.channel_fees) : "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate">
                    {order.notes || "-"}
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
      )}
    </div>
  )
}
