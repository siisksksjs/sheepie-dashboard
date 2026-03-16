"use server"

import { revalidatePath } from "next/cache"
import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { getReportsBundle } from "./orders"
import { createLedgerEntry } from "./inventory"
import { safeRecordAutomaticChangelogEntry } from "./changelog"
import { buildChangeItem } from "@/lib/changelog"
import { getMarketplaceChannelAccountMappings } from "@/lib/marketplace-settlements"
import type {
  Channel,
  FinanceAccount,
  FinanceAccountType,
  FinanceCategory,
  FinanceCategoryKind,
  FinanceEntry,
  FinanceEntryDirection,
  FinanceEntrySource,
  FinanceTransfer,
  InventoryPurchaseBatch,
  InventoryPurchaseBatchItem,
  MarketplaceChannelAccount,
  Product,
} from "@/lib/types/database.types"

type DateRange = {
  startDate?: string
  endDate?: string
}

type FinanceEntryWithMeta = FinanceEntry & {
  account_name: string
  account_type: FinanceAccountType
  category_name: string
  category_kind: FinanceCategoryKind
  category_group: string
}

type FinanceTransferWithMeta = FinanceTransfer & {
  from_account_name: string
  to_account_name: string
}

type InventoryPurchaseItemInput = {
  sku: string
  quantity: number
  unit_cost: number
}

type InventoryPurchaseBatchWithItems = InventoryPurchaseBatch & {
  account_name: string
  items: Array<InventoryPurchaseBatchItem & { product_name: string; variant: string | null }>
}

type MarketplaceChannelAccountWithMeta = MarketplaceChannelAccount & {
  account_name: string
}

function getDateRange(year?: number, month?: number): DateRange {
  if (year && month) {
    return {
      startDate: `${year}-${month.toString().padStart(2, "0")}-01`,
      endDate: new Date(year, month, 0).toISOString().split("T")[0],
    }
  }

  if (year) {
    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    }
  }

  return {}
}

function applyDateRange<T>(query: T, column: string, range: DateRange) {
  let next = query as any

  if (range.startDate) {
    next = next.gte(column, range.startDate)
  }

  if (range.endDate) {
    next = next.lte(column, range.endDate)
  }

  return next as T
}

function sortCategories(categories: FinanceCategory[]) {
  return [...categories].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.name.localeCompare(b.name)
  })
}

function revalidateFinancePaths() {
  revalidatePath("/finance")
  revalidatePath("/dashboard")
}

export const getMarketplaceAccountMappings = cache(async () => {
  const [mappings, accounts] = await Promise.all([
    getMarketplaceChannelAccountMappings(),
    getFinanceAccounts(),
  ])

  const accountMap = new Map(accounts.map((account) => [account.id, account.name]))

  return mappings
    .map((mapping) => ({
      ...mapping,
      account_name: accountMap.get(mapping.finance_account_id) || "Unknown account",
    }))
    .sort((a, b) => a.channel.localeCompare(b.channel)) as MarketplaceChannelAccountWithMeta[]
})

export async function getFinanceAccounts() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("finance_accounts")
    .select("*")
    .order("name", { ascending: true })

  if (error) {
    console.error("Error fetching finance accounts:", error)
    return [] as FinanceAccount[]
  }

  return data as FinanceAccount[]
}

export async function getFinanceCategories(kind?: FinanceCategoryKind) {
  const supabase = await createClient()

  let query = supabase
    .from("finance_categories")
    .select("*")
    .eq("is_active", true)

  if (kind) {
    query = query.eq("kind", kind)
  }

  const { data, error } = await query

  if (error) {
    console.error("Error fetching finance categories:", error)
    return [] as FinanceCategory[]
  }

  return sortCategories(data as FinanceCategory[])
}

