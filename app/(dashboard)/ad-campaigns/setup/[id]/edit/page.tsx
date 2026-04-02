import { notFound } from "next/navigation"

import { SetupForm } from "@/components/ad-campaigns/setup-form"
import { getSkuAdSetupById } from "@/lib/actions/ad-campaigns"
import { getProducts } from "@/lib/actions/products"

type Props = {
  params: Promise<{ id: string }>
}

export default async function EditSkuAdSetupPage({ params }: Props) {
  const { id } = await params
  const [products, setup] = await Promise.all([
    getProducts(),
    getSkuAdSetupById(id),
  ])

  if (!setup) {
    notFound()
  }

  return <SetupForm mode="edit" products={products} initialRecord={setup} />
}
