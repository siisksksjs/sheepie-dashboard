import { notFound } from "next/navigation"
import { getProductEditWorkspace } from "@/lib/actions/products"
import { EditProductForm } from "@/components/products/edit-product-form"

type Props = {
  params: Promise<{ sku: string }>
}

export default async function EditProductPage({ params }: Props) {
  const { sku } = await params
  const workspace = await getProductEditWorkspace(sku)

  if (!workspace) {
    notFound()
  }

  return (
    <EditProductForm
      product={workspace.product}
      initialPackSizes={workspace.packSizes}
      channelPrices={workspace.channelPrices}
      cogsHistory={workspace.cogsHistory}
    />
  )
}
