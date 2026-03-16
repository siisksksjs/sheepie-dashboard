"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createLedgerEntry } from "@/lib/actions/inventory"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { MovementType, Product } from "@/lib/types/database.types"

const movementTypes: { value: MovementType; label: string; isInbound: boolean }[] = [
  { value: "IN_PURCHASE", label: "Purchase In (+)", isInbound: true },
  { value: "OUT_SALE", label: "Sale Out (-)", isInbound: false },
  { value: "OUT_PROMO", label: "Promotional Giveaway (-)", isInbound: false },
  { value: "OUT_DAMAGE", label: "Damage/Loss (-)", isInbound: false },
  { value: "RETURN", label: "Customer Return (+)", isInbound: true },
  { value: "ADJUSTMENT", label: "Adjustment (+/-)", isInbound: true },
]

type Props = {
  products: Product[]
}

export function NewLedgerEntryForm({ products }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedMovementType, setSelectedMovementType] = useState<MovementType | "">("")
  const [quantity, setQuantity] = useState("")
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const movementType = formData.get("movement_type") as MovementType
    const rawQuantity = parseInt(formData.get("quantity") as string, 10)
    const movementInfo = movementTypes.find((movement) => movement.value === movementType)
    const isInbound = movementInfo?.isInbound || false
    const signedQuantity = movementType === "ADJUSTMENT"
      ? rawQuantity
      : isInbound
        ? Math.abs(rawQuantity)
        : -Math.abs(rawQuantity)

    const result = await createLedgerEntry({
      sku: formData.get("sku") as string,
      movement_type: movementType,
      quantity: signedQuantity,
      reference: (formData.get("reference") as string) || null,
      entry_date: (formData.get("entry_date") as string) || null,
    })

    if (result.success) {
      router.push("/ledger")
    } else {
      setError(result.error || "Failed to create ledger entry")
      setSaving(false)
    }
  }

  return (
    <div>
      <Link href="/ledger">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Ledger
        </Button>
      </Link>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Add Ledger Entry</CardTitle>
          <CardDescription>
            Record an inventory movement. Entries are immutable once created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="sku">
                Product <span className="text-destructive">*</span>
              </Label>
              <Select name="sku" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.sku}>
                      <span className="font-mono text-sm">{product.sku}</span> - {product.name}
                      {product.variant && <span className="text-muted-foreground"> ({product.variant})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="movement_type">
                Movement Type <span className="text-destructive">*</span>
              </Label>
              <Select
                name="movement_type"
                required
                onValueChange={(value) => setSelectedMovementType(value as MovementType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select movement type" />
                </SelectTrigger>
                <SelectContent>
                  {movementTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="entry_date">
                Entry Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="entry_date"
                name="entry_date"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Set the date for this inventory movement. Defaults to today.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">
                Quantity <span className="text-destructive">*</span>
              </Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                placeholder={selectedMovementType === "ADJUSTMENT" ? "Enter +/- value" : "Enter quantity"}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                {selectedMovementType === "ADJUSTMENT"
                  ? "For ADJUSTMENT: use positive (+) to add stock, negative (-) to reduce stock"
                  : "Enter quantity as a positive number. Sign will be applied automatically based on movement type."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference">Reference / Notes</Label>
              <Input
                id="reference"
                name="reference"
                placeholder="e.g., Order #1234, Supplier invoice, etc."
              />
              <p className="text-xs text-muted-foreground">
                Optional - can be updated later if needed
              </p>
            </div>

            <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <p className="text-sm text-warning-foreground">
                <strong>Warning:</strong> Ledger entries cannot be deleted or modified after creation.
                To fix mistakes, create an ADJUSTMENT entry.
              </p>
            </div>

            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create Entry"}
              </Button>
              <Link href="/ledger">
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
