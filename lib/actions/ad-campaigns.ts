"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  buildMonthlyAdsReportBundle,
  createMonthlyAdsReportLoadErrorBundle,
  endOfMonthIso,
  normalizeMonthStart,
  type MonthlyAdsReportBundle,
  type MonthlyAdsReportOrder,
  type MonthlyAdsReportProduct,
} from "../ads/reporting"
import {
  buildChannelScopeKey,
  isChannel,
  normalizeChannels,
} from "../ads/channel-scopes"
import type {
  AdCampaign,
  AdPlatform,
  AdSpendEntry,
  CampaignStatus,
  Channel,
  FinanceAccount,
  MonthlyAdSpend,
  Order,
  OrderLineItem,
  SkuAdSetup,
  SkuSalesTarget,
} from "@/lib/types/database.types"
import { getLineItemTotalCost } from "@/lib/line-item-costs"
import { safeRecordAutomaticChangelogEntry } from "./changelog"
import { buildChangeItem } from "@/lib/changelog"

// ============================================================================
// CAMPAIGN CRUD OPERATIONS
// ============================================================================

export async function createCampaign(formData: {
  campaign_name: string
  platform: AdPlatform
  start_date: string
  end_date: string | null
  target_channels: Channel[]
  notes: string | null
  initial_spend?: number
}) {
  const supabase = await createClient()

  // Create campaign
  const { data: campaign, error: campaignError } = await supabase
    .from("ad_campaigns")
    .insert([{
      campaign_name: formData.campaign_name,
      platform: formData.platform,
      start_date: formData.start_date,
      end_date: formData.end_date,
      target_channels: formData.target_channels,
      notes: formData.notes,
      status: 'active',
    }])
    .select()
    .single()

  if (campaignError) {
    console.error("Error creating campaign:", campaignError)
    return { success: false, error: campaignError.message }
  }

  // If initial spend provided, create first spend entry
  if (formData.initial_spend && formData.initial_spend > 0) {
    const { error: spendError } = await supabase
      .from("ad_spend_entries")
      .insert([{
        campaign_id: campaign.id,
        entry_date: formData.start_date,
        amount: formData.initial_spend,
        notes: "Initial campaign budget",
      }])

    if (spendError) {
      console.error("Error adding initial spend:", spendError)
      // Don't fail the whole operation, just log the error
    }
  }

  revalidatePath("/ad-campaigns")

  await safeRecordAutomaticChangelogEntry({
    area: "ads",
    action_summary: "Created ad campaign",
    entity_type: "campaign",
    entity_id: campaign.id,
    entity_label: campaign.campaign_name,
    notes: campaign.notes,
    items: [
      buildChangeItem("Platform", null, campaign.platform),
      buildChangeItem("Start date", null, campaign.start_date),
      buildChangeItem("End date", null, campaign.end_date),
      buildChangeItem("Target channels", null, campaign.target_channels),
      buildChangeItem("Status", null, campaign.status),
      buildChangeItem("Initial spend", null, formData.initial_spend ?? null),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  })

  return { success: true, data: campaign }
}

export async function updateCampaign(
  id: string,
  formData: {
    campaign_name?: string
    end_date?: string | null
    target_channels?: Channel[]
    notes?: string | null
    status?: CampaignStatus
  }
) {
  const supabase = await createClient()

  const previousCampaign = await getCampaignById(id)
  if (!previousCampaign) {
    return { success: false, error: "Campaign not found" }
  }

  const { data, error } = await supabase
    .from("ad_campaigns")
    .update(formData)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("Error updating campaign:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/ad-campaigns")
  revalidatePath(`/ad-campaigns/${id}`)

  const items = [
    buildChangeItem("Campaign name", previousCampaign.campaign_name, data.campaign_name),
    buildChangeItem("End date", previousCampaign.end_date, data.end_date),
    buildChangeItem("Target channels", previousCampaign.target_channels, data.target_channels),
    buildChangeItem("Notes", previousCampaign.notes, data.notes),
    buildChangeItem("Status", previousCampaign.status, data.status),
  ].filter((item): item is NonNullable<typeof item> => Boolean(item))

  if (items.length > 0) {
    await safeRecordAutomaticChangelogEntry({
      area: "ads",
      action_summary: "Updated ad campaign",
      entity_type: "campaign",
      entity_id: data.id,
      entity_label: data.campaign_name,
      items,
    })
  }

  return { success: true, data }
}

export async function deleteCampaign(id: string) {
  const supabase = await createClient()

  const existingCampaign = await getCampaignById(id)

  const { error } = await supabase
    .from("ad_campaigns")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("Error deleting campaign:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/ad-campaigns")

  if (existingCampaign) {
    await safeRecordAutomaticChangelogEntry({
      area: "ads",
      action_summary: "Deleted ad campaign",
      entity_type: "campaign",
      entity_id: existingCampaign.id,
      entity_label: existingCampaign.campaign_name,
      notes: existingCampaign.notes,
      items: [
        buildChangeItem("Platform", existingCampaign.platform, null),
        buildChangeItem("Start date", existingCampaign.start_date, null),
        buildChangeItem("End date", existingCampaign.end_date, null),
        buildChangeItem("Target channels", existingCampaign.target_channels, null),
        buildChangeItem("Status", existingCampaign.status, null),
      ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    })
  }

  return { success: true }
}

export async function getCampaigns(filters?: { status?: CampaignStatus }) {
  const supabase = await createClient()

  let query = supabase
    .from("ad_campaigns")
    .select("*")
    .order("start_date", { ascending: false })

  if (filters?.status) {
    query = query.eq("status", filters.status)
  }

  const { data, error } = await query

  if (error) {
    console.error("Error fetching campaigns:", error)
    return []
  }

  return data as AdCampaign[]
}

export async function getCampaignById(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("id", id)
    .single()

  if (error) {
    console.error("Error fetching campaign:", error)
    return null
  }

  return data as AdCampaign
}

export async function completeCampaign(id: string) {
  const today = new Date().toISOString().split('T')[0]

  return updateCampaign(id, {
    status: 'completed',
    end_date: today,
  })
}

// ============================================================================
// SPEND ENTRY OPERATIONS
// ============================================================================

export async function addSpendEntry(formData: {
  campaign_id: string
  entry_date: string
  amount: number
  finance_account_id?: string | null
  payment_method: string | null
  notes: string | null
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let financeAccount: FinanceAccount | null = null
  if (formData.finance_account_id) {
    const { data: account, error: accountError } = await supabase
      .from("finance_accounts")
      .select("*")
      .eq("id", formData.finance_account_id)
      .single()

    if (accountError || !account) {
      console.error("Error fetching finance account for ad spend:", accountError)
      return { success: false, error: "Finance account not found" }
    }

    financeAccount = account as FinanceAccount
  }

  const { data: category, error: categoryError } = await supabase
    .from("finance_categories")
    .select("id, name")
    .eq("name", "Advertising")
    .single()

  if (categoryError || !category) {
    console.error("Error fetching advertising finance category:", categoryError)
    return { success: false, error: "Advertising finance category not found" }
  }

  const { data, error } = await supabase
    .from("ad_spend_entries")
    .insert([{
      campaign_id: formData.campaign_id,
      entry_date: formData.entry_date,
      amount: formData.amount,
      finance_account_id: formData.finance_account_id || null,
      payment_method: formData.payment_method,
      notes: formData.notes,
    }])
    .select()
    .single()

  if (error) {
    console.error("Error adding spend entry:", error)
    return { success: false, error: error.message }
  }

  const spendEntry = data as AdSpendEntry

  if (financeAccount) {
    const { data: financeEntry, error: financeError } = await supabase
      .from("finance_entries")
      .insert([{
        entry_date: formData.entry_date,
        account_id: financeAccount.id,
        category_id: category.id,
        direction: "out",
        amount: formData.amount,
        source: "automatic",
        reference_type: "ad_spend_entry",
        reference_id: data.id,
        vendor: null,
        notes: formData.notes,
        created_by: user?.id || null,
      }])
      .select()
      .single()

    if (financeError) {
      console.error("Error creating linked finance entry for ad spend:", financeError)
      await supabase.from("ad_spend_entries").delete().eq("id", data.id)
      return { success: false, error: financeError.message }
    }

    const { error: linkError } = await supabase
      .from("ad_spend_entries")
      .update({ finance_entry_id: financeEntry.id })
      .eq("id", data.id)

    if (linkError) {
      console.error("Error linking finance entry to ad spend entry:", linkError)
      return { success: false, error: linkError.message }
    }

    spendEntry.finance_entry_id = financeEntry.id
  }

  revalidatePath("/ad-campaigns")
  revalidatePath(`/ad-campaigns/${formData.campaign_id}`)
  revalidatePath("/finance")

  const campaign = await getCampaignById(formData.campaign_id)
  await safeRecordAutomaticChangelogEntry({
    area: "ads",
    action_summary: "Added ad spend entry",
    entity_type: "campaign",
    entity_id: formData.campaign_id,
    entity_label: campaign?.campaign_name || `Campaign ${formData.campaign_id}`,
    notes: spendEntry.notes,
    items: [
      buildChangeItem("Entry date", null, spendEntry.entry_date),
      buildChangeItem("Amount", null, spendEntry.amount),
      buildChangeItem("Funding account", null, financeAccount?.name || null),
      buildChangeItem("Payment method", null, spendEntry.payment_method),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  })

  return { success: true, data: spendEntry }
}

export async function getSpendEntries(campaignId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("ad_spend_entries")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("entry_date", { ascending: false })

  if (error) {
    console.error("Error fetching spend entries:", error)
    return []
  }

  return data as AdSpendEntry[]
}

export async function deleteSpendEntry(id: string, campaignId: string) {
  const supabase = await createClient()

  const { data: existingSpend } = await supabase
    .from("ad_spend_entries")
    .select("*")
    .eq("id", id)
    .single()

  const { error } = await supabase
    .from("ad_spend_entries")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("Error deleting spend entry:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/ad-campaigns")
  revalidatePath(`/ad-campaigns/${campaignId}`)
  revalidatePath("/finance")

  if (existingSpend?.finance_entry_id) {
    const { error: financeDeleteError } = await supabase
      .from("finance_entries")
      .delete()
      .eq("id", existingSpend.finance_entry_id)

    if (financeDeleteError) {
      console.error("Error deleting linked finance entry for ad spend:", financeDeleteError)
      return { success: false, error: financeDeleteError.message }
    }
  }

  if (existingSpend) {
    const campaign = await getCampaignById(campaignId)
    let financeAccountName: string | null = null
    if (existingSpend.finance_account_id) {
      const { data: financeAccount } = await supabase
        .from("finance_accounts")
        .select("name")
        .eq("id", existingSpend.finance_account_id)
        .single()
      financeAccountName = financeAccount?.name || null
    }
    await safeRecordAutomaticChangelogEntry({
      area: "ads",
      action_summary: "Deleted ad spend entry",
      entity_type: "campaign",
      entity_id: campaignId,
      entity_label: campaign?.campaign_name || `Campaign ${campaignId}`,
      notes: existingSpend.notes,
      items: [
        buildChangeItem("Entry date", existingSpend.entry_date, null),
        buildChangeItem("Amount", existingSpend.amount, null),
        buildChangeItem("Funding account", financeAccountName, null),
        buildChangeItem("Payment method", existingSpend.payment_method, null),
      ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    })
  }

  return { success: true }
}

// ============================================================================
// SKU ADS WORKSPACE
// ============================================================================

export async function createSkuAdSetup(input: {
  sku: string
  channels?: Channel[]
  channel?: Channel | null
  objective: string
  daily_budget_cap: number
  start_date: string
  end_date: string | null
  notes: string | null
}) {
  const normalizedChannels = resolveScopeChannels(input)
  const validationError = validateSkuAdSetupWrite({
    ...input,
    channels: getRawScopeChannels(input),
  })
  if (validationError) {
    return { success: false, error: validationError }
  }

  const supabase = await createClient()
  const normalizedInput = {
    ...input,
    sku: normalizeTextValue(input.sku),
    objective: normalizeTextValue(input.objective),
    notes: normalizeNullableTextValue(input.notes),
    channels: normalizedChannels,
  }

  const { data, error } = await supabase
    .from("sku_ad_setups")
    .insert([
        {
          ...normalizedInput,
          channel_scope_key: buildChannelScopeKey(normalizedInput.channels),
          status: "active",
        },
    ])
    .select()
    .single()

  if (error) {
    console.error("Error creating SKU ad setup:", error)
    return { success: false, error: error.message }
  }

  revalidateAdsReportingPaths()

  return { success: true, data: data as SkuAdSetup }
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const VALID_SKU_AD_SETUP_STATUSES = new Set(["active", "paused", "ended"])

function isFiniteNumber(value: number) {
  return Number.isFinite(value)
}

function hasOwnProperties(value: object) {
  return Object.keys(value).length > 0
}

function normalizeTextValue(value: string | null | undefined) {
  if (typeof value !== "string") {
    return value
  }

  return value.trim()
}

function normalizeNullableTextValue(value: string | null | undefined) {
  const normalizedValue = normalizeTextValue(value)

  if (normalizedValue == null || normalizedValue === "") {
    return null
  }

  return normalizedValue
}

function removeUndefinedValues<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as Partial<T>
}

function isValidIsoDateString(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false
  }

  const [year, month, day] = value.split("-").map(Number)
  const parsedDate = new Date(Date.UTC(year, month - 1, day))

  return (
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day
  )
}

function validateOptionalIsoDateString(
  value: string | null | undefined,
  label: string,
) {
  if (value == null) {
    return null
  }

  if (!isValidIsoDateString(value)) {
    return `${label} must be a valid date in YYYY-MM-DD format`
  }

  return null
}

function validateRequiredIsoDateString(
  value: string | null | undefined,
  label: string,
) {
  if (!value) {
    return `${label} is required`
  }

  return validateOptionalIsoDateString(value, label)
}

function validateRequiredTextField(
  value: string | null | undefined,
  label: string,
) {
  if (typeof value !== "string" || value.trim() === "") {
    return `${label} is required`
  }

  return null
}

function validateOptionalTextField(
  value: string | null | undefined,
  label: string,
) {
  if (value == null) {
    return null
  }

  if (typeof value !== "string" || value.trim() === "") {
    return `${label} cannot be empty`
  }

  return null
}

function validateRequiredChannels(
  value: Channel[] | string[] | null | undefined,
  label: string,
) {
  if (!Array.isArray(value) || value.length === 0) {
    return `${label} is required`
  }

  if (!value.every((channel) => typeof channel === "string" && isChannel(channel))) {
    return `${label} is invalid`
  }

  return null
}

function resolveScopeChannels(input: {
  channels?: Channel[] | string[] | null
  channel?: Channel | string | null
}) {
  if (Array.isArray(input.channels) && input.channels.length > 0) {
    const validChannels: Channel[] = []

    for (const channel of input.channels) {
      if (isChannel(channel)) {
        validChannels.push(channel)
      }
    }

    return normalizeChannels(validChannels)
  }

  if (typeof input.channel === "string" && isChannel(input.channel)) {
    return normalizeChannels([input.channel])
  }

  return [] as Channel[]
}

function getRawScopeChannels(input: {
  channels?: Channel[] | string[] | null
  channel?: Channel | string | null
}) {
  if (Array.isArray(input.channels)) {
    return input.channels
  }

  if (typeof input.channel === "string") {
    return [input.channel]
  }

  return undefined
}

function validateOptionalChannels(
  value: Channel[] | string[] | null | undefined,
  label: string,
) {
  if (value == null) {
    return null
  }

  return validateRequiredChannels(value, label)
}

function validateOptionalSkuAdSetupStatus(
  value: UpdateSkuAdSetupInput["status"],
  label: string,
) {
  if (value == null) {
    return null
  }

  if (!VALID_SKU_AD_SETUP_STATUSES.has(value)) {
    return `${label} is invalid`
  }

  return null
}

function validateNonNegativeFiniteNumber(
  value: number | null | undefined,
  label: string,
) {
  if (value == null || !isFiniteNumber(value)) {
    return `${label} must be a finite number`
  }

  if (value < 0) {
    return `${label} cannot be negative`
  }

  return null
}

function validateOptionalNonNegativeFiniteNumber(
  value: number | null | undefined,
  label: string,
) {
  if (value == null) {
    return null
  }

  return validateNonNegativeFiniteNumber(value, label)
}

function getJakartaBusinessDate(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value

  return `${year}-${month}-${day}`
}

type UpdateSkuAdSetupInput = Partial<{
  sku: string
  channels: Channel[]
  channel: Channel | null
  objective: string
  daily_budget_cap: number
  start_date: string
  end_date: string | null
  status: "active" | "paused" | "ended"
  notes: string | null
}>

function validateDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  errorMessage: string,
) {
  if (typeof startDate === "string" && typeof endDate === "string" && endDate < startDate) {
    return errorMessage
  }

  return null
}

function validateSkuAdSetupWrite(
  input: Pick<
    UpdateSkuAdSetupInput,
    "sku" | "objective" | "daily_budget_cap" | "start_date" | "end_date"
  > & {
    channels?: Channel[] | string[]
  },
) {
  const skuError = validateRequiredTextField(input.sku, "SKU")
  if (skuError) {
    return skuError
  }

  const channelsError = validateRequiredChannels(input.channels, "Channels")
  if (channelsError) {
    return channelsError
  }

  const objectiveError = validateRequiredTextField(input.objective, "Objective")
  if (objectiveError) {
    return objectiveError
  }

  const dailyBudgetError = validateNonNegativeFiniteNumber(
    input.daily_budget_cap,
    "Daily budget cap",
  )
  if (dailyBudgetError) {
    return dailyBudgetError
  }

  const startDateError = validateRequiredIsoDateString(
    input.start_date,
    "Start date",
  )
  if (startDateError) {
    return startDateError
  }

  const endDateError = validateOptionalIsoDateString(input.end_date, "End date")
  if (endDateError) {
    return endDateError
  }

  return validateDateRange(
    input.start_date,
    input.end_date,
    "End date cannot be earlier than start date",
  )
}

function validateSkuAdSetupUpdate(input: UpdateSkuAdSetupInput) {
  if (!hasOwnProperties(input)) {
    return "At least one setup field must be updated"
  }

  const skuError = validateOptionalTextField(input.sku, "SKU")
  if (skuError) {
    return skuError
  }

  const channelsError = validateOptionalChannels(
    getRawScopeChannels(input),
    "Channels",
  )
  if (channelsError) {
    return channelsError
  }

  const objectiveError = validateOptionalTextField(input.objective, "Objective")
  if (objectiveError) {
    return objectiveError
  }

  const statusError = validateOptionalSkuAdSetupStatus(input.status, "Status")
  if (statusError) {
    return statusError
  }

  const dailyBudgetError = validateOptionalNonNegativeFiniteNumber(
    input.daily_budget_cap,
    "Daily budget cap",
  )
  if (dailyBudgetError) {
    return dailyBudgetError
  }

  const startDateError = validateOptionalIsoDateString(
    input.start_date,
    "Start date",
  )
  if (startDateError) {
    return startDateError
  }

  const endDateError = validateOptionalIsoDateString(input.end_date, "End date")
  if (endDateError) {
    return endDateError
  }

  return validateDateRange(
    input.start_date,
    input.end_date,
    "End date cannot be earlier than start date",
  )
}

export async function updateSkuAdSetup(
  id: string,
  input: UpdateSkuAdSetupInput,
) {
  const resolvedChannels =
    input.channels !== undefined || input.channel !== undefined
      ? resolveScopeChannels({
          channels: input.channels,
          channel: input.channel,
        })
      : undefined
  const normalizedInput = removeUndefinedValues({
    ...input,
    ...(input.sku !== undefined ? { sku: input.sku.trim() } : {}),
    channel: undefined,
    ...(resolvedChannels !== undefined ? { channels: resolvedChannels } : {}),
    ...(input.objective !== undefined ? { objective: input.objective.trim() } : {}),
    ...(input.notes !== undefined
      ? { notes: normalizeNullableTextValue(input.notes) }
      : {}),
  })

  const validationError = validateSkuAdSetupUpdate(normalizedInput)
  if (validationError) {
    return { success: false, error: validationError }
  }

  const supabase = await createClient()

  if (
    normalizedInput.start_date !== undefined ||
    normalizedInput.end_date !== undefined ||
    normalizedInput.status !== undefined
  ) {
    const { data: existingRow, error: existingRowError } = await supabase
      .from("sku_ad_setups")
      .select("start_date, end_date, status")
      .eq("id", id)
      .single()

    if (existingRowError) {
      console.error("Error loading SKU ad setup for validation:", existingRowError)
      return { success: false, error: existingRowError.message }
    }

    const mergedStatus = normalizedInput.status ?? existingRow.status
    const mergedEndDate =
      normalizedInput.end_date !== undefined
        ? normalizedInput.end_date
        : existingRow.end_date

    if (mergedStatus === "ended" && mergedEndDate == null) {
      normalizedInput.end_date = getJakartaBusinessDate()
    }

    const mergedRangeError = validateDateRange(
      normalizedInput.start_date ?? existingRow.start_date,
      normalizedInput.end_date !== undefined
        ? normalizedInput.end_date
        : existingRow.end_date,
      "End date cannot be earlier than start date",
    )

    if (mergedRangeError) {
      return { success: false, error: mergedRangeError }
    }
  }

  const updates = {
    ...normalizedInput,
    ...(normalizedInput.channels
      ? { channel_scope_key: buildChannelScopeKey(normalizedInput.channels) }
      : {}),
  }

  const { data, error } = await supabase
    .from("sku_ad_setups")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("Error updating SKU ad setup:", error)
    return { success: false, error: error.message }
  }

  revalidateAdsReportingPaths()

  return { success: true, data: data as SkuAdSetup }
}

export async function deleteSkuAdSetup(id: string) {
  return deleteAdsWorkspaceRow("sku_ad_setups", id, "Error deleting SKU ad setup:")
}

export async function pauseSkuAdSetup(id: string) {
  return updateSkuAdSetup(id, { status: "paused" })
}

export async function endSkuAdSetup(id: string) {
  const today = getJakartaBusinessDate()

  return updateSkuAdSetup(id, {
    status: "ended",
    end_date: today,
  })
}

type ReadLoaderResult<T> = {
  data: T[]
  load_error: string | null
}

export async function getSkuAdSetups() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("sku_ad_setups")
    .select("*")
    .order("start_date", { ascending: false })

  if (error) {
    console.error("Error fetching SKU ad setups:", error)
    return {
      data: [],
      load_error: error.message,
    } satisfies ReadLoaderResult<SkuAdSetup>
  }

  return {
    data: data as SkuAdSetup[],
    load_error: null,
  } satisfies ReadLoaderResult<SkuAdSetup>
}

export async function getSkuAdSetupById(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("sku_ad_setups")
    .select("*")
    .eq("id", id)
    .single()

  if (error) {
    console.error("Error fetching SKU ad setup:", error)
    return null
  }

  return data as SkuAdSetup
}

export async function upsertMonthlyAdSpend(input: {
  month: string
  sku: string
  channels?: Channel[]
  channel?: Channel | null
  actual_spend: number
  notes: string | null
}) {
  const normalizedChannels = resolveScopeChannels(input)
  const validationError = validateMonthlyAdSpendWrite({
    ...input,
    channels: getRawScopeChannels(input),
  })
  if (validationError) {
    return { success: false, error: validationError }
  }

  const supabase = await createClient()
  const normalizedInput = {
    ...input,
    sku: normalizeTextValue(input.sku),
    notes: normalizeNullableTextValue(input.notes),
    month: normalizeMonthStart(input.month),
    channels: normalizedChannels,
  }

  const { data, error } = await supabase
    .from("monthly_ad_spend")
    .upsert(
      [
        {
          ...normalizedInput,
          channel_scope_key: buildChannelScopeKey(normalizedInput.channels),
        },
      ],
      { onConflict: "month,sku,channel_scope_key" },
    )
    .select()
    .single()

  if (error) {
    console.error("Error upserting monthly ad spend:", error)
    return { success: false, error: error.message }
  }

  revalidateAdsReportingPaths()

  return { success: true, data: data as MonthlyAdSpend }
}

type UpdateMonthlyAdSpendInput = Partial<{
  month: string
  sku: string
  channels: Channel[]
  channel: Channel | null
  actual_spend: number
  notes: string | null
}>

function validateMonthlyAdSpendWrite(
  input: Pick<
    UpdateMonthlyAdSpendInput,
    "sku" | "month" | "actual_spend"
  > & {
    channels?: Channel[] | string[]
  },
) {
  const skuError = validateRequiredTextField(input.sku, "SKU")
  if (skuError) {
    return skuError
  }

  const channelsError = validateRequiredChannels(input.channels, "Channels")
  if (channelsError) {
    return channelsError
  }

  const actualSpendError = validateNonNegativeFiniteNumber(
    input.actual_spend,
    "Actual spend",
  )
  if (actualSpendError) {
    return actualSpendError
  }

  const monthError = validateRequiredIsoDateString(input.month, "Month")
  if (monthError) {
    return monthError
  }

  return null
}

function validateMonthlyAdSpendUpdate(input: UpdateMonthlyAdSpendInput) {
  if (!hasOwnProperties(input)) {
    return "At least one spend field must be updated"
  }

  const skuError = validateOptionalTextField(input.sku, "SKU")
  if (skuError) {
    return skuError
  }

  const channelsError = validateOptionalChannels(
    getRawScopeChannels(input),
    "Channels",
  )
  if (channelsError) {
    return channelsError
  }

  const actualSpendError = validateOptionalNonNegativeFiniteNumber(
    input.actual_spend,
    "Actual spend",
  )
  if (actualSpendError) {
    return actualSpendError
  }

  const monthError = validateOptionalIsoDateString(input.month, "Month")
  if (monthError) {
    return monthError
  }

  return null
}

export async function updateMonthlyAdSpend(
  id: string,
  input: UpdateMonthlyAdSpendInput,
) {
  const resolvedChannels =
    input.channels !== undefined || input.channel !== undefined
      ? resolveScopeChannels({
          channels: input.channels,
          channel: input.channel,
        })
      : undefined
  const normalizedInput = removeUndefinedValues({
    ...input,
    ...(input.sku !== undefined ? { sku: input.sku.trim() } : {}),
    channel: undefined,
    ...(resolvedChannels !== undefined ? { channels: resolvedChannels } : {}),
    ...(input.notes !== undefined
      ? { notes: normalizeNullableTextValue(input.notes) }
      : {}),
  })

  const validationError = validateMonthlyAdSpendUpdate(normalizedInput)
  if (validationError) {
    return { success: false, error: validationError }
  }

  const supabase = await createClient()
  const updates = {
    ...normalizedInput,
    ...(normalizedInput.month
      ? { month: normalizeMonthStart(normalizedInput.month) }
      : {}),
    ...(normalizedInput.channels
      ? { channel_scope_key: buildChannelScopeKey(normalizedInput.channels) }
      : {}),
  }

  const { data, error } = await supabase
    .from("monthly_ad_spend")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("Error updating monthly ad spend:", error)
    return { success: false, error: error.message }
  }

  revalidateAdsReportingPaths()

  return { success: true, data: data as MonthlyAdSpend }
}

