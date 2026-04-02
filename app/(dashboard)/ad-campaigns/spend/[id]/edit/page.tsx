import { notFound } from "next/navigation"

import { SpendForm } from "@/components/ad-campaigns/spend-form"
import { getMonthlyAdSpendById } from "@/lib/actions/ad-campaigns"
import { getProducts } from "@/lib/actions/products"

type Props = {
  params: Promise<{ id: string }>
}

export default async function EditMonthlyAdSpendPage({ params }: Props) {
  const { id } = await params
  const [products, spendRow] = await Promise.all([
    getProducts(),
    getMonthlyAdSpendById(id),
  ])

  if (!spendRow) {
    notFound()
  }

  return <SpendForm mode="edit" products={products} initialRecord={spendRow} />
}
