"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import { createOrder, generateNextOrderId } from "@/lib/actions/orders"
import { formatCurrency } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Channel, OrderStatus, Product } from "@/lib/types/database.types"

type LineItem = {
  id: string
  sku: string
  quantity: number
  selling_price: number
}

const BASE_DEFAULT_PRICES: Record<string, number> = {
  "Cervi-001": 870000,
  "Cervi-002": 198000,
  "Lumi-001": 175000,
  "Calmi-001": 75000,
  "Bundle-Cervi": 870000,
}

const SHOPEE_DEFAULT_PRICES: Record<string, number> = {
  "Cervi-001": 880000,
  "Lumi-001": 198000,
  "Calmi-001": 80000,
  "Bundle-Cervi": 880000,
}

const OFFLINE_DEFAULT_PRICES: Record<string, number> = {
  "Cervi-001": 880000,
  "Lumi-001": 180000,
  "Calmi-001": 80000,
  "Bundle-Cervi": 880000,
}

const TOKOPEDIA_DEFAULT_PRICES: Record<string, number> = {
  "Lumi-001": 193000,
}

const CHANNEL_PRICE_OVERRIDES: Partial<Record<Channel, Record<string, number>>> = {
  shopee: SHOPEE_DEFAULT_PRICES,
  tokopedia: TOKOPEDIA_DEFAULT_PRICES,
  offline: OFFLINE_DEFAULT_PRICES,
}

function getDefaultPriceForChannel(sku: string, channel?: Channel | ""): number {
  const channelOverride = channel ? CHANNEL_PRICE_OVERRIDES[channel]?.[sku] : undefined
  if (typeof channelOverride === "number") return channelOverride
  return BASE_DEFAULT_PRICES[sku] || 0
}

function allocatePricesByDefaultRatio(
  items: LineItem[],
  channel: Channel,
  grossRevenue: number
): LineItem[] {
  const ratioBaseByItem = items.map((item) => {
    const defaultPrice = getDefaultPriceForChannel(item.sku, channel)
    return defaultPrice * item.quantity
  })

  const totalBase = ratioBaseByItem.reduce((sum, value) => sum + value, 0)
  if (totalBase <= 0) return items

  const grossRounded = Math.round(grossRevenue)
  const rawAllocations = ratioBaseByItem.map((base) => (base / totalBase) * grossRounded)
  const allocatedTotals = rawAllocations.map((value) => Math.floor(value))

  let remainder = grossRounded - allocatedTotals.reduce((sum, value) => sum + value, 0)
  if (remainder > 0) {
    const byLargestFraction = rawAllocations
      .map((value, idx) => ({ idx, fraction: value - allocatedTotals[idx] }))
      .sort((a, b) => b.fraction - a.fraction)

    for (let i = 0; i < remainder; i += 1) {
      const pick = byLargestFraction[i % byLargestFraction.length]
      allocatedTotals[pick.idx] += 1
    }
  }

  return items.map((item, idx) => ({
    ...item,
    selling_price: item.quantity > 0
      ? Number((allocatedTotals[idx] / item.quantity).toFixed(2))
      : item.selling_price,
  }))
}

type Props = {
  products: Product[]
}

