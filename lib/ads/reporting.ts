import {
  buildChannelScopeKey,
  normalizeChannels,
  scopeIncludesChannel,
} from "./channel-scopes"
import { getLineItemTotalCost } from "../line-item-costs"
import type {
  Channel,
  MonthlyAdSpend,
  Order,
  OrderLineItem,
  Product,
  SkuAdSetup,
  SkuSalesTarget,
} from "../types/database.types"

export type AdsChannelClassification = "ads-active" | "organic"

type ReportingSetup = Pick<
  SkuAdSetup,
  "sku" | "start_date" | "end_date" | "status"
> &
  Partial<Pick<SkuAdSetup, "daily_budget_cap" | "channels" | "channel">>

type ReportingSpend = Pick<
  MonthlyAdSpend,
  "sku" | "month" | "actual_spend"
>
  & Partial<Pick<MonthlyAdSpend, "channels" | "channel">>

type ReportingTarget = Pick<
  SkuSalesTarget,
  "sku" | "daily_target_units" | "effective_from" | "effective_to"
>

export type SkuChannelMonthlyPerformance = {
  sku: string
  channel: Channel
  units: number
  revenue: number
  cost: number
  profit: number
}

export type SkuMonthlyChannelSummary = {
  channel: Channel
  classification: AdsChannelClassification
  units: number
  ads_spent: number
  budget_cap: number
  revenue: number
  cost: number
  profit: number
  uses_shared_budget?: boolean
}

export type SkuMonthlySummary = {
  month: string
  sku: string
  target_units: number
  actual_units: number
  ads_active_channel_units: number
  organic_channel_units: number
  total_ads_spent: number
  total_budget_cap: number
  gross_profit: number
  profit_after_ads: number
  channels: SkuMonthlyChannelSummary[]
}

export type MonthlyAdsReportOrder = Pick<
  Order,
  "id" | "channel" | "order_date" | "status" | "channel_fees"
> & {
  order_line_items: Array<
    Pick<
      OrderLineItem,
      "sku" | "quantity" | "selling_price" | "cost_per_unit_snapshot"
    >
  >
}

export type MonthlyAdsReportProduct = Pick<
  Product,
  "sku" | "name" | "variant" | "cost_per_unit"
>

export type MonthlyAdsChannelBreakdownRow = SkuMonthlyChannelSummary & {
  month: string
  sku: string
  product_name: string | null
  product_variant: string | null
  profit_after_ads: number
  actual_spend_missing: boolean
}

export type MonthlyAdsMissingSpendScope = {
  month: string
  sku: string
  channels: Channel[]
  budget_cap: number
  product_name: string | null
  product_variant: string | null
}

export type MonthlyAdsReportTotals = {
  total_target_units: number
  total_actual_units: number
  ads_active_channel_units: number
  organic_channel_units: number
  total_ads_spent: number
  total_budget_cap: number
  profit_before_ads: number
  profit_after_ads: number
  target_achievement_percent: number
  has_missing_spend: boolean
  ads_active_rows_missing_spend: number
}

export type MonthlyAdsReportBundle = {
  month: string
  skuSummaries: SkuMonthlySummary[]
  channelBreakdown: MonthlyAdsChannelBreakdownRow[]
  missingSpendScopes?: MonthlyAdsMissingSpendScope[]
  monthlySpendRows: MonthlyAdSpend[]
  totals: MonthlyAdsReportTotals
  load_error: string | null
}

export function classifyAdsChannel(input: {
  sku: string
  channel: Channel
  month: string
  setups: ReportingSetup[]
}): AdsChannelClassification {
  const monthRange = getMonthRange(input.month)

  return input.setups.some((setup) => {
    if (
      setup.sku !== input.sku ||
      !scopeIncludesChannel(getScopeChannels(setup), input.channel)
    ) {
      return false
    }

    if (setup.status !== "active") {
      return false
    }

    return rangesOverlap(monthRange, {
      start: parseDateOnly(setup.start_date),
      end: setup.end_date ? parseDateOnly(setup.end_date) : null,
    })
  })
    ? "ads-active"
    : "organic"
}

