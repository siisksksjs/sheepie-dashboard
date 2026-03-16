"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Package, Plus, Trash2 } from "lucide-react"
import { createBundleComposition, deleteBundleComposition } from "@/lib/actions/bundles"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { BundleComposition, Product } from "@/lib/types/database.types"

type Props = {
  product: Product
  initialCompositions: BundleComposition[]
  products: Product[]
}

export function BundleCompositionClient({ product, initialCompositions, products }: Props) {
  const [compositions, setCompositions] = useState(initialCompositions)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedComponentSku, setSelectedComponentSku] = useState("")
  const [quantity, setQuantity] = useState(1)

  const handleAddComponent = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    if (!selectedComponentSku || quantity <= 0) {
      setError("Please select a component and enter a valid quantity")
      setSaving(false)
      return
    }

    const result = await createBundleComposition({
      bundle_sku: product.sku,
      component_sku: selectedComponentSku,
      quantity,
    })

    if (result.success && result.data) {
      setCompositions((current) => [result.data, ...current])
      setSelectedComponentSku("")
      setQuantity(1)
    } else {
      setError(result.error || "Failed to add component")
    }

    setSaving(false)
  }

  const handleDeleteComponent = async (id: string) => {
    if (!confirm("Remove this component from the bundle?")) return

    const result = await deleteBundleComposition(id)
    if (result.success) {
      setCompositions((current) => current.filter((composition) => composition.id !== id))
      setError(null)
    } else {
      setError(result.error || "Failed to remove component")
    }
  }

  const productMap = new Map(products.map((item) => [item.sku, item]))

  return (
    <div>
      <Link href="/products">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Products
        </Button>
      </Link>

      <div className="max-w-4xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Bundle Composition: {product.name}</CardTitle>
            <CardDescription>
              Define which products make up this bundle. When a bundle is sold, OUT entries are created for each component.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg mb-6">
              <Package className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Bundle SKU: {product.sku}</p>
                <p className="text-sm text-muted-foreground">
                  This bundle will never have direct ledger entries
                </p>
              </div>
            </div>

            {compositions.length === 0 ? (
              <div className="text-center py-8 border rounded-lg bg-muted/20">
                <p className="text-sm text-muted-foreground">
                  No components defined yet. Add components below.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity per Bundle</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compositions.map((composition) => {
                    const component = productMap.get(composition.component_sku)
                    return (
                      <TableRow key={composition.id}>
                        <TableCell className="font-mono text-sm">
                          {composition.component_sku}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{component?.name || "Unknown"}</div>
                          {component?.variant && (
                            <div className="text-sm text-muted-foreground">{component.variant}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {composition.quantity}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteComponent(composition.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add Component</CardTitle>
            <CardDescription>
              Select a product to include in this bundle
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddComponent} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Component Product</Label>
                  <Select value={selectedComponentSku} onValueChange={setSelectedComponentSku}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((item) => (
                        <SelectItem key={item.id} value={item.sku}>
                          <span className="font-mono text-sm">{item.sku}</span> - {item.name}
                          {item.variant && <span className="text-muted-foreground"> ({item.variant})</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Quantity per Bundle</Label>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={saving}>
                <Plus className="mr-2 h-4 w-4" />
                {saving ? "Adding..." : "Add Component"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">How Bundle Sales Work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>When you sell 1 bundle:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>No ledger entry is created for the bundle SKU itself</li>
              <li>OUT_SALE entries are created for each component (quantity × bundle qty)</li>
              <li>Component stock is reduced automatically</li>
            </ul>
            <p className="mt-4">
              <strong>Bundle availability:</strong>
            </p>
            <p className="ml-2">
              = MIN(component_stock ÷ required_quantity) for all components
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
