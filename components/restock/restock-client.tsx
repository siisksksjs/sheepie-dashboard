"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { PackagePlus, Pencil, Plane, Ship, Trash2, Truck, X } from "lucide-react"

import { createRestock, deleteRestock, markRestockArrived, updateRestock } from "@/lib/actions/restock"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency, formatDate } from "@/lib/utils"
import type {
  Product,
  ShippingMode,
} from "@/lib/types/database.types"

type RestockRow = Awaited<ReturnType<typeof import("@/lib/actions/finance").getInventoryPurchaseBatches>>[number]

type Props = {
  restocks: RestockRow[]
  products: Product[]
}

type RestockItemForm = {
  id: string
  sku: string
  quantity: number
  unit_cost: string
}

const shippingModeOptions: Array<{ value: ShippingMode; label: string; icon: typeof Plane }> = [
  { value: "air", label: "Air", icon: Plane },
  { value: "sea", label: "Sea", icon: Ship },
]

function createEmptyItem(): RestockItemForm {
  return {
    id: crypto.randomUUID(),
    sku: "",
    quantity: 1,
    unit_cost: "",
  }
}

function getModeLabel(mode: ShippingMode | null) {
  return mode ? mode.toUpperCase() : "-"
}

function getLeadDays(orderDate: string, arrivalDate: string | null) {
  if (!arrivalDate) {
    return null
  }

  const diffMs = new Date(`${arrivalDate}T00:00:00.000Z`).getTime()
    - new Date(`${orderDate}T00:00:00.000Z`).getTime()

  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return null
  }

  return Math.round(diffMs / 86_400_000)
}

type InTransitCardProps = {
  restock: RestockRow
  products: Product[]
  arrivalDate: string
  onArrivalDateChange: (value: string) => void
  onMarkArrived: () => void
  isArriving: boolean
  onChanged: () => void
}