export async function deleteMonthlyAdSpend(id: string) {
  return deleteAdsWorkspaceRow(
    "monthly_ad_spend",
    id,
    "Error deleting monthly ad spend:",
  )
}

export async function getMonthlyAdSpendRows(month: string) {
  const supabase = await createClient()
  const normalizedMonth = normalizeMonthStart(month)

  const { data, error } = await supabase
    .from("monthly_ad_spend")
    .select("*")
    .eq("month", normalizedMonth)

  if (error) {
    console.error("Error fetching monthly ad spend rows:", error)
    return {
      data: [],
      load_error: error.message,
    } satisfies ReadLoaderResult<MonthlyAdSpend>
  }

  return {
    data: (data as MonthlyAdSpend[]).sort((left, right) => {
      const leftScopeKey =
        left.channel_scope_key ??
        buildChannelScopeKey(resolveScopeChannels(left))
      const rightScopeKey =
        right.channel_scope_key ??
        buildChannelScopeKey(resolveScopeChannels(right))

      return (
        left.sku.localeCompare(right.sku) ||
        leftScopeKey.localeCompare(rightScopeKey)
      )
    }),
    load_error: null,
  } satisfies ReadLoaderResult<MonthlyAdSpend>
}

export async function getMonthlyAdSpendById(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("monthly_ad_spend")
    .select("*")
    .eq("id", id)
    .single()

  if (error) {
    console.error("Error fetching monthly ad spend row:", error)
    return null
  }

  return data as MonthlyAdSpend
}

