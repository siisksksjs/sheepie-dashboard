"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { isValidPackSize } from "@/lib/products/pack-sizes"

const MAX_BYTES = 2 * 1024 * 1024
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }

export type ListingImageResult = { success: true; url: string } | { success: false; error: string }

/** Uploads (or replaces) the thumbnail for one SKU + pack size. */
export async function uploadListingImage(form: FormData): Promise<ListingImageResult> {
  const sku = String(form.get("sku") ?? "")
  const packSize = String(form.get("pack_size") ?? "")
  const file = form.get("file")
  if (!sku || !isValidPackSize(packSize)) return { success: false, error: "Unknown product or pack size." }
  if (!(file instanceof File) || file.size === 0) return { success: false, error: "Choose an image first." }
  if (!TYPES[file.type]) return { success: false, error: "Use a PNG, JPG or WebP image." }
  if (file.size > MAX_BYTES) return { success: false, error: "Keep images under 2 MB — square photos around 1000 px work best." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Sign in again to upload." }

  const slug = sku.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const path = `${slug}/${packSize}-${Date.now()}.${TYPES[file.type]}`
  const { error: uploadError } = await supabase.storage.from("listing-images").upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) return { success: false, error: uploadError.message }

  const { data: pub } = supabase.storage.from("listing-images").getPublicUrl(path)
  const { error: updateError } = await supabase.from("product_pack_sizes").update({ image_url: pub.publicUrl }).eq("sku", sku).eq("pack_size", packSize)
  if (updateError) return { success: false, error: updateError.message }

  revalidatePath("/products")
  revalidatePath("/dashboard")
  revalidatePath("/orders")
  return { success: true, url: pub.publicUrl }
}
