import { notFound } from "next/navigation"
import { getProductEditWorkspace } from "@/lib/actions/products"
import { EditProductForm } from "@/components/products/edit-product-form"
import { ListingPhotos } from "@/components/products/listing-photos"
import { decodeProductSkuParam } from "@/lib/products/routes"

type Props = {
  params: Promise<{ sku: string }>
}

export default async function EditProductPage({ params }: Props) {
  const { sku: skuParam } = await params
  const sku = decodeProductSkuParam(skuParam)
  const workspace = await getProductEditWorkspace(sku)

  if (!workspace) {
    notFound()
  }

  const listings = workspace.packSizes
    .filter((p) => p.is_enabled)
    .map((p) => ({ packSize: p.pack_size, imageUrl: p.image_url ?? null }))

  return (
    <div className="space-y-5">
      {listings.length > 0 && <ListingPhotos sku={workspace.product.sku} name={workspace.product.name} listings={listings} />}
      <EditProductForm
        product={workspace.product}
        initialPackSizes={workspace.packSizes}
        channelPrices={workspace.channelPrices}
        cogsHistory={workspace.cogsHistory}
      />
    </div>
  )
}