export async function createSkuSalesTarget(input: {
  sku: string
  daily_target_units: number
  effective_from: string
  effective_to: string | null
  notes: string | null
}) {
  const validationError = validateSkuSalesTargetWrite(input)
  if (validationError) {
    return { success: false, error: validationError }
  }

  const supabase = await createClient()
  const normalizedInput = {
    ...input,
    sku: normalizeTextValue(input.sku),
    notes: normalizeNullableTextValue(input.notes),
  }

  const { data, error } = await supabase
    .from("sku_sales_targets")
    .insert([normalizedInput])
    .select()
    .single()

  if (error) {
    console.error("Error creating SKU sales target:", error)
    return { success: false, error: error.message }
  }

  revalidateAdsReportingPaths()

  return { success: true, data: data as SkuSalesTarget }
}

type UpdateSkuSalesTargetInput = Partial<{
  sku: string
  daily_target_units: number
  effective_from: string
  effective_to: string | null
  notes: string | null
}>

function validateSkuSalesTargetWrite(
  input: Pick<
    UpdateSkuSalesTargetInput,
    "sku" | "daily_target_units" | "effective_from" | "effective_to"
  >,
) {
  const skuError = validateRequiredTextField(input.sku, "SKU")
  if (skuError) {
    return skuError
  }

  const dailyTargetError = validateNonNegativeFiniteNumber(
    input.daily_target_units,
    "Daily target units",
  )
  if (dailyTargetError) {
    return dailyTargetError
  }

  const effectiveFromError = validateRequiredIsoDateString(
    input.effective_from,
    "Effective from",
  )
  if (effectiveFromError) {
    return effectiveFromError
  }

  const effectiveToError = validateOptionalIsoDateString(
    input.effective_to,
    "Effective to",
  )
  if (effectiveToError) {
    return effectiveToError
  }

  return validateDateRange(
    input.effective_from,
    input.effective_to,
    "Effective to cannot be earlier than effective from",
  )
}

