"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getProductBySku, updateProduct } from "@/lib/actions/products"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import type { Product } from "@/lib/types/database.types"

export default function EditProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const router = useRouter()
  const [sku, setSku] = useState<string>("")
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    params.then((resolvedParams) => {
      setSku(resolvedParams.sku)
      loadProduct(resolvedParams.sku)
    })
  }, [params])

  const loadProduct = async (productSku: string) => {
    const data = await getProductBySku(productSku)
    if (data) {
      setProduct(data)
    } else {
      setError("Product not found")
    }
    setLoading(false)
  }

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

    const result = await updateProduct(sku, data)

    if (result.success) {
      router.push("/products")
    } else {
      setError(result.error || "Failed to update product")
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <p className="text-destructive mb-4">Product not found</p>
        <Link href="/products">
          <Button variant="outline">Back to Products</Button>
        </Link>
      </div>
    )
  }

  return (
    <div>
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
            <input type="hidden" name="reorder_point" defaultValue={product.reorder_point} />

            <div className="space-y-2">
              <Label>SKU (Immutable)</Label>
              <Input
                value={product.sku}
                disabled
                className="font-mono bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                SKU cannot be modified after creation
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">
                Product Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                defaultValue={product.name}
                required
              />
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
                <strong>Note:</strong> Bundle status cannot be changed after creation.
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
    </div>
  )
}
