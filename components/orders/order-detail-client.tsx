"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Ban, PackageCheck, TriangleAlert } from "lucide-react"
import { updateOrderStatus } from "@/lib/actions/orders"
import {
  resolveSalesUnitCost,
  calculateSalesOrder
} from "@/supabase/functions/_shared/sales-metrics"
import { getPackMultiplier, getPackSizeLabel } from "@/lib/products/pack-sizes"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type {
  Order,
  OrderLineItem,
  OrderStatus,
  Product,
  ReturnDisposition
} from "@/lib/types/database.types"

const statusBadges: Record<
  string,
  "default" | "success" | "destructive" | "outline"
> = {
  paid: "success",
  shipped: "default",
  cancelled: "destructive",
  returned: "outline"
}

const channelLabels: Record<string, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  tiktok: "TikTok",
  offline: "Offline"
}

type Props = {
  initialOrder: Order
  lineItems: OrderLineItem[]
  products: Product[]
}

export function OrderDetailClient({
  initialOrder,
  lineItems,
  products
}: Props) {
  const router = useRouter()
  const [order, setOrder] = useState(initialOrder)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null)
  const [disposition, setDisposition] =
    useState<ReturnDisposition>("dead_stock")
  const [returnNote, setReturnNote] = useState("")

  const saveStatus = async (
    newStatus: OrderStatus,
    selectedDisposition?: ReturnDisposition
  ) => {
    if (updating) return
    setUpdating(true)
    setError(null)
    try {
      const result = await updateOrderStatus(
        order.id,
        newStatus,
        order.status,
        {
          disposition: selectedDisposition,
          previousDisposition: order.return_disposition ?? null,
          note: selectedDisposition ? returnNote : undefined
        }
      )
      if (result.success) {
        setOrder((current) => ({ ...current, ...result.data }))
        setPendingStatus(null)
        router.refresh()
      } else {
        setError(result.error || "Failed to update order status")
      }
    } catch {
      setError(
        "Could not confirm the update. Refresh the order before trying again."
      )
    } finally {
      setUpdating(false)
    }
  }

  const handleStatusChange = (newStatus: OrderStatus) => {
    if (newStatus === order.status) return
    if (newStatus === "cancelled" || newStatus === "returned") {
      setDisposition(
        order.return_disposition === "dead_stock"
          ? "dead_stock"
          : newStatus === "returned"
            ? "dead_stock"
            : "restock"
      )
      setReturnNote(order.return_note ?? "")
      setError(null)
      setPendingStatus(newStatus)
    } else {
      void saveStatus(newStatus)
    }
  }

  const productMap = new Map(products.map((product) => [product.sku, product]))
  const metrics = calculateSalesOrder({
    channelFees: order.channel_fees,
    lines: lineItems.map((item) => ({
      key: item.id,
      sellingPrice: item.selling_price,
      quantity: item.quantity,
      packSize: item.pack_size,
      unitCost: resolveSalesUnitCost(
        item.cost_per_unit_snapshot,
        productMap.get(item.sku)?.cost_per_unit
      )
    }))
  })

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
                <Button variant="outline" asChild>
                  <Link href={`/orders/new?from=${order.id}`}>Log again</Link>
                </Button>
                <Badge variant={statusBadges[order.status]} className="text-sm">
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                Sales Channel
              </p>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Update Order Status</CardTitle>
            <CardDescription>
              Review the stock condition when cancelling or returning an order.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-end gap-4 sm:flex-row">
              <div className="flex-1">
                <Select
                  value={order.status}
                  onValueChange={(value) =>
                    handleStatusChange(value as OrderStatus)
                  }
                  disabled={updating}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      value="paid"
                      disabled={order.return_disposition === "dead_stock"}
                    >
                      Paid
                    </SelectItem>
                    <SelectItem
                      value="shipped"
                      disabled={order.return_disposition === "dead_stock"}
                    >
                      Shipped
                    </SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 rounded-xl border bg-muted/50 p-4 text-sm">
              {order.return_disposition === "dead_stock" ? (
                <>
                  <p className="flex items-center gap-2 font-bold">
                    <Ban className="size-4" /> Dead stock · cannot be resold
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Damaged goods are excluded from saleable stock.
                  </p>
                </>
              ) : order.status === "cancelled" ||
                order.status === "returned" ? (
                <>
                  <p className="font-bold">
                    {order.return_disposition === "restock"
                      ? "Stock restored for resale"
                      : "Return condition not recorded"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {order.return_disposition === "restock"
                      ? "If these goods are defective, mark them as dead stock to remove them from saleable inventory."
                      : "This order predates stock-condition tracking. Review its ledger before marking returned goods as dead stock."}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={() => {
                      setDisposition("dead_stock")
                      setReturnNote(order.return_note ?? "")
                      setError(null)
                      setPendingStatus(order.status)
                    }}
                  >
                    Mark as dead stock
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Paid and shipped orders have already deducted stock. A
                  defective return will keep saleable stock unchanged.
                </p>
              )}
              {order.return_note && (
                <p className="mt-2 break-words text-muted-foreground">
                  {order.return_note}
                </p>
              )}
            </div>

            {error && !pendingStatus && (
              <div className="mt-4 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog
          open={pendingStatus !== null}
          onOpenChange={(open) => {
            if (!open && !updating) setPendingStatus(null)
          }}
        >
          <DialogContent
            className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg"
            onEscapeKeyDown={(event) => {
              if (updating) event.preventDefault()
            }}
            onInteractOutside={(event) => {
              if (updating) event.preventDefault()
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {pendingStatus === order.status
                  ? "Mark as dead stock"
                  : pendingStatus === "returned"
                    ? "Record a customer return"
                    : "Cancel this order"}
              </DialogTitle>
              <DialogDescription>
                Choose the condition for all items in this order before
                confirming.
              </DialogDescription>
            </DialogHeader>
            <div
              className="grid gap-3"
              role="radiogroup"
              aria-label="Returned stock condition"
            >
              {(
                [
                  {
                    value: "dead_stock",
                    title: "Defective / dead stock",
                    description: "Damaged goods cannot be sold again.",
                    Icon: Ban
                  },
                  {
                    value: "restock",
                    title: "Can be resold",
                    description:
                      "Goods are unused or have been received and checked.",
                    Icon: PackageCheck
                  }
                ] as const
              ).map(({ value, title, description, Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={disposition === value}
                  disabled={
                    updating ||
                    (value === "restock" &&
                      order.return_disposition === "dead_stock")
                  }
                  onClick={() => setDisposition(value)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-left disabled:opacity-50",
                    disposition === value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-white/40"
                  )}
                >
                  <Icon className="mt-0.5 size-5 shrink-0" />
                  <span>
                    <span className="block font-bold">{title}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <label htmlFor="return-note" className="text-sm font-bold">
                Return / defect note (optional)
              </label>
              <Textarea
                id="return-note"
                value={returnNote}
                onChange={(event) => setReturnNote(event.target.value)}
                maxLength={500}
                disabled={updating}
                placeholder="e.g. Broken seam reported by customer"
              />
            </div>
            <div
              className="rounded-xl bg-primary/5 p-4 text-sm"
              aria-live="polite"
            >
              <p className="flex items-center gap-2 font-bold">
                <TriangleAlert className="size-4" /> Saleable stock impact
              </p>
              <p className="mt-2 text-muted-foreground">
                {disposition === "dead_stock"
                  ? order.status === "paid" ||
                    order.status === "shipped" ||
                    order.return_disposition === "dead_stock"
                    ? "No stock will be added back. These goods will be recorded as dead stock; stock was already deducted when the order was logged."
                    : "Previously restored units will be removed from saleable stock and written off as dead stock."
                  : order.status === "paid" || order.status === "shipped"
                    ? "All physical units in this order will be added back to saleable stock. Confirm only after checking they can be sold."
                    : "Stock has already been restored. Changing the status will not add it again."}
              </p>
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                disabled={updating}
                onClick={() => setPendingStatus(null)}
              >
                Go back
              </Button>
              <Button
                disabled={updating}
                onClick={() => {
                  if (pendingStatus) void saveStatus(pendingStatus, disposition)
                }}
              >
                {updating
                  ? "Recording…"
                  : disposition === "dead_stock"
                    ? "Confirm dead stock"
                    : "Confirm & restore stock"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle>Order Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="md:hidden space-y-3">
              {lineItems.map((item) => {
                const product = productMap.get(item.sku)
                return (
                  <div
                    key={item.id}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <div>
                      <p className="font-medium">
                        {product?.name || "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {item.sku}
                      </p>
                      {product?.variant && (
                        <p className="text-xs text-muted-foreground">
                          {product.variant}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {getPackSizeLabel(item.pack_size)} · {item.quantity}{" "}
                        order(s) ·{" "}
                        {item.quantity * getPackMultiplier(item.pack_size)}{" "}
                        unit(s)
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Qty</p>
                        <p className="font-medium">{item.quantity}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Unit</p>
                        <p className="font-medium">
                          {formatCurrency(item.selling_price)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Subtotal
                        </p>
                        <p className="font-medium">
                          {formatCurrency(item.quantity * item.selling_price)}
                        </p>
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
                        <TableCell className="font-mono text-sm">
                          {item.sku}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {product?.name || "Unknown"}
                          </div>
                          {product?.variant && (
                            <div className="text-sm text-muted-foreground">
                              {product.variant}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {getPackSizeLabel(item.pack_size)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.selling_price)}
                        </TableCell>
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
                <span className="text-muted-foreground">GMV</span>
                <span className="font-medium">
                  {formatCurrency(metrics.totals.gmv)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Channel Fees</span>
                <span className="font-medium text-destructive">
                  -{formatCurrency(order.channel_fees || 0)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Revenue</span>
                <span className="font-medium">
                  {formatCurrency(metrics.totals.revenue)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Cost (COGS)</span>
                <span className="font-medium text-destructive">
                  -{formatCurrency(metrics.totals.cogs)}
                </span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Profit</span>
                <span
                  className={
                    metrics.totals.profit >= 0
                      ? "text-success"
                      : "text-destructive"
                  }
                >
                  {formatCurrency(metrics.totals.profit)}
                </span>
              </div>
              {!metrics.totals.hasCompleteCostData && (
                <p className="text-xs text-warning">
                  Cost data missing—Profit may be overstated.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