function validateSkuSalesTargetUpdate(input: UpdateSkuSalesTargetInput) {
  if (!hasOwnProperties(input)) {
    return "At least one target field must be updated"
  }

  const skuError = validateOptionalTextField(input.sku, "SKU")
  if (skuError) {
    return skuError
  }

  const dailyTargetError = validateOptionalNonNegativeFiniteNumber(
    input.daily_target_units,
    "Daily target units",
  )
  if (dailyTargetError) {
    return dailyTargetError
  }

  const effectiveFromError = validateOptionalIsoDateString(
    input.effective_from,
    "Effective from",
  )
  if (effectiveFromError) {
    return effectiveFromError
  }

  const effectiveToError = validateOptionalIsoDateString(
    input.effective_to,
    "Effective to",
  )
  if (effectiveToError) {
    return effectiveToError
  }

  return validateDateRange(
    input.effective_from,
    input.effective_to,
    "Effective to cannot be earlier than effective from",
  )
}

export async function updateSkuSalesTarget(
  id: string,
  input: UpdateSkuSalesTargetInput,
) {
  const normalizedInput = removeUndefinedValues({
    ...input,
    ...(input.sku !== undefined ? { sku: input.sku.trim() } : {}),
    ...(input.notes !== undefined
      ? { notes: normalizeNullableTextValue(input.notes) }
      : {}),
  })

  const validationError = validateSkuSalesTargetUpdate(normalizedInput)
  if (validationError) {
    return { success: false, error: validationError }
  }

  const supabase = await createClient()

  if (
    normalizedInput.effective_from !== undefined ||
    normalizedInput.effective_to !== undefined
  ) {
    const { data: existingRow, error: existingRowError } = await supabase
      .from("sku_sales_targets")
      .select("effective_from, effective_to")
      .eq("id", id)
      .single()

    if (existingRowError) {
      console.error("Error loading SKU sales target for validation:", existingRowError)
      return { success: false, error: existingRowError.message }
    }

    const mergedRangeError = validateDateRange(
      normalizedInput.effective_from ?? existingRow.effective_from,
      normalizedInput.effective_to !== undefined
        ? normalizedInput.effective_to
        : existingRow.effective_to,
      "Effective to cannot be earlier than effective from",
    )

    if (mergedRangeError) {
      return { success: false, error: mergedRangeError }
    }
  }

  const { data, error } = await supabase
    .from("sku_sales_targets")
    .update(normalizedInput)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("Error updating SKU sales target:", error)
    return { success: false, error: error.message }
  }

  revalidateAdsReportingPaths()

  return { success: true, data: data as SkuSalesTarget }
}