function InTransitCard({
  restock,
  products,
  arrivalDate,
  onArrivalDateChange,
  onMarkArrived,
  isArriving,
  onChanged,
}: InTransitCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, startSaveTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [editOrderDate, setEditOrderDate] = useState(restock.order_date)
  const [editShippingMode, setEditShippingMode] = useState<ShippingMode>(
    restock.shipping_mode ?? "air",
  )
  const [editVendor, setEditVendor] = useState(restock.vendor ?? "")
  const [editNotes, setEditNotes] = useState(restock.notes ?? "")
  const [editItems, setEditItems] = useState<RestockItemForm[]>(
    restock.items.map((item) => ({
      id: item.id,
      sku: item.sku,
      quantity: item.quantity,
      unit_cost: String(item.unit_cost),
    })),
  )

  const beginEdit = () => {
    setEditError(null)
    setEditOrderDate(restock.order_date)
    setEditShippingMode(restock.shipping_mode ?? "air")
    setEditVendor(restock.vendor ?? "")
    setEditNotes(restock.notes ?? "")
    setEditItems(
      restock.items.length > 0
        ? restock.items.map((item) => ({
            id: item.id,
            sku: item.sku,
            quantity: item.quantity,
            unit_cost: String(item.unit_cost),
          }))
        : [createEmptyItem()],
    )
    setIsEditing(true)
  }

  const updateEditItem = (id: string, field: keyof RestockItemForm, value: string | number) => {
    setEditItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    )
  }

  const addEditItem = () => {
    setEditItems((current) => [...current, createEmptyItem()])
  }

  const removeEditItem = (id: string) => {
    setEditItems((current) => (current.length === 1 ? current : current.filter((item) => item.id !== id)))
  }

  const handleSave = () => {
    setEditError(null)

    startSaveTransition(async () => {
      const result = await updateRestock({
        batch_id: restock.id,
        order_date: editOrderDate,
        shipping_mode: editShippingMode,
        account_id: restock.account_id,
        vendor: editVendor || null,
        notes: editNotes || null,
        items: editItems.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
          unit_cost: item.unit_cost === "" ? null : Number(item.unit_cost),
        })),
      })

      if (!result.success) {
        setEditError(result.error || "Failed to update restock")
        return
      }

      setIsEditing(false)
      onChanged()
    })
  }

  const handleDelete = () => {
    setEditError(null)

    startDeleteTransition(async () => {
      const result = await deleteRestock({ batch_id: restock.id })

      if (!result.success) {
        setEditError(result.error || "Failed to remove restock")
        setConfirmingDelete(false)
        return
      }

      onChanged()
    })
  }

  if (isEditing) {
    return (
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Edit Restock</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
            <X className="mr-1 h-4 w-4" />
            Cancel
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`edit-order-date-${restock.id}`}>China Order Date *</Label>
            <Input
              id={`edit-order-date-${restock.id}`}
              type="date"
              value={editOrderDate}
              onChange={(event) => setEditOrderDate(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Shipping Mode *</Label>
            <Select value={editShippingMode} onValueChange={(value) => setEditShippingMode(value as ShippingMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {shippingModeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`edit-vendor-${restock.id}`}>Vendor</Label>
            <Input
              id={`edit-vendor-${restock.id}`}
              value={editVendor}
              onChange={(event) => setEditVendor(event.target.value)}
              placeholder="Supplier name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-notes-${restock.id}`}>Notes</Label>
            <Textarea
              id={`edit-notes-${restock.id}`}
              value={editNotes}
              onChange={(event) => setEditNotes(event.target.value)}
              placeholder="Optional shipping notes or problem context"
            />
          </div>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <Label>Restock Items *</Label>
            <Button type="button" variant="outline" size="sm" onClick={addEditItem}>
              <PackagePlus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          </div>

          {editItems.map((item) => (
            <div key={item.id} className="grid items-end gap-3 md:grid-cols-[1.5fr_0.7fr_0.9fr_auto]">
              <div className="space-y-2">
                <Label>Product *</Label>
                <Select value={item.sku} onValueChange={(value) => updateEditItem(item.id, "sku", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.sku}>
                        {product.sku} - {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Qty *</Label>
                <Input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(event) =>
                    updateEditItem(item.id, "quantity", parseInt(event.target.value, 10) || 0)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Cost</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Optional, 0 uses product cost"
                  value={item.unit_cost}
                  onChange={(event) => updateEditItem(item.id, "unit_cost", event.target.value)}
                />
              </div>
              <Button type="button" variant="ghost" onClick={() => removeEditItem(item.id)}>
                Remove
              </Button>
            </div>
          ))}
        </div>

        {editError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {editError}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{restock.vendor || "Restock Batch"}</p>
          <p className="text-sm text-muted-foreground">
            Ordered {formatDate(restock.order_date)} via {getModeLabel(restock.shipping_mode)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">In Transit</Badge>
          <Button type="button" variant="ghost" size="sm" onClick={beginEdit} aria-label="Edit restock">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmingDelete(true)}
            aria-label="Remove restock"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        {restock.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {item.product_name} ({item.sku}) x{item.quantity}
            </span>
            <span>{formatCurrency(item.total_cost)}</span>
          </div>
        ))}
      </div>

      {confirmingDelete ? (
        <div className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">
            Remove this in-transit restock? This deletes the batch and its linked finance entry. This cannot be undone.
          </p>
          <div className="flex gap-3">
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Removing..." : "Confirm Remove"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmingDelete(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor={`arrival-${restock.id}`}>Warehouse Arrival Date</Label>
            <Input
              id={`arrival-${restock.id}`}
              type="date"
              value={arrivalDate}
              onChange={(event) => onArrivalDateChange(event.target.value)}
            />
          </div>
          <Button type="button" onClick={onMarkArrived} disabled={isArriving}>
            {isArriving ? "Posting..." : "Mark Arrived"}
          </Button>
        </div>
      )}

      {editError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {editError}
        </div>
      )}
    </div>
  )
}

export function RestockClient({ restocks, products }: Props) {
  const router = useRouter()
  const [isCreating, startCreateTransition] = useTransition()
  const [isArriving, startArrivalTransition] = useTransition()
  const [createError, setCreateError] = useState<string | null>(null)
  const [arrivalError, setArrivalError] = useState<string | null>(null)
  const [purchaseItems, setPurchaseItems] = useState<RestockItemForm[]>([createEmptyItem()])
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [shippingMode, setShippingMode] = useState<ShippingMode>("air")
  const [vendor, setVendor] = useState("")
  const [notes, setNotes] = useState("")
  const [arrivalDates, setArrivalDates] = useState<Record<string, string>>({})

  const inTransitRestocks = useMemo(
    () => restocks.filter((restock) => restock.restock_status === "in_transit"),
    [restocks],
  )
  const arrivedRestocks = useMemo(
    () => restocks.filter((restock) => restock.restock_status === "arrived"),
    [restocks],
  )

  const updatePurchaseItem = (id: string, field: keyof RestockItemForm, value: string | number) => {
    setPurchaseItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    )
  }

  const addPurchaseItem = () => {
    setPurchaseItems((current) => [...current, createEmptyItem()])
  }

  const removePurchaseItem = (id: string) => {
    setPurchaseItems((current) => {
      if (current.length === 1) {
        return current
      }

      return current.filter((item) => item.id !== id)
    })
  }

  const resetForm = () => {
    setOrderDate(new Date().toISOString().split("T")[0])
    setShippingMode("air")
    setVendor("")
    setNotes("")
    setPurchaseItems([createEmptyItem()])
  }

  const handleCreateRestock = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateError(null)

    startCreateTransition(async () => {
      const result = await createRestock({
        order_date: orderDate,
        shipping_mode: shippingMode,
        vendor: vendor || null,
        notes: notes || null,
        items: purchaseItems.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
          unit_cost: item.unit_cost === "" ? null : Number(item.unit_cost),
        })),
      })

      if (!result.success) {
        setCreateError(result.error || "Failed to create restock")
        return
      }

      resetForm()
      router.refresh()
    })
  }

  const handleArrival = (batchId: string) => {
    setArrivalError(null)

    startArrivalTransition(async () => {
      const arrivalDate = arrivalDates[batchId] || new Date().toISOString().split("T")[0]
      const result = await markRestockArrived({
        batch_id: batchId,
        arrival_date: arrivalDate,
      })

      if (!result.success) {
        setArrivalError(result.error || "Failed to mark restock arrived")
        return
      }

      setArrivalDates((current) => {
        const next = { ...current }
        delete next[batchId]
        return next
      })
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Restock</h1>
          <p className="text-muted-foreground">
            Track supplier orders from China through arrival at your Indonesia warehouse.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Truck className="h-4 w-4" />
          Stock enters Ledger only when a batch is marked arrived.
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create Restock</CardTitle>
            <CardDescription>
              Record the supplier order now, then receive inventory later when the batch arrives.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateRestock} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="order_date">China Order Date *</Label>
                  <Input
                    id="order_date"
                    type="date"
                    value={orderDate}
                    onChange={(event) => setOrderDate(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Shipping Mode *</Label>
                  <Select value={shippingMode} onValueChange={(value) => setShippingMode(value as ShippingMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {shippingModeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vendor">Vendor</Label>
                  <Input
                    id="vendor"
                    value={vendor}
                    onChange={(event) => setVendor(event.target.value)}
                    placeholder="Supplier name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Optional shipping notes or problem context"
                  />
                </div>
              </div>

              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label>Restock Items *</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addPurchaseItem}>
                    <PackagePlus className="mr-2 h-4 w-4" />
                    Add Item
                  </Button>
                </div>

                {purchaseItems.map((item) => (
                  <div key={item.id} className="grid items-end gap-3 md:grid-cols-[1.5fr_0.7fr_0.9fr_auto]">
                    <div className="space-y-2">
                      <Label>Product *</Label>
                      <Select value={item.sku} onValueChange={(value) => updatePurchaseItem(item.id, "sku", value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.sku}>
                              {product.sku} - {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Qty *</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(event) =>
                          updatePurchaseItem(item.id, "quantity", parseInt(event.target.value, 10) || 0)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit Cost</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Optional, 0 uses product cost"
                        value={item.unit_cost}
                        onChange={(event) =>
                          updatePurchaseItem(item.id, "unit_cost", event.target.value)
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Leave blank or use 0 to fall back to the product cost.
                      </p>
                    </div>
                    <Button type="button" variant="ghost" onClick={() => removePurchaseItem(item.id)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>

              {createError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {createError}
                </div>
              )}

              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Saving..." : "Create Restock"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>In Transit</CardTitle>
            <CardDescription>
              Confirm warehouse arrival here so stock posts to the ledger and changelog automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {inTransitRestocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No restocks are currently in transit.</p>
            ) : (
              inTransitRestocks.map((restock) => (
                <InTransitCard
                  key={restock.id}
                  restock={restock}
                  products={products}
                  arrivalDate={arrivalDates[restock.id] || new Date().toISOString().split("T")[0]}
                  onArrivalDateChange={(value) =>
                    setArrivalDates((current) => ({ ...current, [restock.id]: value }))
                  }
                  onMarkArrived={() => handleArrival(restock.id)}
                  isArriving={isArriving}
                  onChanged={() => router.refresh()}
                />
              ))
            )}

            {arrivalError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {arrivalError}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Arrived History</CardTitle>
          <CardDescription>
            Completed batches that already posted inventory into the ledger.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {arrivedRestocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed arrivals yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Arrival Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Lead Days</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {arrivedRestocks.map((restock) => {
                  const leadDays = getLeadDays(restock.order_date, restock.arrival_date)

                  return (
                    <TableRow key={restock.id}>
                      <TableCell>{formatDate(restock.order_date)}</TableCell>
                      <TableCell>{restock.arrival_date ? formatDate(restock.arrival_date) : "-"}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {restock.items.length === 0 ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            restock.items.map((item) => (
                              <div key={item.id}>
                                <div className="font-medium">{item.product_name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {item.sku} x{item.quantity}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{leadDays === null ? "-" : `${leadDays}d`}</TableCell>
                      <TableCell className="font-medium">{restock.vendor || "Restock Batch"}</TableCell>
                      <TableCell>{getModeLabel(restock.shipping_mode)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {restock.restock_status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(restock.total_amount)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