export function computeMonthlyBudgetCap(input: {
  month: string
  daily_budget_cap: number
  start_date: string
  end_date: string | null
}): number {
  return (
    input.daily_budget_cap *
    getActiveDaysInMonth({
      month: input.month,
      start_date: input.start_date,
      end_date: input.end_date,
    })
  )
}

export function computeSkuMonthlySummary(input: {
  month: string
  sku: string
  channelPerformance: SkuChannelMonthlyPerformance[]
  setups: ReportingSetup[]
  monthlySpend: ReportingSpend[]
  salesTargets: ReportingTarget[]
}): SkuMonthlySummary {
  const activeMonthSetups = getActiveOverlappingSetupsForMonth({
    month: input.month,
    sku: input.sku,
    setups: input.setups,
  })
  const relevantTargets = input.salesTargets.filter((target) => target.sku === input.sku)
  const targetUnits = relevantTargets.reduce((sum, target) => {
    return (
      sum +
      getActiveDaysInMonth({
        month: input.month,
        start_date: target.effective_from,
        end_date: target.effective_to,
      }) *
        target.daily_target_units
    )
  }, 0)

  const channelOrder = new Set<Channel>()

  for (const row of input.channelPerformance) {
    if (row.sku === input.sku) {
      channelOrder.add(row.channel)
    }
  }

  for (const setup of activeMonthSetups) {
    for (const channel of getScopeChannels(setup)) {
      channelOrder.add(channel)
    }
  }

  for (const spend of input.monthlySpend) {
    if (spend.sku === input.sku && isSameMonth(spend.month, input.month)) {
      for (const channel of getScopeChannels(spend)) {
        channelOrder.add(channel)
      }
    }
  }

  const totalBudgetCap = activeMonthSetups.reduce((sum, setup) => {
    if (typeof setup.daily_budget_cap !== "number") {
      return sum
    }

    return (
      sum +
      computeMonthlyBudgetCap({
        month: input.month,
        daily_budget_cap: setup.daily_budget_cap,
        start_date: setup.start_date,
        end_date: setup.end_date,
      })
    )
  }, 0)

  const totalAdsSpent = input.monthlySpend.reduce((sum, spend) => {
    if (spend.sku !== input.sku || !isSameMonth(spend.month, input.month)) {
      return sum
    }

    return sum + spend.actual_spend
  }, 0)

  const channels = Array.from(channelOrder).map((channel) => {
    const performanceRows = input.channelPerformance.filter(
      (row) => row.sku === input.sku && row.channel === channel,
    )
    const channelUnits = performanceRows.reduce((sum, row) => sum + row.units, 0)
    const channelRevenue = performanceRows.reduce((sum, row) => sum + row.revenue, 0)
    const channelCost = performanceRows.reduce((sum, row) => sum + row.cost, 0)
    const channelProfit = performanceRows.reduce((sum, row) => sum + row.profit, 0)
    const classification = classifyAdsChannel({
      sku: input.sku,
      channel,
      month: input.month,
      setups: input.setups,
    })
    const channelBudgetCap = activeMonthSetups.reduce((sum, setup) => {
      const scopeChannels = getScopeChannels(setup)
      if (
        !scopeIncludesChannel(scopeChannels, channel) ||
        typeof setup.daily_budget_cap !== "number" ||
        scopeChannels.length !== 1
      ) {
        return sum
      }

      return (
        sum +
        computeMonthlyBudgetCap({
          month: input.month,
          daily_budget_cap: setup.daily_budget_cap,
          start_date: setup.start_date,
          end_date: setup.end_date,
        })
      )
    }, 0)
    const channelAdsSpent = input.monthlySpend.reduce((sum, spend) => {
      const scopeChannels = getScopeChannels(spend)
      if (
        spend.sku !== input.sku ||
        !scopeIncludesChannel(scopeChannels, channel) ||
        scopeChannels.length !== 1 ||
        !isSameMonth(spend.month, input.month)
      ) {
        return sum
      }

      return sum + spend.actual_spend
    }, 0)
    const usesSharedBudget =
      classification === "ads-active" &&
      (activeMonthSetups.some(
        (setup) => {
          const scopeChannels = getScopeChannels(setup)
          return (
            scopeIncludesChannel(scopeChannels, channel) &&
            scopeChannels.length > 1
          )
        },
      ) ||
        input.monthlySpend.some(
          (spend) => {
            const scopeChannels = getScopeChannels(spend)
            return (
              spend.sku === input.sku &&
              isSameMonth(spend.month, input.month) &&
              scopeIncludesChannel(scopeChannels, channel) &&
              scopeChannels.length > 1
            )
          },
        ))

    return {
      channel,
      classification,
      units: channelUnits,
      ads_spent: channelAdsSpent,
      budget_cap: channelBudgetCap,
      revenue: channelRevenue,
      cost: channelCost,
      profit: channelProfit,
      uses_shared_budget: usesSharedBudget,
    }
  })

  const actualUnits = channels.reduce((sum, channel) => sum + channel.units, 0)
  const adsActiveUnits = channels.reduce((sum, channel) => {
    return sum + (channel.classification === "ads-active" ? channel.units : 0)
  }, 0)
  const grossProfit = channels.reduce((sum, channel) => sum + channel.profit, 0)

  return {
    month: normalizeMonthStart(input.month),
    sku: input.sku,
    target_units: targetUnits,
    actual_units: actualUnits,
    ads_active_channel_units: adsActiveUnits,
    organic_channel_units: actualUnits - adsActiveUnits,
    total_ads_spent: totalAdsSpent,
    total_budget_cap: totalBudgetCap,
    gross_profit: grossProfit,
    profit_after_ads: grossProfit - totalAdsSpent,
    channels,
  }
}

