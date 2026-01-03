"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getProductBySku } from "@/lib/actions/products"
import { getBundleCompositions, createBundleComposition, deleteBundleComposition } from "@/lib/actions/bundles"
import { getProducts } from "@/lib/actions/products"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Plus, Trash2, Package } from "lucide-react"
import Link from "next/link"
import type { Product, BundleComposition } from "@/lib/types/database.types"

export default function BundleCompositionPage({ params }: { params: Promise<{ sku: string }> }) {
  const router = useRouter()
  const [sku, setSku] = useState<string>("")
  const [product, setProduct] = useState<Product | null>(null)
  const [compositions, setCompositions] = useState<BundleComposition[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [selectedComponentSku, setSelectedComponentSku] = useState<string>("")
  const [quantity, setQuantity] = useState<number>(1)

  useEffect(() => {
    params.then((resolvedParams) => {
      setSku(resolvedParams.sku)
      loadData(resolvedParams.sku)
    })
    loadProducts()
  }, [params])

  const loadData = async (productSku: string) => {
    const productData = await getProductBySku(productSku)
    if (productData) {
      setProduct(productData)

      if (!productData.is_bundle) {
        setError("This product is not a bundle")
        setLoading(false)
        return
      }

      const comps = await getBundleCompositions(productSku)
      setCompositions(comps)
    } else {
      setError("Product not found")
    }
    setLoading(false)
  }

  const loadProducts = async () => {
    const data = await getProducts()
    // Only show non-bundle products as components
    setProducts(data.filter(p => !p.is_bundle && p.status === 'active'))
  }

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
      bundle_sku: sku,
      component_sku: selectedComponentSku,
      quantity,
    })

    if (result.success) {
      await loadData(sku)
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
      await loadData(sku)
    } else {
      setError(result.error || "Failed to remove component")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!product || error) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <p className="text-destructive mb-4">{error || "Product not found"}</p>
        <Link href="/products">
          <Button variant="outline">Back to Products</Button>
        </Link>
      </div>
    )
  }

  const productMap = new Map(products.map(p => [p.sku, p]))

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

            {/* Current Components */}
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
                  {compositions.map((comp) => {
                    const component = productMap.get(comp.component_sku)
                    return (
                      <TableRow key={comp.id}>
                        <TableCell className="font-mono text-sm">
                          {comp.component_sku}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{component?.name || "Unknown"}</div>
                          {component?.variant && (
                            <div className="text-sm text-muted-foreground">{component.variant}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {comp.quantity}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteComponent(comp.id)}
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

        {/* Add Component Form */}
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
                  <Select
                    value={selectedComponentSku}
                    onValueChange={setSelectedComponentSku}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a product" />
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
                </div>

                <div className="space-y-2">
                  <Label>Quantity per Bundle</Label>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value))}
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

        {/* Info Card */}
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