export async function deleteSkuSalesTarget(id: string) {
  return deleteAdsWorkspaceRow(
    "sku_sales_targets",
    id,
    "Error deleting SKU sales target:",
  )
}

export async function getSkuSalesTargets() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("sku_sales_targets")
    .select("*")

  if (error) {
    console.error("Error fetching SKU sales targets:", error)
    return {
      data: [],
      load_error: error.message,
    } satisfies ReadLoaderResult<SkuSalesTarget>
  }

  return {
    data: (data as SkuSalesTarget[]).sort((left, right) => {
      return (
        right.effective_from.localeCompare(left.effective_from) ||
        left.sku.localeCompare(right.sku)
      )
    }),
    load_error: null,
  } satisfies ReadLoaderResult<SkuSalesTarget>
}

export async function getSkuSalesTargetById(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("sku_sales_targets")
    .select("*")
    .eq("id", id)
    .single()

  if (error) {
    console.error("Error fetching SKU sales target:", error)
    return null
  }

  return data as SkuSalesTarget
}

export async function getMonthlyAdsReportBundle(
  month: string,
): Promise<MonthlyAdsReportBundle> {
  const supabase = await createClient()
  const monthStart = normalizeMonthStart(month)
  const monthEnd = endOfMonthIso(monthStart)

  const [ordersResult, productsResult, setupsResult, spendResult, targetsResult] =
    await Promise.all([
      supabase
        .from("orders")
        .select(`
          id,
          channel,
          order_date,
          status,
          channel_fees,
          order_line_items (
            sku,
            quantity,
            selling_price,
            cost_per_unit_snapshot
          )
        `)
        .gte("order_date", monthStart)
        .lte("order_date", monthEnd)
        .in("status", ["paid", "shipped"]),
      supabase.from("products").select("sku, name, variant, cost_per_unit"),
      supabase.from("sku_ad_setups").select("*"),
      supabase.from("monthly_ad_spend").select("*").eq("month", monthStart),
      supabase.from("sku_sales_targets").select("*"),
    ])

  if (ordersResult.error) {
    console.error("Error fetching monthly ads report orders:", ordersResult.error)
    return createMonthlyAdsReportLoadErrorBundle({
      month: monthStart,
      load_error: ordersResult.error.message,
    })
  }

  if (productsResult.error) {
    console.error("Error fetching monthly ads report products:", productsResult.error)
    return createMonthlyAdsReportLoadErrorBundle({
      month: monthStart,
      load_error: productsResult.error.message,
    })
  }

  if (setupsResult.error) {
    console.error("Error fetching monthly ads report setups:", setupsResult.error)
    return createMonthlyAdsReportLoadErrorBundle({
      month: monthStart,
      load_error: setupsResult.error.message,
    })
  }

  if (spendResult.error) {
    console.error("Error fetching monthly ads report spend:", spendResult.error)
    return createMonthlyAdsReportLoadErrorBundle({
      month: monthStart,
      load_error: spendResult.error.message,
    })
  }

  if (targetsResult.error) {
    console.error("Error fetching monthly ads report targets:", targetsResult.error)
    return createMonthlyAdsReportLoadErrorBundle({
      month: monthStart,
      load_error: targetsResult.error.message,
    })
  }

  return buildMonthlyAdsReportBundle({
    month: monthStart,
    orders: (ordersResult.data || []) as MonthlyAdsReportOrder[],
    products: (productsResult.data || []) as MonthlyAdsReportProduct[],
    setups: (setupsResult.data || []) as SkuAdSetup[],
    spendRows: (spendResult.data || []) as MonthlyAdSpend[],
    targets: (targetsResult.data || []) as SkuSalesTarget[],
  })
}

