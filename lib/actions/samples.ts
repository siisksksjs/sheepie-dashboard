"use server"

import { createClient } from "@/lib/supabase/server"
import { createLedgerEntry } from "@/lib/actions/inventory"
import { prepareSample, type SampleInput } from "@/lib/inventory/samples"

export async function recordSample(input: SampleInput) {
  const prepared = prepareSample(input)
  if (prepared.error) return { success: false, error: prepared.error }
  const supabase = await createClient()
  const {
    data: { user },
    error
  } = await supabase.auth.getUser()
  if (error || !user)
    return { success: false, error: "Sign in again to record a sample." }
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("status")
    .eq("sku", prepared.entry.sku)
    .maybeSingle()
  if (productError || product?.status !== "active")
    return { success: false, error: "Choose an active product." }
  return createLedgerEntry(prepared.entry, {
    actionSummary: `Sample sent to ${prepared.details.recipient}`,
    notes: prepared.details.notes || null
  })
}
