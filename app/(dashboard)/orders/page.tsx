import { duplicateOrder, getOrders } from "@/lib/actions/orders"
import { OrdersListClient } from "@/components/orders/orders-list-client"
import { Button } from "@/components/ui/button"
import { Plus, ShoppingCart } from "lucide-react"
import Link from "next/link"

export default async function OrdersPage() {
  const orders = await getOrders({ limit: 100 })

  async function duplicateOrderAction(orderId: string) {
    "use server"

    return duplicateOrder(orderId)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">Orders</h1>
          <p className="text-muted-foreground">
            Manage customer orders and fulfillment
          </p>
        </div>
        <Button asChild>
          <Link href="/orders/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Order
          </Link>
        </Button>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center border rounded-lg p-12 bg-card">
          <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
          <p className="text-muted-foreground mb-4 text-center">
            Start tracking sales by creating your first order.
          </p>
          <Button asChild>
            <Link href="/orders/new">
              <Plus className="mr-2 h-4 w-4" />
              Create First Order
            </Link>
          </Button>
        </div>
      ) : (
        <OrdersListClient
          orders={orders}
          duplicateLabel="Duplicate"
          onDuplicate={duplicateOrderAction}
        />
      )}
    </div>
  )
}
