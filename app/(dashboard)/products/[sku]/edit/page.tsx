import { notFound } from "next/navigation"
import { getProductBySku } from "@/lib/actions/products"
import { EditProductForm } from "@/components/products/edit-product-form"

type Props = {
  params: Promise<{ sku: string }>
}

export default async function EditProductPage({ params }: Props) {
  const { sku } = await params
  const product = await getProductBySku(sku)

  if (!product) {
    notFound()
  }

  return <EditProductForm product={product} />
}