function revalidateAdsReportingPaths() {
  revalidatePath("/ad-campaigns")
  revalidatePath("/reports")
}

async function deleteAdsWorkspaceRow(
  table: "sku_ad_setups" | "monthly_ad_spend" | "sku_sales_targets",
  id: string,
  errorLabel: string,
) {
  const supabase = await createClient()

  const { error } = await supabase.from(table).delete().eq("id", id)

  if (error) {
    console.error(errorLabel, error)
    return { success: false, error: error.message }
  }

  revalidateAdsReportingPaths()

  return { success: true }
}

// ============================================================================
// ANALYTICS & METRICS
// ============================================================================

type AttributedOrderMetric = {
  id: string
  order_id: string
  channel: Channel
  order_date: string
  status: string
  revenue: number
  net_profit: number
  line_items_with_names: Array<{
    id: string
    sku: string
    quantity: number
    selling_price: number
    cost_per_unit_snapshot: number | null
    product_name: string
  }>
}

type CampaignMetricOrder = Pick<
  Order,
  "id" | "order_id" | "channel" | "order_date" | "status" | "channel_fees"
> & {
  order_line_items: Array<
    Pick<
      OrderLineItem,
      "id" | "sku" | "quantity" | "selling_price" | "cost_per_unit_snapshot"
    >
  >
}