export function NewOrderForm({ products }: Props) {
  const router = useRouter()
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedChannel, setSelectedChannel] = useState<Channel | "">("")
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [orderId, setOrderId] = useState("")
  const [actualGrossRevenue, setActualGrossRevenue] = useState("")

  useEffect(() => {
    if (selectedChannel && orderDate) {
      generateNextOrderId(selectedChannel, orderDate).then(setOrderId)
    }
  }, [selectedChannel, orderDate])

  useEffect(() => {
    if (!selectedChannel) return

    setLineItems((current) =>
      current.map((item) => {
        if (!item.sku) return item
        const defaultPrice = getDefaultPriceForChannel(item.sku, selectedChannel)
        return defaultPrice ? { ...item, selling_price: defaultPrice } : item
      })
    )
  }, [selectedChannel])

  const addLineItem = () => {
    setLineItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        sku: "",
        quantity: 1,
        selling_price: 0,
      },
    ])
  }

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
    setLineItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item

        const updatedItem = { ...item, [field]: value }
        if (field === "sku" && value) {
          updatedItem.selling_price = getDefaultPriceForChannel(String(value), selectedChannel)
        }

        return updatedItem
      })
    )
  }

  const removeLineItem = (id: string) => {
    setLineItems((current) => current.filter((item) => item.id !== id))
  }

  const applyGrossRevenueAllocation = () => {
    if (!selectedChannel || selectedChannel === "offline") return

    const grossRevenue = parseFloat(actualGrossRevenue)
    if (!Number.isFinite(grossRevenue) || grossRevenue <= 0) {
      setError("Please enter a valid Actual Gross Revenue amount")
      return
    }

    if (lineItems.length < 2) {
      setError("Add at least 2 order items to use ratio allocation")
      return
    }

    if (lineItems.some((item) => !item.sku || item.quantity <= 0)) {
      setError("Please select SKU and quantity for all order items before allocating")
      return
    }

    const uniqueSkuCount = new Set(lineItems.map((item) => item.sku)).size
    if (uniqueSkuCount < 2) {
      setError("Ratio allocation requires at least 2 different products")
      return
    }

    setLineItems(allocatePricesByDefaultRatio(lineItems, selectedChannel, grossRevenue))
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    if (lineItems.length === 0) {
      setError("Please add at least one product to the order")
      setSaving(false)
      return
    }

    if (lineItems.some((item) => !item.sku || item.quantity <= 0 || item.selling_price <= 0)) {
      setError("Please fill in all line item fields correctly")
      setSaving(false)
      return
    }

    const formData = new FormData(e.currentTarget)
    const result = await createOrder({
      order_id: formData.get("order_id") as string,
      channel: formData.get("channel") as Channel,
      order_date: formData.get("order_date") as string,
      status: formData.get("status") as OrderStatus,
      channel_fees: formData.get("channel_fees")
        ? parseFloat(formData.get("channel_fees") as string)
        : null,
      notes: (formData.get("notes") as string) || null,
      line_items: lineItems.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        selling_price: item.selling_price,
      })),
    })

    if (result.success) {
      router.push("/dashboard")
    } else {
      setError(result.error || "Failed to create order")
      setSaving(false)
    }
  }

  const totalAmount = lineItems.reduce((sum, item) => sum + item.quantity * item.selling_price, 0)
  const uniqueSkuCount = new Set(lineItems.filter((item) => item.sku).map((item) => item.sku)).size
  const canUseGrossRevenueAllocation = Boolean(
    selectedChannel &&
    selectedChannel !== "offline" &&
    uniqueSkuCount >= 2
  )

  return (
    <div>
      <Link href="/orders">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Orders
        </Button>
      </Link>

      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>Create New Order</CardTitle>
          <CardDescription>
            Add a new order and automatically generate ledger entries based on status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="order_id">
                  Order ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="order_id"
                  name="order_id"
                  placeholder="Select channel and date to auto-generate"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Auto-generated based on channel + date (editable)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="order_date">
                  Order Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="order_date"
                  name="order_date"
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="channel">
                  Sales Channel <span className="text-destructive">*</span>
                </Label>
                <Select
                  name="channel"
                  value={selectedChannel}
                  onValueChange={(value) => setSelectedChannel(value as Channel)}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shopee">Shopee</SelectItem>
                    <SelectItem value="tokopedia">Tokopedia</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Product prices auto-fill based on selected channel
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">
                  Order Status <span className="text-destructive">*</span>
                </Label>
                <Select name="status" defaultValue="paid" required>
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
                <p className="text-xs text-muted-foreground">
                  If "Paid", ledger entries will be auto-generated
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="channel_fees">Channel Fees (IDR)</Label>
                <Input
                  id="channel_fees"
                  name="channel_fees"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" name="notes" placeholder="Optional notes" />
              </div>
            </div>

            <div className="border-t pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Order Items</h3>
                <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Product
                </Button>
              </div>

              {canUseGrossRevenueAllocation && (
                <div className="mb-4 p-3 border rounded-lg bg-muted/30">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="actual_gross_revenue">Actual Gross Revenue (IDR)</Label>
                      <Input
                        id="actual_gross_revenue"
                        type="number"
                        min="0"
                        step="1"
                        value={actualGrossRevenue}
                        onChange={(e) => setActualGrossRevenue(e.target.value)}
                        placeholder="e.g. 1000000"
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter settlement "Total Revenue", then apply ratio allocation to overwrite line item prices.
                      </p>
                    </div>
                    <Button type="button" variant="secondary" onClick={applyGrossRevenueAllocation}>
                      Apply Ratio Allocation
                    </Button>
                  </div>
                </div>
              )}

              {lineItems.length === 0 ? (
                <div className="text-center py-8 border rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    No products added. Click "Add Product" to start.
                  </p>
                </div>
              ) : (
                <>
                  <div className="md:hidden space-y-4">
                    {lineItems.map((item) => (
                      <div key={item.id} className="border rounded-lg p-4 space-y-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Product</Label>
                          <Select
                            value={item.sku}
                            onValueChange={(value) => updateLineItem(item.id, "sku", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((product) => (
                                <SelectItem key={product.id} value={product.sku}>
                                  <span className="font-mono text-sm">{product.sku}</span> - {product.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label className="text-xs">Quantity</Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value, 10) || 0)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">Price (IDR)</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.selling_price || ""}
                              onChange={(e) => updateLineItem(item.id, "selling_price", parseFloat(e.target.value) || 0)}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t">
                          <span className="text-sm font-medium">
                            Subtotal: {formatCurrency(item.quantity * item.selling_price)}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLineItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="border-t pt-4">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">Total:</span>
                        <span className="font-bold text-lg">{formatCurrency(totalAmount)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="w-32">Quantity</TableHead>
                          <TableHead className="w-40">Price (IDR)</TableHead>
                          <TableHead className="text-right">Subtotal</TableHead>
                          <TableHead className="w-16"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lineItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Select
                                value={item.sku}
                                onValueChange={(value) => updateLineItem(item.id, "sku", value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select product" />
                                </SelectTrigger>
                                <SelectContent>
                                  {products.map((product) => (
                                    <SelectItem key={product.id} value={product.sku}>
                                      <span className="font-mono text-sm">{product.sku}</span> - {product.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value, 10) || 0)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.selling_price || ""}
                                onChange={(e) => updateLineItem(item.id, "selling_price", parseFloat(e.target.value) || 0)}
                              />
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(item.quantity * item.selling_price)}
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeLineItem(item.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>

            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-6">
              <div>
                <p className="text-sm text-muted-foreground">Order Total</p>
                <p className="text-2xl font-bold">{formatCurrency(totalAmount)}</p>
              </div>
              <div className="flex gap-3">
                <Link href="/orders">
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" disabled={saving}>
                  {saving ? "Creating..." : "Create Order"}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
