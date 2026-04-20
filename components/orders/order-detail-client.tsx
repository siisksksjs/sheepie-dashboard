"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { duplicateOrder, updateOrderStatus } from "@/lib/actions/orders"
import { getLineItemTotalCost } from "@/lib/line-item-costs"
import { getPackMultiplier, getPackSizeLabel } from "@/lib/products/pack-sizes"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Order, OrderLineItem, OrderStatus, Product } from "@/lib/types/database.types"

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

type Props = {
  initialOrder: Order
  lineItems: OrderLineItem[]
  products: Product[]
}

export function OrderDetailClient({ initialOrder, lineItems, products }: Props) {
  const router = useRouter()
  const [order, setOrder] = useState(initialOrder)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [duplicateSuccess, setDuplicateSuccess] = useState<string | null>(null)

  const handleStatusChange = async (newStatus: OrderStatus) => {
    setUpdating(true)
    setError(null)

    const result = await updateOrderStatus(order.id, newStatus, order.status)

    if (result.success) {
      setOrder((current) => ({ ...current, status: newStatus }))
      router.refresh()
    } else {
      setError(result.error || "Failed to update order status")
    }

    setUpdating(false)
  }

  const handleDuplicateOrder = async () => {
    if (duplicating) {
      return
    }

    setDuplicating(true)
    setDuplicateError(null)
    setDuplicateSuccess(null)

    try {
      const result = await duplicateOrder(order.id)

      if (!result.success) {
        setDuplicateError(result.error || "Failed to duplicate order")
        return
      }

      setDuplicateSuccess(`Duplicated as ${result.data.order_id || result.data.id}`)
      router.refresh()
    } catch (error) {
      setDuplicateError(error instanceof Error ? error.message : "Failed to duplicate order")
    } finally {
      setDuplicating(false)
    }
  }

  const productMap = new Map(products.map((product) => [product.sku, product]))
  const totalAmount = lineItems.reduce((sum, item) => sum + item.quantity * item.selling_price, 0)
  const totalCost = lineItems.reduce((sum, item) => {
    const product = productMap.get(item.sku)
    return sum + getLineItemTotalCost(item, product)
  }, 0)
  const grossProfit = totalAmount - totalCost
  const netProfit = grossProfit - (order.channel_fees || 0)

  return (
    <div className="space-y-4 pb-6">
      <Button asChild variant="ghost" className="mb-4">
        <Link href="/orders">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Orders
        </Link>
      </Button>

      <div className="grid gap-4 md:gap-6 max-w-5xl">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Order {order.order_id}</CardTitle>
                <CardDescription>
                  Created on {formatDate(order.order_date)}
                </CardDescription>
              </div>
              <div className="flex items-center gap-3 self-start">
                <Button variant="outline" onClick={handleDuplicateOrder} disabled={duplicating}>
                  {duplicating ? "Duplicating..." : "Duplicate Order"}
                </Button>
                <Badge variant={statusBadges[order.status]} className="text-sm">
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Sales Channel</p>
              <p className="font-medium">{channelLabels[order.channel]}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Order Date</p>
              <p className="font-medium">{formatDate(order.order_date)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Channel Fees</p>
              <p className="font-medium">
                {order.channel_fees ? formatCurrency(order.channel_fees) : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Notes</p>
              <p className="font-medium break-words">{order.notes || "-"}</p>
            </div>
            {duplicateSuccess && (
              <div className="sm:col-span-2 p-3 text-sm text-success bg-success/10 border border-success/20 rounded-lg">
                {duplicateSuccess}
              </div>
            )}
            {duplicateError && (
              <div className="sm:col-span-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                {duplicateError}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Update Order Status</CardTitle>
            <CardDescription>
              Changing status will auto-generate ledger entries
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-end gap-4 sm:flex-row">
              <div className="flex-1">
                <Select
                  value={order.status}
                  onValueChange={(value) => handleStatusChange(value as OrderStatus)}
                  disabled={updating}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="shipped">Shipped</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 p-3 bg-muted/50 border rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Automatic ledger entries:</strong>
              </p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                <li>• Paid → Creates OUT_SALE entries (reduces stock)</li>
                <li>• Cancelled (from Paid) → Creates RETURN entries (adds stock back)</li>
                <li>• Returned (from Paid) → Creates RETURN entries (adds stock back)</li>
              </ul>
            </div>

            {error && (
              <div className="mt-4 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="md:hidden space-y-3">
              {lineItems.map((item) => {
                const product = productMap.get(item.sku)
                return (
                  <div key={item.id} className="rounded-lg border p-3 space-y-2">
                    <div>
                      <p className="font-medium">{product?.name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                      {product?.variant && (
                        <p className="text-xs text-muted-foreground">{product.variant}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {getPackSizeLabel(item.pack_size)} · {item.quantity} order(s) · {item.quantity * getPackMultiplier(item.pack_size)} unit(s)
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Qty</p>
                        <p className="font-medium">{item.quantity}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Unit</p>
                        <p className="font-medium">{formatCurrency(item.selling_price)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Subtotal</p>
                        <p className="font-medium">{formatCurrency(item.quantity * item.selling_price)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item) => {
                    const product = productMap.get(item.sku)
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                        <TableCell>
                          <div className="font-medium">{product?.name || "Unknown"}</div>
                          {product?.variant && (
                            <div className="text-sm text-muted-foreground">{product.variant}</div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {getPackSizeLabel(item.pack_size)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.selling_price)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.quantity * item.selling_price)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 space-y-2 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Channel Fees</span>
                <span className="font-medium text-destructive">
                  -{formatCurrency(order.channel_fees || 0)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Cost (COGS)</span>
                <span className="font-medium text-destructive">
                  -{formatCurrency(totalCost)}
                </span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Net Profit</span>
                <span className={netProfit >= 0 ? "text-success" : "text-destructive"}>
                  {formatCurrency(netProfit)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
