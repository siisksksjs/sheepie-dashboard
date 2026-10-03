import Link from "next/link"
import { Layers, Pencil, Plus } from "lucide-react"
import { getProducts } from "@/lib/actions/products"
import { getStockOnHand } from "@/lib/actions/inventory"
import { getAllBundlesWithAvailability } from "@/lib/actions/bundles"
import { getReorderRecommendations } from "@/lib/actions/orders"
import { getListingImageMap } from "@/lib/actions/quick-log"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ListingThumb } from "@/components/listing-thumb"
import { PageHeader } from "@/components/ui/page"
import { cn, formatCurrency } from "@/lib/utils"
import { getBundleCompositionHref, getProductEditHref } from "@/lib/products/routes"

export const metadata = { title: "Products · Sheepie" }

export default async function ProductsPage() {
  const [products, stockData, bundles, reorderRecommendations, images] = await Promise.all([
    getProducts(),
    getStockOnHand(),
    getAllBundlesWithAvailability(),
    getReorderRecommendations(),
    getListingImageMap(),
  ])

  const stockMap = new Map(stockData.map((s) => [s.sku, s]))
  const bundleMap = new Map(bundles.map((b) => [b.sku, b]))
  // Dynamic reorder point from sales velocity; the most conservative route wins.
  const dynamicReorderPoints = new Map<string, { min: number; max: number }>()
  for (const rec of reorderRecommendations.recommendations) {
    const prev = dynamicReorderPoints.get(rec.sku)
    dynamicReorderPoints.set(rec.sku, { min: Math.max(prev?.min ?? 0, rec.reorderMin), max: Math.max(prev?.max ?? 0, rec.reorderMax) })
  }

  const active = products.filter((p) => p.status === "active")
  const singles = active.filter((p) => !p.is_bundle)
  const kits = active.filter((p) => p.is_bundle)
  const retired = products.filter((p) => p.status !== "active")

  const card = (product: (typeof products)[number]) => {
    const stock = stockMap.get(product.sku)
    const bundle = bundleMap.get(product.sku)
    const currentStock = product.is_bundle ? bundle?.available_stock || 0 : stock?.current_stock || 0
    const point = dynamicReorderPoints.get(product.sku)
    const reorderAt = point ? point.max : product.reorder_point
    const isLow = !product.is_bundle && reorderAt > 0 && currentStock <= reorderAt
    return (
      <li key={product.sku} className="glass group flex flex-col overflow-hidden rounded-[22px]">
        <div className="relative aspect-square w-full bg-white/50">
          <ListingThumb src={images[`${product.sku}:single`]} name={product.name} sku={product.sku} size={400} className="!h-full !w-full rounded-none border-0" />
          {isLow && <Badge variant="warning" className="absolute left-3 top-3">Reorder</Badge>}
          {product.status !== "active" && <Badge variant="outline" className="absolute left-3 top-3">Discontinued</Badge>}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <p className="font-semibold leading-snug">{product.name}</p>
          <p className="num mt-0.5 text-[12px] text-muted-foreground">
            {product.sku}
            {product.variant ? ` · ${product.variant}` : ""}
          </p>
          <dl className="num mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
            <div className="rounded-xl bg-white/55 px-3 py-2">
              <dt className="text-muted-foreground">{product.is_bundle ? "Can assemble" : "In stock"}</dt>
              <dd className={cn("font-display text-[18px] font-semibold", isLow && "text-[#b4561f]", currentStock < 0 && "text-destructive")}>{currentStock}</dd>
            </div>
            <div className="rounded-xl bg-white/55 px-3 py-2">
              <dt className="text-muted-foreground">{product.is_bundle ? "Kit cost" : "Unit cost"}</dt>
              <dd className="font-semibold">{formatCurrency(product.cost_per_unit)}</dd>
            </div>
          </dl>
          {!product.is_bundle && <p className="num mt-2 text-[12px] text-muted-foreground">{point ? `Reorder at ${point.min === point.max ? point.min : `${point.min}–${point.max}`} (from sales pace)` : `Reorder at ${product.reorder_point}`}</p>}
          <div className="mt-auto flex gap-2 pt-4">
            <Button asChild variant="outline" size="sm" className="flex-1">
              <Link href={getProductEditHref(product.sku)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit & photos
              </Link>
            </Button>
            {product.is_bundle && (
              <Button asChild variant="ghost" size="sm">
                <Link href={getBundleCompositionHref(product.sku)}>
                  <Layers className="mr-1.5 h-3.5 w-3.5" /> Contents
                </Link>
              </Button>
            )}
          </div>
        </div>
      </li>
    )
  }

  return (
    <div>
      <PageHeader
        title="Products"
        description="Your catalogue, pictured. Stock for kits is how many you can assemble from what's on the shelf."
        actions={
          <Button asChild>
            <Link href="/products/new">
              <Plus className="mr-1.5 h-4 w-4" /> Add product
            </Link>
          </Button>
        }
      />
      {products.length === 0 ? (
        <div className="glass flex flex-col items-center rounded-[22px] px-6 py-14 text-center">
          <h3 className="font-display text-lg font-semibold">No products yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Add your first product to start tracking stock.</p>
          <Button asChild className="mt-4">
            <Link href="/products/new">Add first product</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 font-display text-[20px] font-semibold">Products</h2>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{singles.map(card)}</ul>
          </section>
          {kits.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-[20px] font-semibold">Kits</h2>
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{kits.map(card)}</ul>
            </section>
          )}
          {retired.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-[20px] font-semibold text-muted-foreground">Discontinued</h2>
              <ul className="grid grid-cols-2 gap-3 opacity-70 md:grid-cols-3 xl:grid-cols-4">{retired.map(card)}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
