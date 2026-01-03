"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Product } from "@/lib/types/database.types"

export async function getProducts() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching products:", error)
    return []
  }

  return data as Product[]
}

export async function getProductBySku(sku: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("sku", sku)
    .single()

  if (error) {
    console.error("Error fetching product:", error)
    return null
  }

  return data as Product
}

export async function createProduct(formData: {
  sku: string
  name: string
  variant: string | null
  cost_per_unit: number
  reorder_point: number
  is_bundle: boolean
  status: 'active' | 'discontinued'
}) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("products")
    .insert([formData])
    .select()
    .single()

  if (error) {
    console.error("Error creating product:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/products")
  revalidatePath("/dashboard")

  return { success: true, data }
}

export async function updateProduct(
  sku: string,
  formData: {
    name: string
    variant: string | null
    cost_per_unit: number
    reorder_point: number
    status: 'active' | 'discontinued'
  }
) {
  const supabase = await createClient()

  // Note: SKU cannot be updated (enforced by DB trigger)
  const { data, error } = await supabase
    .from("products")
    .update(formData)
    .eq("sku", sku)
    .select()
    .single()

  if (error) {
    console.error("Error updating product:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/products")
  revalidatePath("/dashboard")

  return { success: true, data }
}