export function buildSkuChannelMonthlyPerformance(input: {
  orders: MonthlyAdsReportOrder[]
  products: MonthlyAdsReportProduct[]
}): SkuChannelMonthlyPerformance[] {
  const productBySku = new Map(
    input.products.map((product) => [product.sku, product]),
  )
  const performanceByKey = new Map<string, SkuChannelMonthlyPerformance>()

  for (const order of input.orders) {
    const lineItems = order.order_line_items || []
    const totalOrderValue = lineItems.reduce((sum, item) => {
      return sum + (item.selling_price || 0) * (item.quantity || 0)
    }, 0)

    for (const lineItem of lineItems) {
      const key = `${lineItem.sku}::${order.channel}`
      const existing = performanceByKey.get(key) || {
        sku: lineItem.sku,
        channel: order.channel,
        units: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      }
      const itemRevenue = calculateLineItemRevenue({
        quantity: lineItem.quantity,
        selling_price: lineItem.selling_price,
        orderChannelFees: order.channel_fees,
        totalOrderValue,
      })
      const itemCost = getLineItemTotalCost(
        lineItem,
        productBySku.get(lineItem.sku),
      )

      performanceByKey.set(key, {
        sku: lineItem.sku,
        channel: order.channel,
        units: existing.units + (lineItem.quantity || 0),
        revenue: existing.revenue + itemRevenue,
        cost: existing.cost + itemCost,
        profit: existing.profit + (itemRevenue - itemCost),
      })
    }
  }

  return Array.from(performanceByKey.values()).sort((left, right) => {
    return (
      left.sku.localeCompare(right.sku) ||
      left.channel.localeCompare(right.channel)
    )
  })
}

