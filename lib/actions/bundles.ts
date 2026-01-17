"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { cache } from "react"
import type { BundleComposition } from "@/lib/types/database.types"

export async function getBundleCompositions(bundleSku?: string) {
  const supabase = await createClient()

  let query = supabase
    .from("bundle_compositions")
    .select("*")
    .order("created_at", { ascending: false })

  if (bundleSku) {
    query = query.eq("bundle_sku", bundleSku)
  }

  const { data, error } = await query

  if (error) {
    console.error("Error fetching bundle compositions:", error)
    return []
  }

  return data as BundleComposition[]
}

export async function createBundleComposition(formData: {
  bundle_sku: string
  component_sku: string
  quantity: number
}) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("bundle_compositions")
    .insert([formData])
    .select()
    .single()

  if (error) {
    console.error("Error creating bundle composition:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/products")
  revalidatePath("/dashboard")

  return { success: true, data }
}

export async function deleteBundleComposition(id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from("bundle_compositions")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("Error deleting bundle composition:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/products")
  revalidatePath("/dashboard")

  return { success: true }
}

/**
 * Calculate available stock for a bundle
 * Bundle stock = MIN(component_stock / required_quantity) for all components
 */
export async function getBundleAvailability(bundleSku: string): Promise<number> {
  const supabase = await createClient()

  // Get bundle compositions
  const { data: compositions } = await supabase
    .from("bundle_compositions")
    .select("*")
    .eq("bundle_sku", bundleSku)

  if (!compositions || compositions.length === 0) {
    return 0
  }

  // Get stock for all component SKUs
  const componentSkus = compositions.map(c => c.component_sku)
  const { data: stockData } = await supabase
    .from("stock_on_hand")
    .select("*")
    .in("sku", componentSkus)

  if (!stockData) {
    return 0
  }

  // Create stock map
  const stockMap = new Map(stockData.map(s => [s.sku, s.current_stock]))

  // Calculate min(component_stock / required_qty)
  let minAvailable = Infinity

  for (const comp of compositions) {
    const componentStock = stockMap.get(comp.component_sku) || 0
    const availableBundles = Math.floor(componentStock / comp.quantity)
    minAvailable = Math.min(minAvailable, availableBundles)
  }

  return minAvailable === Infinity ? 0 : minAvailable
}

/**
 * Get all bundles with their availability (OPTIMIZED - batched queries)
 */
async function _getAllBundlesWithAvailabilityInternal() {
  const supabase = await createClient()

  // Get all bundle products
  const { data: bundles } = await supabase
    .from("products")
    .select("*")
    .eq("is_bundle", true)
    .eq("status", "active")

  if (!bundles || bundles.length === 0) {
    return []
  }

  // OPTIMIZED: Fetch ALL compositions in ONE query
  const bundleSkus = bundles.map(b => b.sku)
  const { data: allCompositions } = await supabase
    .from("bundle_compositions")
    .select("*")
    .in("bundle_sku", bundleSkus)

  // OPTIMIZED: Get ALL component SKUs and fetch stock in ONE query
  const allComponentSkus = [...new Set((allCompositions || []).map(c => c.component_sku))]
  const { data: allStockData } = await supabase
    .from("stock_on_hand")
    .select("sku, current_stock")
    .in("sku", allComponentSkus)

  // Build lookup maps
  const stockMap = new Map((allStockData || []).map(s => [s.sku, s.current_stock]))
  const compositionsMap = new Map<string, BundleComposition[]>()
  for (const comp of allCompositions || []) {
    const existing = compositionsMap.get(comp.bundle_sku) || []
    existing.push(comp)
    compositionsMap.set(comp.bundle_sku, existing)
  }

  // Calculate availability for each bundle using the maps
  const bundlesWithAvailability = bundles.map((bundle) => {
    const compositions = compositionsMap.get(bundle.sku) || []

    // Calculate min(component_stock / required_qty)
    let minAvailable = Infinity
    for (const comp of compositions) {
      const componentStock = stockMap.get(comp.component_sku) || 0
      const availableBundles = Math.floor(componentStock / comp.quantity)
      minAvailable = Math.min(minAvailable, availableBundles)
    }

    const availability = compositions.length === 0 ? 0 : (minAvailable === Infinity ? 0 : minAvailable)

    return {
      ...bundle,
      available_stock: availability,
      is_low_stock: availability <= bundle.reorder_point,
      compositions,
    }
  })

  return bundlesWithAvailability
}

// Cached per request (deduplicates multiple calls in same render)
export const getAllBundlesWithAvailability = cache(async () => {
  return _getAllBundlesWithAvailabilityInternal()
})
