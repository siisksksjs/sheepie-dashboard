export type SalesPackSize = "single" | "bundle_2" | "bundle_3" | "bundle_4"

export type SalesLineInput<Key extends string = string> = {
  key: Key
  sellingPrice: number
  quantity: number
  packSize?: SalesPackSize | null
  unitCost?: number | null
}

export type SalesLineMetrics<Key extends string = string> = {
  key: Key
  units: number
  gmv: number
  channelFees: number
  revenue: number
  cogs: number
  profit: number
  hasCompleteCostData: boolean
}

export const QUALIFYING_SALES_STATUSES = ["paid", "shipped"] as const

export function getSalesPackMultiplier(packSize?: SalesPackSize | string | null) {
  if (packSize === "bundle_2") return 2
  if (packSize === "bundle_3") return 3
  if (packSize === "bundle_4") return 4
  return 1
}

export function isQualifyingSalesStatus(status: string) {
  return QUALIFYING_SALES_STATUSES.some((candidate) => candidate === status)
}

export function resolveSalesUnitCost(snapshot?: number | null, current?: number | null) {
  if (snapshot !== null && snapshot !== undefined) return Number(snapshot)
  if (current !== null && current !== undefined) return Number(current)
  return null
}

export function calculateSalesOrder<Key extends string>(input: {
  channelFees?: number | null
  lines: SalesLineInput<Key>[]
}) {
  const prepared = input.lines.map((line) => {
    const quantity = Number(line.quantity || 0)
    const units = quantity * getSalesPackMultiplier(line.packSize)
    const gmv = Number(line.sellingPrice || 0) * quantity
    const hasCompleteCostData = line.unitCost !== null && line.unitCost !== undefined
    const cogs = hasCompleteCostData ? Number(line.unitCost) * units : 0
    return { ...line, units, gmv, cogs, hasCompleteCostData }
  })
  const gmv = prepared.reduce((sum, line) => sum + line.gmv, 0)
  const channelFees = prepared.length > 0 ? Number(input.channelFees || 0) : 0
  let allocatedFees = 0

  const lines: SalesLineMetrics<Key>[] = prepared.map((line, index) => {
    const isLast = index === prepared.length - 1
    const lineFees = isLast
      ? channelFees - allocatedFees
      : gmv > 0
        ? (channelFees * line.gmv) / gmv
        : 0
    allocatedFees += lineFees
    const revenue = line.gmv - lineFees

    return {
      key: line.key,
      units: line.units,
      gmv: line.gmv,
      channelFees: lineFees,
      revenue,
      cogs: line.cogs,
      profit: revenue - line.cogs,
      hasCompleteCostData: line.hasCompleteCostData,
    }
  })

  const totals = lines.reduce(
    (sum, line) => ({
      gmv: sum.gmv + line.gmv,
      channelFees: sum.channelFees + line.channelFees,
      revenue: sum.revenue + line.revenue,
      cogs: sum.cogs + line.cogs,
      profit: sum.profit + line.profit,
      hasCompleteCostData: sum.hasCompleteCostData && line.hasCompleteCostData,
    }),
    { gmv: 0, channelFees: 0, revenue: 0, cogs: 0, profit: 0, hasCompleteCostData: true },
  )

  return { lines, totals }
}