export const getFinanceEntries = cache(async (filters?: {
  year?: number
  month?: number
  categoryKind?: FinanceCategoryKind
  accountId?: string
  limit?: number
}) => {
  const supabase = await createClient()
  const range = getDateRange(filters?.year, filters?.month)

  let query = applyDateRange(
    supabase
      .from("finance_entries")
      .select("*")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
    "entry_date",
    range
  )

  if (filters?.accountId) {
    query = query.eq("account_id", filters.accountId)
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  const [{ data: entries, error: entriesError }, accounts, categories] = await Promise.all([
    query,
    getFinanceAccounts(),
    getFinanceCategories(),
  ])

  if (entriesError) {
    console.error("Error fetching finance entries:", entriesError)
    return [] as FinanceEntryWithMeta[]
  }

  const accountMap = new Map(accounts.map((account) => [account.id, account]))
  const categoryMap = new Map(categories.map((category) => [category.id, category]))

  return ((entries || []) as FinanceEntry[])
    .map((entry) => {
      const account = accountMap.get(entry.account_id)
      const category = categoryMap.get(entry.category_id)
      return {
        ...entry,
        account_name: account?.name || "Unknown account",
        account_type: account?.type || "bank",
        category_name: category?.name || "Unknown category",
        category_kind: category?.kind || "operating_expense",
        category_group: category?.group_name || "misc",
      }
    })
    .filter((entry) => !filters?.categoryKind || entry.category_kind === filters.categoryKind)
})

export const getFinanceTransfers = cache(async (filters?: {
  year?: number
  month?: number
  accountId?: string
  limit?: number
}) => {
  const supabase = await createClient()
  const range = getDateRange(filters?.year, filters?.month)

  let query = applyDateRange(
    supabase
      .from("finance_transfers")
      .select("*")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
    "entry_date",
    range
  )

  if (filters?.accountId) {
    query = query.or(`from_account_id.eq.${filters.accountId},to_account_id.eq.${filters.accountId}`)
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  const [{ data: transfers, error }, accounts] = await Promise.all([
    query,
    getFinanceAccounts(),
  ])

  if (error) {
    console.error("Error fetching finance transfers:", error)
    return [] as FinanceTransferWithMeta[]
  }

  const accountMap = new Map(accounts.map((account) => [account.id, account.name]))

  return ((transfers || []) as FinanceTransfer[]).map((transfer) => ({
    ...transfer,
    from_account_name: accountMap.get(transfer.from_account_id) || "Unknown account",
    to_account_name: accountMap.get(transfer.to_account_id) || "Unknown account",
  }))
})

export const getInventoryPurchaseBatches = cache(async (filters?: {
  year?: number
  month?: number
  accountId?: string
  limit?: number
}) => {
  const supabase = await createClient()
  const range = getDateRange(filters?.year, filters?.month)

  let batchQuery = applyDateRange(
    supabase
      .from("inventory_purchase_batches")
      .select("*")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
    "entry_date",
    range
  )

  if (filters?.accountId) {
    batchQuery = batchQuery.eq("account_id", filters.accountId)
  }

  if (filters?.limit) {
    batchQuery = batchQuery.limit(filters.limit)
  }

  const [{ data: batches, error }, accounts, products] = await Promise.all([
    batchQuery,
    getFinanceAccounts(),
    getProductsForFinance(),
  ])

  if (error) {
    console.error("Error fetching inventory purchase batches:", error)
    return [] as InventoryPurchaseBatchWithItems[]
  }

  const typedBatches = (batches || []) as InventoryPurchaseBatch[]
  if (typedBatches.length === 0) {
    return [] as InventoryPurchaseBatchWithItems[]
  }

  const { data: items, error: itemsError } = await supabase
    .from("inventory_purchase_batch_items")
    .select("*")
    .in("batch_id", typedBatches.map((batch) => batch.id))

  if (itemsError) {
    console.error("Error fetching inventory purchase batch items:", itemsError)
    return [] as InventoryPurchaseBatchWithItems[]
  }

  const accountMap = new Map(accounts.map((account) => [account.id, account.name]))
  const productMap = new Map(products.map((product) => [product.sku, product]))
  const itemsByBatch = new Map<string, Array<InventoryPurchaseBatchItem & { product_name: string; variant: string | null }>>()

  for (const item of (items || []) as InventoryPurchaseBatchItem[]) {
    const existing = itemsByBatch.get(item.batch_id) || []
    const product = productMap.get(item.sku)
    existing.push({
      ...item,
      product_name: product?.name || item.sku,
      variant: product?.variant || null,
    })
    itemsByBatch.set(item.batch_id, existing)
  }

  return typedBatches.map((batch) => ({
    ...batch,
    account_name: accountMap.get(batch.account_id) || "Unknown account",
    items: itemsByBatch.get(batch.id) || [],
  }))
})

async function getProductsForFinance() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("products")
    .select("sku, name, variant")
    .order("name", { ascending: true })

  if (error) {
    console.error("Error fetching products for finance:", error)
    return [] as Pick<Product, "sku" | "name" | "variant">[]
  }

  return data as Pick<Product, "sku" | "name" | "variant">[]
}

export const getFinanceAccountBalances = cache(async () => {
  const [accounts, entries, transfers] = await Promise.all([
    getFinanceAccounts(),
    getFinanceEntries(),
    getFinanceTransfers(),
  ])

  return accounts.map((account) => {
    const entriesTotal = entries.reduce((sum, entry) => {
      if (entry.account_id !== account.id) return sum
      return sum + (entry.direction === "in" ? entry.amount : -entry.amount)
    }, 0)

    const transferTotal = transfers.reduce((sum, transfer) => {
      if (transfer.to_account_id === account.id) return sum + transfer.amount
      if (transfer.from_account_id === account.id) return sum - transfer.amount
      return sum
    }, 0)

    const current_balance = account.opening_balance + entriesTotal + transferTotal

    return {
      ...account,
      current_balance,
    }
  })
})

export const getFinanceProfitAndLoss = cache(async (year?: number, month?: number) => {
  const supabase = await createClient()
  const range = getDateRange(year, month)
  const reports = await getReportsBundle(year, month)
  const financeEntries = await getFinanceEntries({ year, month })

  const { data: adSpendEntries, error: adSpendError } = await applyDateRange(
    supabase
      .from("ad_spend_entries")
      .select("amount, entry_date"),
    "entry_date",
    range
  )

  if (adSpendError) {
    console.error("Error fetching ad spend for finance:", adSpendError)
  }

  const channelRows = reports.overview.byChannel || []
  const grossRevenue = channelRows.reduce((sum, channel) => sum + channel.revenue + channel.fees, 0)
  const channelFees = channelRows.reduce((sum, channel) => sum + channel.fees, 0)
  const netSales = channelRows.reduce((sum, channel) => sum + channel.revenue, 0)
  const cogs = reports.overview.byProduct.reduce((sum, product) => sum + product.cost, 0)
  const grossProfit = reports.overview.byProduct.reduce((sum, product) => sum + product.profit, 0)
  const adSpend = (adSpendEntries || []).reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  const operatingExpenses = financeEntries
    .filter((entry) => entry.category_kind === "operating_expense")
    .reduce((sum, entry) => sum + entry.amount, 0)
  const otherIncome = financeEntries
    .filter((entry) => entry.category_kind === "other_income")
    .reduce((sum, entry) => sum + entry.amount, 0)
  const adjustments = financeEntries
    .filter((entry) => entry.category_kind === "adjustment")
    .reduce((sum, entry) => sum + (entry.direction === "in" ? entry.amount : -entry.amount), 0)

  const operatingProfit = grossProfit - adSpend - operatingExpenses
  const netProfit = operatingProfit + otherIncome + adjustments

  const expensesByCategory = financeEntries
    .filter((entry) => entry.category_kind === "operating_expense")
    .reduce((map, entry) => {
      const existing = map.get(entry.category_name) || 0
      map.set(entry.category_name, existing + entry.amount)
      return map
    }, new Map<string, number>())

  return {
    gross_revenue: grossRevenue,
    channel_fees: channelFees,
    net_sales: netSales,
    cogs,
    gross_profit: grossProfit,
    ad_spend: adSpend,
    operating_expenses: operatingExpenses,
    operating_profit: operatingProfit,
    other_income: otherIncome,
    adjustments,
    net_profit: netProfit,
    expenses_by_category: Array.from(expensesByCategory.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
  }
})

export const getFinanceCashFlow = cache(async (year?: number, month?: number) => {
  const accounts = await getFinanceAccounts()
  const entries = await getFinanceEntries({ year, month })
  const transfers = await getFinanceTransfers({ year, month })
  const range = getDateRange(year, month)

  let openingCash = accounts.reduce((sum, account) => sum + account.opening_balance, 0)

  if (range.startDate) {
    const startDate = range.startDate
    const allEntries = await getFinanceEntries()
    const allTransfers = await getFinanceTransfers()

    openingCash += allEntries.reduce((sum, entry) => {
      if (entry.entry_date >= startDate) return sum
      return sum + (entry.direction === "in" ? entry.amount : -entry.amount)
    }, 0)

    openingCash += allTransfers.reduce((sum, transfer) => {
      if (transfer.entry_date >= startDate) return sum
      return sum
    }, 0)
  }

  const cashIn = entries
    .filter((entry) => entry.direction === "in")
    .reduce((sum, entry) => sum + entry.amount, 0)
  const cashOut = entries
    .filter((entry) => entry.direction === "out")
    .reduce((sum, entry) => sum + entry.amount, 0)
  const transferIn = transfers.reduce((sum, transfer) => sum + transfer.amount, 0)
  const transferOut = transfers.reduce((sum, transfer) => sum + transfer.amount, 0)
  const netCashFlow = cashIn - cashOut
  const closingCash = openingCash + netCashFlow

  return {
    opening_cash: openingCash,
    cash_in: cashIn,
    cash_out: cashOut,
    transfer_in: transferIn,
    transfer_out: transferOut,
    net_cash_flow: netCashFlow,
    closing_cash: closingCash,
  }
})

export const getFinanceOverview = cache(async (year?: number, month?: number) => {
  const [balances, pnl, cashFlow, purchases] = await Promise.all([
    getFinanceAccountBalances(),
    getFinanceProfitAndLoss(year, month),
    getFinanceCashFlow(year, month),
    getInventoryPurchaseBatches({ year, month }),
  ])

  return {
    account_balances: balances,
    total_cash_balance: balances.reduce((sum, account) => sum + account.current_balance, 0),
    pnl,
    cash_flow: cashFlow,
    inventory_purchase_total: purchases.reduce((sum, batch) => sum + batch.total_amount, 0),
  }
})

export async function createFinanceAccount(input: {
  name: string
  type: FinanceAccountType
  opening_balance?: number
  notes?: string | null
}) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("finance_accounts")
    .insert([{
      name: input.name.trim(),
      type: input.type,
      opening_balance: input.opening_balance || 0,
      notes: input.notes?.trim() || null,
    }])
    .select()
    .single()

  if (error) {
    console.error("Error creating finance account:", error)
    return { success: false, error: error.message }
  }

  revalidateFinancePaths()

  await safeRecordAutomaticChangelogEntry({
    area: "finance",
    action_summary: "Created finance account",
    entity_type: "finance_account",
    entity_id: data.id,
    entity_label: data.name,
    notes: data.notes,
    items: [
      buildChangeItem("Type", null, data.type),
      buildChangeItem("Opening balance", null, data.opening_balance),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  })

  return { success: true, data: data as FinanceAccount }
}

export async function saveMarketplaceAccountMappings(
  mappings: Partial<Record<Channel, string | null>>
) {
  const supabase = await createClient()
  const accounts = await getFinanceAccounts()
  const existingMappings = await getMarketplaceAccountMappings()
  const validChannels: Channel[] = ["shopee", "tokopedia", "tiktok"]
  const accountMap = new Map(accounts.map((account) => [account.id, account.name]))
  const previousMap = new Map(existingMappings.map((mapping) => [mapping.channel, mapping.finance_account_id]))

  for (const channel of validChannels) {
    if (!(channel in mappings)) continue

    const accountId = mappings[channel] || null

    if (accountId && !accountMap.has(accountId)) {
      return { success: false, error: `Invalid account selected for ${channel}` }
    }

    if (!accountId) {
      const { error } = await supabase
        .from("marketplace_channel_accounts")
        .delete()
        .eq("channel", channel)

      if (error) {
        console.error("Error clearing marketplace mapping:", error)
        return { success: false, error: error.message }
      }

      continue
    }

    const { error } = await supabase
      .from("marketplace_channel_accounts")
      .upsert([{
        channel,
        finance_account_id: accountId,
      }], { onConflict: "channel" })

    if (error) {
      console.error("Error saving marketplace mapping:", error)
      return { success: false, error: error.message }
    }
  }

  revalidateFinancePaths()

  await safeRecordAutomaticChangelogEntry({
    area: "finance",
    action_summary: "Updated marketplace settlement mappings",
    entity_type: "marketplace_account_mapping",
    entity_label: "Marketplace settlement accounts",
    items: validChannels
      .map((channel) => {
        if (!(channel in mappings)) return null

        const previousAccountId = previousMap.get(channel) || null
        const nextAccountId = mappings[channel] || null
        const previousName = previousAccountId ? accountMap.get(previousAccountId) || previousAccountId : null
        const nextName = nextAccountId ? accountMap.get(nextAccountId) || nextAccountId : null

        return buildChangeItem(channel, previousName, nextName)
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  })

  return { success: true }
}

export async function createFinanceEntry(input: {
  entry_date: string
  account_id: string
  category_id: string
  direction: FinanceEntryDirection
  amount: number
  vendor?: string | null
  notes?: string | null
  source?: FinanceEntrySource
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [accounts, categories] = await Promise.all([
    getFinanceAccounts(),
    getFinanceCategories(),
  ])

  const account = accounts.find((item) => item.id === input.account_id)
  const category = categories.find((item) => item.id === input.category_id)

  if (!account || !category) {
    return { success: false, error: "Account or category not found" }
  }

  const { data, error } = await supabase
    .from("finance_entries")
    .insert([{
      entry_date: input.entry_date,
      account_id: input.account_id,
      category_id: input.category_id,
      direction: input.direction,
      amount: input.amount,
      vendor: input.vendor?.trim() || null,
      notes: input.notes?.trim() || null,
      source: input.source || "manual",
      created_by: user?.id || null,
    }])
    .select()
    .single()

  if (error) {
    console.error("Error creating finance entry:", error)
    return { success: false, error: error.message }
  }

  revalidateFinancePaths()

  await safeRecordAutomaticChangelogEntry({
    area: "finance",
    action_summary: "Created finance entry",
    entity_type: "finance_entry",
    entity_id: data.id,
    entity_label: `${category.name} - ${account.name}`,
    notes: data.notes,
    items: [
      buildChangeItem("Entry date", null, data.entry_date),
      buildChangeItem("Account", null, account.name),
      buildChangeItem("Category", null, category.name),
      buildChangeItem("Direction", null, data.direction),
      buildChangeItem("Amount", null, data.amount),
      buildChangeItem("Vendor", null, data.vendor),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  })

  return { success: true, data: data as FinanceEntry }
}

export async function createFinanceTransfer(input: {
  entry_date: string
  from_account_id: string
  to_account_id: string
  amount: number
  notes?: string | null
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (input.from_account_id === input.to_account_id) {
    return { success: false, error: "Transfer accounts must be different" }
  }

  const accounts = await getFinanceAccounts()
  const fromAccount = accounts.find((item) => item.id === input.from_account_id)
  const toAccount = accounts.find((item) => item.id === input.to_account_id)

  if (!fromAccount || !toAccount) {
    return { success: false, error: "Account not found" }
  }

  const { data, error } = await supabase
    .from("finance_transfers")
    .insert([{
      entry_date: input.entry_date,
      from_account_id: input.from_account_id,
      to_account_id: input.to_account_id,
      amount: input.amount,
      notes: input.notes?.trim() || null,
      created_by: user?.id || null,
    }])
    .select()
    .single()

  if (error) {
    console.error("Error creating finance transfer:", error)
    return { success: false, error: error.message }
  }

  revalidateFinancePaths()

  await safeRecordAutomaticChangelogEntry({
    area: "finance",
    action_summary: "Created finance transfer",
    entity_type: "finance_transfer",
    entity_id: data.id,
    entity_label: `${fromAccount.name} → ${toAccount.name}`,
    notes: data.notes,
    items: [
      buildChangeItem("Entry date", null, data.entry_date),
      buildChangeItem("From account", null, fromAccount.name),
      buildChangeItem("To account", null, toAccount.name),
      buildChangeItem("Amount", null, data.amount),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  })

  return { success: true, data: data as FinanceTransfer }
}

export async function createInventoryPurchase(input: {
  entry_date: string
  account_id: string
  vendor?: string | null
  notes?: string | null
  items: InventoryPurchaseItemInput[]
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!input.items.length) {
    return { success: false, error: "At least one purchase item is required" }
  }

  const validItems = input.items
    .filter((item) => item.sku && item.quantity > 0 && item.unit_cost >= 0)
    .map((item) => ({
      ...item,
      total_cost: item.quantity * item.unit_cost,
    }))

  if (validItems.length === 0) {
    return { success: false, error: "Purchase items are invalid" }
  }

  const totalAmount = validItems.reduce((sum, item) => sum + item.total_cost, 0)
  const accounts = await getFinanceAccounts()
  const categories = await getFinanceCategories()
  const account = accounts.find((item) => item.id === input.account_id)
  const purchaseCategory = categories.find((item) => item.kind === "inventory_purchase")

  if (!account || !purchaseCategory) {
    return { success: false, error: "Inventory purchase setup is incomplete" }
  }

  const { data: batch, error: batchError } = await supabase
    .from("inventory_purchase_batches")
    .insert([{
      entry_date: input.entry_date,
      vendor: input.vendor?.trim() || null,
      account_id: input.account_id,
      total_amount: totalAmount,
      notes: input.notes?.trim() || null,
      created_by: user?.id || null,
    }])
    .select()
    .single()

  if (batchError) {
    console.error("Error creating inventory purchase batch:", batchError)
    return { success: false, error: batchError.message }
  }

  const { error: itemsError } = await supabase
    .from("inventory_purchase_batch_items")
    .insert(validItems.map((item) => ({
      batch_id: batch.id,
      sku: item.sku,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      total_cost: item.total_cost,
    })))

  if (itemsError) {
    console.error("Error creating inventory purchase batch items:", itemsError)
    return { success: false, error: itemsError.message }
  }

  const { data: financeEntry, error: financeEntryError } = await supabase
    .from("finance_entries")
    .insert([{
      entry_date: input.entry_date,
      account_id: input.account_id,
      category_id: purchaseCategory.id,
      direction: "out",
      amount: totalAmount,
      source: "automatic",
      reference_type: "inventory_purchase_batch",
      reference_id: batch.id,
      vendor: input.vendor?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: user?.id || null,
    }])
    .select()
    .single()

  if (financeEntryError) {
    console.error("Error creating finance entry for inventory purchase:", financeEntryError)
    return { success: false, error: financeEntryError.message }
  }

  const { error: updateBatchError } = await supabase
    .from("inventory_purchase_batches")
    .update({ finance_entry_id: financeEntry.id })
    .eq("id", batch.id)

  if (updateBatchError) {
    console.error("Error linking finance entry to purchase batch:", updateBatchError)
    return { success: false, error: updateBatchError.message }
  }

  for (const item of validItems) {
    const ledgerResult = await createLedgerEntry({
      sku: item.sku,
      movement_type: "IN_PURCHASE",
      quantity: item.quantity,
      reference: `Inventory purchase ${batch.id}`,
      entry_date: input.entry_date,
    }, {
      skipChangelog: true,
    })

    if (!ledgerResult.success) {
      return { success: false, error: ledgerResult.error || "Failed to create stock entry" }
    }
  }

  revalidateFinancePaths()
  revalidatePath("/ledger")
  revalidatePath("/products")

  await safeRecordAutomaticChangelogEntry({
    area: "finance",
    action_summary: "Created inventory purchase",
    entity_type: "inventory_purchase_batch",
    entity_id: batch.id,
    entity_label: input.vendor?.trim() || `Inventory purchase ${batch.id}`,
    notes: input.notes?.trim() || null,
    items: [
      buildChangeItem("Entry date", null, input.entry_date),
      buildChangeItem("Account", null, account.name),
      buildChangeItem("Vendor", null, input.vendor),
      buildChangeItem("Total amount", null, totalAmount),
      buildChangeItem(
        "Items",
        null,
        validItems.map((item) => `${item.sku} x${item.quantity} @ ${item.unit_cost}`)
      ),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  })

  return { success: true, data: batch as InventoryPurchaseBatch }
}
