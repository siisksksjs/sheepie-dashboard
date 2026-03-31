"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type {
  ChangelogEntry,
  ChangelogEntryWithItems,
  ChangelogSource,
} from "@/lib/types/database.types"

export type ChangelogItemInput = {
  field_name: string
  old_value?: string | null
  new_value?: string | null
}

export type ChangelogEntryInput = {
  logged_at?: string | null
  area: string
  source: ChangelogSource
  action_summary: string
  entity_type: string
  entity_id?: string | null
  entity_label: string
  notes?: string | null
  items?: ChangelogItemInput[]
}

function normalizeText(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeItems(items?: ChangelogItemInput[]) {
  return (items || [])
    .map((item, index) => ({
      field_name: item.field_name.trim(),
      old_value: normalizeText(item.old_value),
      new_value: normalizeText(item.new_value),
      display_order: index,
    }))
    .filter((item) => item.field_name && (item.old_value !== null || item.new_value !== null))
}

function revalidateChangelogPaths() {
  revalidatePath("/changelog")
}

const AUTOMATIC_CHANGELOG_EVENT_ALLOWLIST = new Set([
  "Product went out of stock",
  "Product restocked",
  "Restock arrived from China",
])

function isAllowedInventoryActionSummary(actionSummary: string) {
  const normalized = actionSummary.trim()

  return (
    AUTOMATIC_CHANGELOG_EVENT_ALLOWLIST.has(normalized) ||
    normalized.endsWith("Purchase IN")
  )
}

function isAllowedAutomaticChangelogEvent(input: {
  area: string
  action_summary: string
}) {
  return (
    input.area.trim() === "inventory" &&
    isAllowedInventoryActionSummary(input.action_summary)
  )
}

function shouldShowChangelogEntry(
  entry: Pick<ChangelogEntry, "source" | "area" | "action_summary">
) {
  if (entry.source !== "automatic") {
    return true
  }

  return isAllowedAutomaticChangelogEvent(entry)
}

export async function getChangelogEntries(filters?: {
  limit?: number
  area?: string
  source?: ChangelogSource
}) {
  const supabase = await createClient()

  let query = supabase
    .from("changelog_entries")
    .select(`
      *,
      changelog_items (*)
    `)
    .order("logged_at", { ascending: false })

  if (filters?.area) {
    query = query.eq("area", filters.area)
  }

  if (filters?.source) {
    query = query.eq("source", filters.source)
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  const { data, error } = await query

  if (error) {
    console.error("Error fetching changelog entries:", error)
    return []
  }

  return ((data || []) as ChangelogEntryWithItems[])
    .filter((entry) => shouldShowChangelogEntry(entry))
    .map((entry) => ({
      ...entry,
      changelog_items: [...(entry.changelog_items || [])].sort(
        (a, b) => a.display_order - b.display_order
      ),
    }))
}

export async function getChangelogEntryById(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("changelog_entries")
    .select(`
      *,
      changelog_items (*)
    `)
    .eq("id", id)
    .single()

  if (error) {
    console.error("Error fetching changelog entry:", error)
    return null
  }

  const entry = data as ChangelogEntryWithItems
  return {
    ...entry,
    changelog_items: [...(entry.changelog_items || [])].sort(
      (a, b) => a.display_order - b.display_order
    ),
  }
}

export async function createChangelogEntry(input: ChangelogEntryInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const items = normalizeItems(input.items)

  const { data: entry, error: entryError } = await supabase
    .from("changelog_entries")
    .insert([{
      logged_at: input.logged_at || new Date().toISOString(),
      area: input.area.trim(),
      source: input.source,
      action_summary: input.action_summary.trim(),
      entity_type: input.entity_type.trim(),
      entity_id: normalizeText(input.entity_id),
      entity_label: input.entity_label.trim(),
      notes: normalizeText(input.notes),
      created_by: user?.id || null,
    }])
    .select()
    .single()

  if (entryError) {
    console.error("Error creating changelog entry:", entryError)
    return { success: false, error: entryError.message }
  }

  if (items.length > 0) {
    const { error: itemsError } = await supabase
      .from("changelog_items")
      .insert(items.map((item) => ({
        ...item,
        entry_id: entry.id,
      })))

    if (itemsError) {
      console.error("Error creating changelog items:", itemsError)
      return { success: false, error: itemsError.message }
    }
  }

  revalidateChangelogPaths()
  return { success: true, data: entry as ChangelogEntry }
}

export async function createManualChangelogEntry(
  input: Omit<ChangelogEntryInput, "source"> & { source?: ChangelogSource }
) {
  return createChangelogEntry({
    ...input,
    source: input.source || "manual",
  })
}

function shouldRecordAutomaticChangelogEntry(
  input: Omit<ChangelogEntryInput, "source"> & { source?: ChangelogSource }
) {
  return isAllowedAutomaticChangelogEvent(input)
}

export async function updateChangelogEntry(
  id: string,
  input: Omit<ChangelogEntryInput, "source"> & { source: ChangelogSource }
) {
  const supabase = await createClient()
  const items = normalizeItems(input.items)

  const { data: entry, error: entryError } = await supabase
    .from("changelog_entries")
    .update({
      logged_at: input.logged_at || new Date().toISOString(),
      area: input.area.trim(),
      source: input.source,
      action_summary: input.action_summary.trim(),
      entity_type: input.entity_type.trim(),
      entity_id: normalizeText(input.entity_id),
      entity_label: input.entity_label.trim(),
      notes: normalizeText(input.notes),
    })
    .eq("id", id)
    .select()
    .single()

  if (entryError) {
    console.error("Error updating changelog entry:", entryError)
    return { success: false, error: entryError.message }
  }

  const { error: deleteError } = await supabase
    .from("changelog_items")
    .delete()
    .eq("entry_id", id)

  if (deleteError) {
    console.error("Error replacing changelog items:", deleteError)
    return { success: false, error: deleteError.message }
  }

  if (items.length > 0) {
    const { error: itemsError } = await supabase
      .from("changelog_items")
      .insert(items.map((item) => ({
        ...item,
        entry_id: id,
      })))

    if (itemsError) {
      console.error("Error updating changelog items:", itemsError)
      return { success: false, error: itemsError.message }
    }
  }

  revalidateChangelogPaths()
  revalidatePath(`/changelog/${id}/edit`)
  return { success: true, data: entry as ChangelogEntry }
}

export async function safeRecordAutomaticChangelogEntry(
  input: Omit<ChangelogEntryInput, "source"> & { source?: ChangelogSource }
) {
  try {
    if (!shouldRecordAutomaticChangelogEntry(input)) {
      return { success: true, skipped: true as const }
    }

    return await createChangelogEntry({
      ...input,
      source: input.source || "automatic",
    })
  } catch (error) {
    console.error("Unexpected error recording changelog entry:", error)
    return { success: false, error: "Unexpected changelog error" }
  }
}