type CampaignMetric = {
  campaign: AdCampaign
  total_spend: number
  orders_count: number
  revenue: number
  profit: number
  roas: number
  cost_per_order: number
  attributed_orders: AttributedOrderMetric[]
}

async function getCampaignMetricsBatch(options?: {
  campaignIds?: string[]
  status?: CampaignStatus
  includeAttributedOrders?: boolean
}) {
  const supabase = await createClient()

  let campaignsQuery = supabase
    .from("ad_campaigns")
    .select("*")
    .order("start_date", { ascending: false })

  if (options?.status) {
    campaignsQuery = campaignsQuery.eq("status", options.status)
  }

  if (options?.campaignIds?.length) {
    campaignsQuery = campaignsQuery.in("id", options.campaignIds)
  }

  const { data: campaigns, error: campaignsError } = await campaignsQuery

  if (campaignsError) {
    console.error("Error fetching campaigns for metrics:", campaignsError)
    return {
      campaigns: [] as AdCampaign[],
      summaries: [] as Array<{
        id: string
        campaign_name: string
        platform: AdPlatform
        start_date: string
        end_date: string | null
        target_channels: Channel[]
        status: CampaignStatus
        total_spend: number
        orders_count: number
        revenue: number
        profit: number
        roas: number
        cost_per_order: number
      }>,
      metricsById: new Map<string, CampaignMetric>(),
    }
  }

  if (!campaigns || campaigns.length === 0) {
    return {
      campaigns: [] as AdCampaign[],
      summaries: [] as Array<{
        id: string
        campaign_name: string
        platform: AdPlatform
        start_date: string
        end_date: string | null
        target_channels: Channel[]
        status: CampaignStatus
        total_spend: number
        orders_count: number
        revenue: number
        profit: number
        roas: number
        cost_per_order: number
      }>,
      metricsById: new Map<string, CampaignMetric>(),
    }
  }

  const today = new Date().toISOString().split("T")[0]
  const allChannels = Array.from(new Set(campaigns.flatMap((campaign) => campaign.target_channels)))
  const globalStartDate = campaigns.reduce(
    (min, campaign) => campaign.start_date < min ? campaign.start_date : min,
    campaigns[0].start_date
  )
  const globalEndDate = campaigns.reduce((max, campaign) => {
    const campaignEnd = campaign.end_date || today
    return campaignEnd > max ? campaignEnd : max
  }, campaigns[0].end_date || today)

  const [ordersResult, productsResult] = await Promise.all([
    allChannels.length > 0
      ? supabase
          .from("orders")
          .select(`
            id,
            order_id,
            channel,
            order_date,
            status,
            channel_fees,
            order_line_items (
              id,
              sku,
              quantity,
              selling_price,
              cost_per_unit_snapshot
            )
          `)
          .in("channel", allChannels)
          .gte("order_date", globalStartDate)
          .lte("order_date", globalEndDate)
          .in("status", ["paid", "shipped"])
      : Promise.resolve({ data: [], error: null }),
    supabase.from("products").select("sku, name, cost_per_unit"),
  ])

  if (ordersResult.error) {
    console.error("Error fetching attributed orders:", ordersResult.error)
  }

  if (productsResult.error) {
    console.error("Error fetching products for campaign metrics:", productsResult.error)
  }

  const productMap = new Map((productsResult.data || []).map((product) => [product.sku, product]))
  const decoratedOrdersByChannel = new Map<Channel, AttributedOrderMetric[]>()

  for (const order of (ordersResult.data || []) as CampaignMetricOrder[]) {
    const lineItems = order.order_line_items || []
    const totalSellingPrice = lineItems.reduce(
      (sum: number, item) => sum + (item.selling_price * item.quantity),
      0
    )
    const revenue = totalSellingPrice - (order.channel_fees || 0)
    const totalCogs = lineItems.reduce((sum: number, item) => {
      const product = productMap.get(item.sku)
      return sum + getLineItemTotalCost(item, product)
    }, 0)

    const decoratedOrder: AttributedOrderMetric = {
      id: order.id,
      order_id: order.order_id,
      channel: order.channel,
      order_date: order.order_date,
      status: order.status,
      revenue,
      net_profit: revenue - totalCogs,
      line_items_with_names: lineItems.map((item) => ({
        ...item,
        product_name: productMap.get(item.sku)?.name || "Unknown",
      })),
    }

    const existing = decoratedOrdersByChannel.get(order.channel) || []
    existing.push(decoratedOrder)
    decoratedOrdersByChannel.set(order.channel, existing)
  }

  for (const orders of decoratedOrdersByChannel.values()) {
    orders.sort((a, b) => b.order_date.localeCompare(a.order_date))
  }

  const metricsById = new Map<string, CampaignMetric>()
  const summaries: Array<{
    id: string
    campaign_name: string
    platform: AdPlatform
    start_date: string
    end_date: string | null
    target_channels: Channel[]
    status: CampaignStatus
    total_spend: number
    orders_count: number
    revenue: number
    profit: number
    roas: number
    cost_per_order: number
  }> = []

  for (const campaign of campaigns) {
    const targetChannels: Channel[] = Array.from(new Set<Channel>(campaign.target_channels))
    const campaignEnd = campaign.end_date || today
    const attributedOrders = targetChannels
      .flatMap((channel) => decoratedOrdersByChannel.get(channel) || [])
      .filter((order) => order.order_date >= campaign.start_date && order.order_date <= campaignEnd)

    const totalRevenue = attributedOrders.reduce((sum, order) => sum + order.revenue, 0)
    const totalProfit = attributedOrders.reduce((sum, order) => sum + order.net_profit, 0)
    const ordersCount = attributedOrders.length
    const roas = campaign.total_spend > 0 ? totalRevenue / campaign.total_spend : 0
    const costPerOrder = ordersCount > 0 ? campaign.total_spend / ordersCount : 0

    metricsById.set(campaign.id, {
      campaign,
      total_spend: campaign.total_spend,
      orders_count: ordersCount,
      revenue: totalRevenue,
      profit: totalProfit,
      roas,
      cost_per_order: costPerOrder,
      attributed_orders: options?.includeAttributedOrders ? attributedOrders : [],
    })

    summaries.push({
      id: campaign.id,
      campaign_name: campaign.campaign_name,
      platform: campaign.platform,
      start_date: campaign.start_date,
      end_date: campaign.end_date,
      target_channels: campaign.target_channels,
      status: campaign.status,
      total_spend: campaign.total_spend,
      orders_count: ordersCount,
      revenue: totalRevenue,
      profit: totalProfit,
      roas,
      cost_per_order: costPerOrder,
    })
  }

  return {
    campaigns: campaigns as AdCampaign[],
    summaries,
    metricsById,
  }
}

