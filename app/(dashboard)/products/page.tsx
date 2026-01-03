import { getProducts } from "@/lib/actions/products"
import { getStockOnHand } from "@/lib/actions/inventory"
import { getAllBundlesWithAvailability } from "@/lib/actions/bundles"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency } from "@/lib/utils"
import { Plus, Package, Settings } from "lucide-react"
import Link from "next/link"

export default async function ProductsPage() {
  const products = await getProducts()
  const stockData = await getStockOnHand()
  const bundles = await getAllBundlesWithAvailability()

  // Create a map for quick stock lookup
  const stockMap = new Map(stockData.map(s => [s.sku, s]))

  // Create bundle availability map
  const bundleMap = new Map(bundles.map(b => [b.sku, b]))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">Products</h1>
          <p className="text-muted-foreground">
            Manage your product catalog
          </p>
        </div>
        <Link href="/products/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center border rounded-lg p-12 bg-card">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No products yet</h3>
          <p className="text-muted-foreground mb-4 text-center">
            Get started by adding your first product to the inventory.
          </p>
          <Link href="/products/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add First Product
            </Button>
          </Link>
        </div>
      ) : (
        <div className="border rounded-lg bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead>Cost/Unit</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Reorder Point</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const stock = stockMap.get(product.sku)
                const bundle = bundleMap.get(product.sku)

                // For bundles, use computed availability; for regular products, use ledger stock
                const currentStock = product.is_bundle
                  ? (bundle?.available_stock || 0)
                  : (stock?.current_stock || 0)

                const isLowStock = product.is_bundle
                  ? (bundle?.is_low_stock || false)
                  : (stock?.is_low_stock || false)

                return (
                  <TableRow key={product.id}>
                    <TableCell className="font-mono font-medium">
                      {product.sku}
                    </TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {product.variant || '-'}
                    </TableCell>
                    <TableCell>{formatCurrency(product.cost_per_unit)}</TableCell>
                    <TableCell>
                      <span
                        className={
                          isLowStock
                            ? "font-semibold text-warning"
                            : "text-muted-foreground"
                        }
                      >
                        {currentStock}
                      </span>
                      {product.is_bundle && (
                        <span className="ml-1 text-xs text-muted-foreground">(computed)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {product.reorder_point}
                    </TableCell>
                    <TableCell>
                      {product.is_bundle ? (
                        <Badge variant="secondary">Bundle</Badge>
                      ) : (
                        <Badge variant="outline">Single</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {product.status === 'active' ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="outline">Discontinued</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {product.is_bundle && (
                          <Link href={`/products/${product.sku}/bundles`}>
                            <Button variant="ghost" size="sm">
                              <Settings className="h-4 w-4 mr-1" />
                              Bundle
                            </Button>
                          </Link>
                        )}
                        <Link href={`/products/${product.sku}/edit`}>
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
