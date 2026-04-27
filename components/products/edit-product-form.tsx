"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { updateProduct } from "@/lib/actions/products"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Product, ProductChannelPackPrice, ProductPackSize } from "@/lib/types/database.types"
import type { ProductCogsHistoryEntry } from "@/lib/products/cogs-history"
import { ProductPackSettings } from "./product-pack-settings"
import { ProductChannelPricing } from "./product-channel-pricing"
import { ProductCogsHistory } from "./product-cogs-history"

type Props = {
  product: Product
  initialPackSizes: ProductPackSize[]
  channelPrices: ProductChannelPackPrice[]
  cogsHistory: ProductCogsHistoryEntry[]
}

export function EditProductForm({
  product,
  initialPackSizes,
  channelPrices,
  cogsHistory,
}: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [packSizes, setPackSizes] = useState<ProductPackSize[]>(initialPackSizes)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get("name") as string,
      variant: (formData.get("variant") as string) || null,
      cost_per_unit: parseFloat(formData.get("cost_per_unit") as string),
      reorder_point: parseInt(formData.get("reorder_point") as string),
      status: formData.get("status") as "active" | "discontinued",
    }

    const result = await updateProduct(product.sku, data)

    if (result.success) {
      router.push("/products")
    } else {
      setError(result.error || "Failed to update product")
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/products">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Products
        </Button>
      </Link>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Edit Product</CardTitle>
          <CardDescription>
            Update product details. SKU cannot be changed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="reorder_point" defaultValue={product.reorder_point} />

            <div className="space-y-2">
              <Label>SKU (Immutable)</Label>
              <Input value={product.sku} disabled className="font-mono bg-muted" />
              <p className="text-xs text-muted-foreground">
                SKU cannot be modified after creation
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">
                Product Name <span className="text-destructive">*</span>
              </Label>
              <Input id="name" name="name" defaultValue={product.name} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="variant">Variant</Label>
              <Input
                id="variant"
                name="variant"
                defaultValue={product.variant || ""}
                placeholder="Standard, Premium, etc."
              />
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cost_per_unit">
                  Cost per Unit (IDR) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="cost_per_unit"
                  name="cost_per_unit"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={product.cost_per_unit}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">
                Status <span className="text-destructive">*</span>
              </Label>
              <Select name="status" defaultValue={product.status} required>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="discontinued">Discontinued</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> Product type cannot be changed after creation.
                This product is a {product.is_bundle ? "bundle" : "single product"}.
              </p>
            </div>

            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Link href="/products">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <ProductPackSettings
        sku={product.sku}
        packSizes={packSizes}
        onSaved={setPackSizes}
      />
      <ProductChannelPricing
        sku={product.sku}
        packSizes={packSizes}
        channelPrices={channelPrices}
      />
      <ProductCogsHistory product={product} history={cogsHistory} />
    </div>
  )
}