export async function getCampaignMetrics(campaignId: string) {
  const { metricsById } = await getCampaignMetricsBatch({
    campaignIds: [campaignId],
    includeAttributedOrders: true,
  })

  return metricsById.get(campaignId) || null
}

export async function getAllCampaignsMetrics(filters?: { status?: CampaignStatus }) {
  const { summaries } = await getCampaignMetricsBatch({
    status: filters?.status,
  })

  return summaries
}

export async function getAdPerformanceSummary() {
  const { campaigns, summaries } = await getCampaignMetricsBatch()

  if (campaigns.length === 0) {
    return {
      total_ad_spend: 0,
      total_revenue: 0,
      overall_roas: 0,
      total_orders: 0,
      avg_cost_per_order: 0,
      active_campaigns_count: 0,
      campaigns_metrics: [],
    }
  }

  const totalAdSpend = summaries.reduce((sum, campaign) => sum + campaign.total_spend, 0)
  const totalRevenue = summaries.reduce((sum, campaign) => sum + campaign.revenue, 0)
  const totalOrders = summaries.reduce((sum, campaign) => sum + campaign.orders_count, 0)
  const activeCampaignsCount = campaigns.filter((campaign) => campaign.status === "active").length

  return {
    total_ad_spend: totalAdSpend,
    total_revenue: totalRevenue,
    overall_roas: totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0,
    total_orders: totalOrders,
    avg_cost_per_order: totalOrders > 0 ? totalAdSpend / totalOrders : 0,
    active_campaigns_count: activeCampaignsCount,
    campaigns_metrics: summaries,
  }
}
