"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createProduct } from "@/lib/actions/products"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function NewProductPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)

    const data = {
      sku: formData.get("sku") as string,
      name: formData.get("name") as string,
      variant: (formData.get("variant") as string) || null,
      cost_per_unit: parseFloat(formData.get("cost_per_unit") as string),
      reorder_point: parseInt(formData.get("reorder_point") as string),
      is_bundle: formData.get("is_bundle") === "true",
      status: formData.get("status") as "active" | "discontinued",
    }

    const result = await createProduct(data)

    if (result.success) {
      router.push("/products")
    } else {
      setError(result.error || "Failed to create product")
      setLoading(false)
    }
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
          <CardTitle>Add New Product</CardTitle>
          <CardDescription>
            Create a new product in your inventory. SKU cannot be changed after creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="reorder_point" value="0" />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sku">
                  SKU <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="sku"
                  name="sku"
                  placeholder="PILLOW-001"
                  required
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Unique identifier (immutable)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">
                  Status <span className="text-destructive">*</span>
                </Label>
                <Select name="status" defaultValue="active" required>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="discontinued">Discontinued</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">
                Product Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                placeholder="Ergonomic Pillow"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="variant">Variant</Label>
              <Input
                id="variant"
                name="variant"
                placeholder="Standard, Premium, etc."
              />
              <p className="text-xs text-muted-foreground">
                Optional - e.g., size, color, edition
              </p>
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
                  placeholder="150000"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="is_bundle">
                Product Type <span className="text-destructive">*</span>
              </Label>
              <Select name="is_bundle" defaultValue="false" required>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Single Product</SelectItem>
                  <SelectItem value="true">Bundle</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Bundle composition configured in Phase 3
              </p>
            </div>

            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Product"}
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
