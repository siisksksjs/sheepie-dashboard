import { notFound } from "next/navigation"
import { getOrderById } from "@/lib/actions/orders"
import { getProducts } from "@/lib/actions/products"
import { OrderDetailClient } from "@/components/orders/order-detail-client"

type Props = {
  params: Promise<{ id: string }>
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params
  const [orderData, products] = await Promise.all([
    getOrderById(id),
    getProducts(),
  ])

  if (!orderData) {
    notFound()
  }

  return (
    <OrderDetailClient
      initialOrder={orderData.order}
      lineItems={orderData.lineItems}
      products={products}
    />
  )
}