export function buildMonthlyAdsReportBundle(input: {
  month: string
  orders: MonthlyAdsReportOrder[]
  products: MonthlyAdsReportProduct[]
  setups: SkuAdSetup[]
  spendRows: MonthlyAdSpend[]
  targets: SkuSalesTarget[]
}): MonthlyAdsReportBundle {
  const month = normalizeMonthStart(input.month)
  const productBySku = new Map(
    input.products.map((product) => [product.sku, product]),
  )
  const channelPerformance = buildSkuChannelMonthlyPerformance({
    orders: input.orders,
    products: input.products,
  })
  const skuSet = collectRelevantSkus({
    month,
    channelPerformance,
    setups: input.setups,
    spendRows: input.spendRows,
    targets: input.targets,
  })

  const skuSummaries = Array.from(skuSet)
    .sort((left, right) => left.localeCompare(right))
    .map((sku) =>
      computeSkuMonthlySummary({
        month,
        sku,
        channelPerformance,
        setups: input.setups,
        monthlySpend: input.spendRows,
        salesTargets: input.targets,
      }),
    )

  const monthlySpendRows = sortMonthlyAdSpendRows(
    input.spendRows.filter((row) => normalizeMonthStart(row.month) === month),
  )
  const missingSpendScopes = buildMissingSpendScopes({
    month,
    setups: input.setups,
    spendRows: monthlySpendRows,
    productBySku,
  })
  const missingScopeKeySet = new Set(
    missingSpendScopes.map((scope) =>
      buildSkuScopeMonthKey(month, scope.sku, scope.channels),
    ),
  )

  const channelBreakdown = skuSummaries
    .flatMap((summary) =>
      summary.channels.map((channelRow) =>
        buildChannelBreakdownRow({
          month,
          summary,
          channelRow,
          product: productBySku.get(summary.sku),
          setups: input.setups,
          missingScopeKeySet,
        }),
      ),
    )
    .sort((left, right) => {
      return (
        left.sku.localeCompare(right.sku) ||
        left.channel.localeCompare(right.channel)
      )
    })

  return {
    month,
    skuSummaries,
    channelBreakdown,
    missingSpendScopes,
    monthlySpendRows,
    totals: rollupMonthlyAdsReportTotals({ skuSummaries, missingSpendScopes }),
    load_error: null,
  }
}

export function createMonthlyAdsReportLoadErrorBundle(input: {
  month: string
  load_error: string
}): MonthlyAdsReportBundle {
  return {
    month: normalizeMonthStart(input.month),
    skuSummaries: [],
    channelBreakdown: [],
    missingSpendScopes: [],
    monthlySpendRows: [],
    totals: createEmptyMonthlyAdsReportTotals(),
    load_error: input.load_error,
  }
}

export function normalizeMonthStart(value: string) {
  const parsed = parseDateOnly(value)
  return formatDateOnly(
    new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1)),
  )
}

export function endOfMonthIso(value: string) {
  const monthStart = parseDateOnly(normalizeMonthStart(value))
  return formatDateOnly(
    new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
    ),
  )
}

function collectRelevantSkus(input: {
  month: string
  channelPerformance: SkuChannelMonthlyPerformance[]
  setups: SkuAdSetup[]
  spendRows: MonthlyAdSpend[]
  targets: SkuSalesTarget[]
}) {
  const skuSet = new Set<string>()

  for (const row of input.channelPerformance) {
    skuSet.add(row.sku)
  }

  for (const setup of input.setups) {
    if (isDateRangeOverlappingMonth(input.month, setup.start_date, setup.end_date)) {
      skuSet.add(setup.sku)
    }
  }

  for (const spendRow of input.spendRows) {
    if (normalizeMonthStart(spendRow.month) === input.month) {
      skuSet.add(spendRow.sku)
    }
  }

  for (const target of input.targets) {
    if (
      isDateRangeOverlappingMonth(
        input.month,
        target.effective_from,
        target.effective_to,
      )
    ) {
      skuSet.add(target.sku)
    }
  }

  return skuSet
}

