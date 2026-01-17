"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createOrder, generateNextOrderId } from "@/lib/actions/orders"
import { getProducts } from "@/lib/actions/products"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency } from "@/lib/utils"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import type { Product, Channel, OrderStatus } from "@/lib/types/database.types"

type LineItem = {
  id: string
  sku: string
  quantity: number
  selling_price: number
}

// Default selling prices for each product
const DEFAULT_PRICES: Record<string, number> = {
  'Cervi-001': 870000,       // CerviCloud Pillow
  'Cervi-002': 198000,       // Cervi Case
  'Lumi-001': 175000,        // LumiCloud Eye Mask
  'Calmi-001': 49000,        // CalmiCloud Ear Plug
  'Bundle-Cervi': 870000,    // CerviCloud + CalmiCloud bundle
}

export default function NewOrderPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedChannel, setSelectedChannel] = useState<Channel | "">("")
  const [orderDate, setOrderDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [orderId, setOrderId] = useState<string>("")

  useEffect(() => {
    loadProducts()
  }, [])

  // Auto-generate order ID when channel or date changes
  useEffect(() => {
    if (selectedChannel && orderDate) {
      generateOrderId(selectedChannel, orderDate)
    }
  }, [selectedChannel, orderDate])

  const loadProducts = async () => {
    const data = await getProducts()
    setProducts(data.filter(p => p.status === 'active'))
    setLoading(false)
  }

  const generateOrderId = async (channel: Channel, date: string) => {
    // Call server action to get next order ID
    const newOrderId = await generateNextOrderId(channel, date)
    setOrderId(newOrderId)
  }

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: crypto.randomUUID(),
        sku: "",
        quantity: 1,
        selling_price: 0,
      },
    ])
  }

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(
      lineItems.map((item) => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value }

          // Auto-populate selling price when SKU is selected
          if (field === 'sku' && value && DEFAULT_PRICES[value]) {
            updatedItem.selling_price = DEFAULT_PRICES[value]
          }

          return updatedItem
        }
        return item
      })
    )
  }

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter((item) => item.id !== id))
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

    if (lineItems.some(item => !item.sku || item.quantity <= 0 || item.selling_price <= 0)) {
      setError("Please fill in all line item fields correctly")
      setSaving(false)
      return
    }

    const formData = new FormData(e.currentTarget)

    const data = {
      order_id: formData.get("order_id") as string,
      channel: formData.get("channel") as Channel,
      order_date: formData.get("order_date") as string,
      status: formData.get("status") as OrderStatus,
      channel_fees: formData.get("channel_fees")
        ? parseFloat(formData.get("channel_fees") as string)
        : null,
      notes: (formData.get("notes") as string) || null,
      line_items: lineItems.map(item => ({
        sku: item.sku,
        quantity: item.quantity,
        selling_price: item.selling_price,
      })),
    }

    const result = await createOrder(data)

    if (result.success) {
      router.push("/orders")
    } else {
      setError(result.error || "Failed to create order")
      setSaving(false)
    }
  }

  const totalAmount = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.selling_price,
    0
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">Loading products...</p>
      </div>
    )
  }

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
                <Input
                  id="notes"
                  name="notes"
                  placeholder="Optional notes"
                />
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

              {lineItems.length === 0 ? (
                <div className="text-center py-8 border rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    No products added. Click "Add Product" to start.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-4">
                    {lineItems.map((item) => {
                      const product = products.find(p => p.sku === item.sku)
                      return (
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
                                {products.map((p) => (
                                  <SelectItem key={p.id} value={p.sku}>
                                    <span className="font-mono text-sm">{p.sku}</span> - {p.name}
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
                                onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Price (IDR)</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.selling_price || ""}
                                onChange={(e) => updateLineItem(item.id, "selling_price", parseFloat(e.target.value))}
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t">
                            <span className="text-sm font-medium">Subtotal: {formatCurrency(item.quantity * item.selling_price)}</span>
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
                      )
                    })}
                    <div className="border-t pt-4">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">Total:</span>
                        <span className="font-bold text-lg">{formatCurrency(totalAmount)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="w-24">Quantity</TableHead>
                          <TableHead className="w-32">Price (IDR)</TableHead>
                          <TableHead className="w-32 text-right">Subtotal</TableHead>
                          <TableHead className="w-16"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lineItems.map((item) => {
                          const product = products.find(p => p.sku === item.sku)
                          return (
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
                                    {products.map((p) => (
                                      <SelectItem key={p.id} value={p.sku}>
                                        <span className="font-mono text-sm">{p.sku}</span> - {p.name}
                                        {p.variant && <span className="text-muted-foreground"> ({p.variant})</span>}
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
                                  onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value))}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder={product ? product.cost_per_unit.toString() : "0"}
                                  value={item.selling_price || ""}
                                  onChange={(e) => updateLineItem(item.id, "selling_price", parseFloat(e.target.value))}
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
                          )
                        })}
                        <TableRow>
                          <TableCell colSpan={3} className="text-right font-semibold">
                            Total:
                          </TableCell>
                          <TableCell className="text-right font-bold text-lg">
                            {formatCurrency(totalAmount)}
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>

            <div className="p-3 bg-muted/50 border rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> If order status is "Paid" or "Shipped", OUT_SALE ledger entries
                will be automatically created for all line items.
              </p>
            </div>

            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Creating Order..." : "Create Order"}
              </Button>
              <Link href="/orders">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
