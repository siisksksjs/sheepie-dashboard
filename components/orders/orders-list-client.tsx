"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Eye } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn, formatCurrency, formatDate } from "@/lib/utils"

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

type OrderListItem = Awaited<ReturnType<typeof import("@/lib/actions/orders").getOrders>>[number]
type OrderListLineItem = OrderListItem["order_line_items"][number]

type DuplicateOrderResult =
  | {
      success: true
      data: {
        id: string
        order_id: string
      }
    }
  | {
      success: false
      error: string
    }

type Props = {
  orders: OrderListItem[]
  duplicateLabel: string
  onDuplicate: (orderId: string) => Promise<DuplicateOrderResult>
}

type FeedbackState =
  | {
      kind: "success" | "error"
      message: string
    }
  | null

export function OrdersListClient({ orders, duplicateLabel, onDuplicate }: Props) {
  const router = useRouter()
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState>(null)

  const handleDuplicate = async (orderId: string) => {
    if (pendingOrderId) {
      return
    }

    setPendingOrderId(orderId)
    setFeedback(null)

    try {
      const result = await onDuplicate(orderId)

      if (result.success) {
        setFeedback({
          kind: "success",
          message: `Duplicated as ${result.data.order_id}`,
        })
        router.refresh()
        return
      }

      setFeedback({
        kind: "error",
        message: result.error,
      })
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to duplicate order",
      })
    } finally {
      setPendingOrderId(null)
    }
  }

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            feedback.kind === "success"
              ? "border-success/20 bg-success/10 text-success"
              : "border-destructive/20 bg-destructive/10 text-destructive",
          )}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </div>
      )}

      <div className="md:hidden space-y-3">
        {orders.map((order) => {
          const isPending = pendingOrderId === order.id

          return (
            <div key={order.id} className="border rounded-lg p-4 bg-card space-y-3">
              <div className="flex items-start justify-between gap-3">
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

              {order.order_line_items.length > 0 && (
                <div className="space-y-1">
                  {order.order_line_items.map((item: OrderListLineItem) => (
                    <div key={item.id} className="text-xs">
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

              <div className="flex items-center justify-between gap-3 pt-2 border-t">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    Revenue: {formatCurrency(order.revenue)}
                  </span>
                  <span className="text-sm font-semibold text-success">
                    Net Profit: {formatCurrency(order.net_profit)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDuplicate(order.id)}
                    disabled={pendingOrderId !== null}
                  >
                    {isPending ? "Duplicating..." : duplicateLabel}
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/orders/${order.id}`}>
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

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
            {orders.map((order) => {
              const isPending = pendingOrderId === order.id

              return (
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
                    {order.order_line_items.length > 0 ? (
                      <div className="space-y-1">
                        {order.order_line_items.map((item: OrderListLineItem) => (
                          <div key={item.id} className="text-sm text-muted-foreground">
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
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDuplicate(order.id)}
                        disabled={pendingOrderId !== null}
                      >
                        {isPending ? "Duplicating..." : duplicateLabel}
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/orders/${order.id}`}>
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