function buildChannelBreakdownRow(input: {
  month: string
  summary: SkuMonthlySummary
  channelRow: SkuMonthlyChannelSummary
  product: MonthlyAdsReportProduct | undefined
  setups: SkuAdSetup[]
  missingScopeKeySet: Set<string>
}): MonthlyAdsChannelBreakdownRow {
  const actualSpendMissing =
    input.channelRow.classification === "ads-active" &&
    input.setups.some(
      (setup) =>
        setup.sku === input.summary.sku &&
        setup.status === "active" &&
        isDateRangeOverlappingMonth(
          input.month,
          setup.start_date,
          setup.end_date,
        ) &&
        scopeIncludesChannel(getScopeChannels(setup), input.channelRow.channel) &&
        input.missingScopeKeySet.has(
          buildSkuScopeMonthKey(
            input.month,
            input.summary.sku,
            getScopeChannels(setup),
          ),
        ),
    )

  return {
    month: input.summary.month,
    sku: input.summary.sku,
    product_name: input.product?.name || null,
    product_variant: input.product?.variant || null,
    ...input.channelRow,
    profit_after_ads: input.channelRow.uses_shared_budget
      ? input.channelRow.profit
      : input.channelRow.profit - input.channelRow.ads_spent,
    actual_spend_missing: actualSpendMissing,
  }
}

function rollupMonthlyAdsReportTotals(input: {
  skuSummaries: SkuMonthlySummary[]
  missingSpendScopes: MonthlyAdsMissingSpendScope[]
}): MonthlyAdsReportTotals {
  const totals = input.skuSummaries.reduce<MonthlyAdsReportTotals>(
    (aggregate, summary) => {
      aggregate.total_target_units += summary.target_units
      aggregate.total_actual_units += summary.actual_units
      aggregate.ads_active_channel_units += summary.ads_active_channel_units
      aggregate.organic_channel_units += summary.organic_channel_units
      aggregate.total_ads_spent += summary.total_ads_spent
      aggregate.total_budget_cap += summary.total_budget_cap
      aggregate.profit_before_ads += summary.gross_profit
      aggregate.profit_after_ads += summary.profit_after_ads
      return aggregate
    },
    createEmptyMonthlyAdsReportTotals(),
  )

  totals.ads_active_rows_missing_spend = input.missingSpendScopes.length
  totals.has_missing_spend = totals.ads_active_rows_missing_spend > 0
  totals.target_achievement_percent =
    totals.total_target_units > 0
      ? (totals.total_actual_units / totals.total_target_units) * 100
      : 0

  return totals
}

function createEmptyMonthlyAdsReportTotals(): MonthlyAdsReportTotals {
  return {
    total_target_units: 0,
    total_actual_units: 0,
    ads_active_channel_units: 0,
    organic_channel_units: 0,
    total_ads_spent: 0,
    total_budget_cap: 0,
    profit_before_ads: 0,
    profit_after_ads: 0,
    target_achievement_percent: 0,
    has_missing_spend: false,
    ads_active_rows_missing_spend: 0,
  }
}

function sortMonthlyAdSpendRows(rows: MonthlyAdSpend[]) {
  return rows.sort((left, right) => {
    return (
      left.sku.localeCompare(right.sku) ||
      getScopeKey(left).localeCompare(getScopeKey(right))
    )
  })
}

function calculateLineItemRevenue(input: {
  quantity: number
  selling_price: number
  orderChannelFees: number | null
  totalOrderValue: number
}) {
  const grossRevenue = (input.selling_price || 0) * (input.quantity || 0)

  if (!input.orderChannelFees || input.totalOrderValue <= 0) {
    return grossRevenue
  }

  return grossRevenue - (input.orderChannelFees * grossRevenue) / input.totalOrderValue
}

function buildSkuScopeMonthKey(
  month: string,
  sku: string,
  channels: readonly Channel[],
) {
  return `${normalizeMonthStart(month)}::${sku}::${buildChannelScopeKey(channels)}`
}

function getScopeChannels(input: {
  channels?: readonly Channel[] | null
  channel?: Channel | null
}) {
  return normalizeChannels(input.channels ?? (input.channel ? [input.channel] : []))
}

function getScopeKey(input: {
  channels?: readonly Channel[] | null
  channel?: Channel | null
  channel_scope_key?: string | null
}) {
  return input.channel_scope_key ?? buildChannelScopeKey(getScopeChannels(input))
}

function isDateRangeOverlappingMonth(
  month: string,
  startDate: string,
  endDate: string | null,
) {
  const monthStart = parseDateOnly(normalizeMonthStart(month))
  const monthEnd = parseDateOnly(endOfMonthIso(month))
  const rangeStart = parseDateOnly(startDate)
  const rangeEnd = endDate ? parseDateOnly(endDate) : MAX_DATE

  return rangeStart <= monthEnd && rangeEnd >= monthStart
}

