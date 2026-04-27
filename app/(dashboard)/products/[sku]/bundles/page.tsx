import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getBundleCompositions } from "@/lib/actions/bundles"
import { getProductBySku, getProducts } from "@/lib/actions/products"
import { BundleCompositionClient } from "@/components/products/bundle-composition-client"
import { Button } from "@/components/ui/button"
import { decodeProductSkuParam } from "@/lib/products/routes"

type Props = {
  params: Promise<{ sku: string }>
}

export default async function BundleCompositionPage({ params }: Props) {
  const { sku: skuParam } = await params
  const sku = decodeProductSkuParam(skuParam)
  const [product, compositions, allProducts] = await Promise.all([
    getProductBySku(sku),
    getBundleCompositions(sku),
    getProducts(),
  ])

  if (!product) {
    notFound()
  }

  if (!product.is_bundle) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <p className="text-destructive mb-4">This product is not a bundle</p>
        <Link href="/products">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Products
          </Button>
        </Link>
      </div>
    )
  }

  const componentProducts = allProducts.filter((item) => !item.is_bundle && item.status === "active")

  return (
    <BundleCompositionClient
      product={product}
      initialCompositions={compositions}
      products={componentProducts}
    />
  )
}
