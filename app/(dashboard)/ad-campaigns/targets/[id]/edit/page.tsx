import { notFound } from "next/navigation"

import { TargetForm } from "@/components/ad-campaigns/target-form"
import { getSkuSalesTargetById } from "@/lib/actions/ad-campaigns"
import { getProducts } from "@/lib/actions/products"

type Props = {
  params: Promise<{ id: string }>
}

export default async function EditSkuSalesTargetPage({ params }: Props) {
  const { id } = await params
  const [products, target] = await Promise.all([
    getProducts(),
    getSkuSalesTargetById(id),
  ])

  if (!target) {
    notFound()
  }

  return <TargetForm mode="edit" products={products} initialRecord={target} />
}