function getActiveDaysInMonth(input: {
  month: string
  start_date: string
  end_date: string | null
}): number {
  const overlap = getOverlapRange(
    getMonthRange(input.month),
    {
      start: parseDateOnly(input.start_date),
      end: input.end_date ? parseDateOnly(input.end_date) : null,
    },
  )

  if (!overlap) {
    return 0
  }

  return diffDaysInclusive(overlap.start, overlap.end)
}

function getActiveOverlappingSetupsForMonth(input: {
  month: string
  sku: string
  setups: ReportingSetup[]
}): ReportingSetup[] {
  const monthRange = getMonthRange(input.month)

  return input.setups.filter((setup) => {
    if (setup.sku !== input.sku || setup.status !== "active") {
      return false
    }

    return rangesOverlap(monthRange, {
      start: parseDateOnly(setup.start_date),
      end: setup.end_date ? parseDateOnly(setup.end_date) : null,
    })
  })
}

function buildMissingSpendScopes(input: {
  month: string
  setups: SkuAdSetup[]
  spendRows: MonthlyAdSpend[]
  productBySku: Map<string, MonthlyAdsReportProduct>
}) {
  const activeSetups = input.setups.filter(
    (setup) =>
      setup.status === "active" &&
      isDateRangeOverlappingMonth(input.month, setup.start_date, setup.end_date),
  )
  const spendScopeKeySet = new Set(
    input.spendRows.map((row) =>
      buildSkuScopeMonthKey(input.month, row.sku, getScopeChannels(row)),
    ),
  )

  return activeSetups
    .filter(
      (setup) =>
        !spendScopeKeySet.has(
          buildSkuScopeMonthKey(input.month, setup.sku, getScopeChannels(setup)),
        ),
    )
    .map((setup) => {
      const product = input.productBySku.get(setup.sku)

      return {
        month: normalizeMonthStart(input.month),
        sku: setup.sku,
        channels: getScopeChannels(setup),
        budget_cap:
          typeof setup.daily_budget_cap === "number"
            ? computeMonthlyBudgetCap({
                month: input.month,
                daily_budget_cap: setup.daily_budget_cap,
                start_date: setup.start_date,
                end_date: setup.end_date,
              })
            : 0,
        product_name: product?.name || null,
        product_variant: product?.variant || null,
      }
    })
    .sort((left, right) => {
      return (
        left.sku.localeCompare(right.sku) ||
        buildChannelScopeKey(left.channels).localeCompare(buildChannelScopeKey(right.channels))
      )
    })
}

function getMonthRange(month: string): { start: Date; end: Date } {
  const normalizedMonth = normalizeMonthStart(month)
  const start = parseDateOnly(normalizedMonth)

  return {
    start,
    end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)),
  }
}

function isSameMonth(left: string, right: string): boolean {
  return normalizeMonthStart(left) === normalizeMonthStart(right)
}

function getOverlapRange(
  left: { start: Date; end: Date | null },
  right: { start: Date; end: Date | null },
): { start: Date; end: Date } | null {
  const effectiveLeftEnd = left.end ?? MAX_DATE
  const effectiveRightEnd = right.end ?? MAX_DATE
  const start = left.start > right.start ? left.start : right.start
  const end = effectiveLeftEnd < effectiveRightEnd ? effectiveLeftEnd : effectiveRightEnd

  if (start > end) {
    return null
  }

  return { start, end }
}

function rangesOverlap(
  left: { start: Date; end: Date | null },
  right: { start: Date; end: Date | null },
): boolean {
  return getOverlapRange(left, right) !== null
}

function diffDaysInclusive(start: Date, end: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000
  return Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay) + 1
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDateOnly(value: Date): string {
  const year = value.getUTCFullYear()
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0")
  const day = `${value.getUTCDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

const MAX_DATE = new Date(Date.UTC(9999, 11, 31))
