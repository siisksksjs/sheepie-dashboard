import type { ShippingMode } from "./config"

const MS_PER_DAY = 86_400_000

export type ShipmentSample = {
  sku: string
  shipping_mode: ShippingMode
  order_date: string
  arrival_date: string | null
}

export type AverageLatestLeadTimesInput = {
  sku: string
  shippingMode: ShippingMode
  samples: ShipmentSample[]
}

export type ReorderWindowInput = {
  avgDaily: number
  learnedLeadDays: number | null
  fallbackLeadMin: number
  fallbackLeadMax: number
  bufferDays: number
}

export type ReorderWindowResult = {
  leadDays: number | null
  reorderMin: number
  reorderMax: number
  isFallback: boolean
}

export type LeadBufferLabelInput = {
  leadDays: number | null
  fallbackLeadMin: number
  fallbackLeadMax: number
  bufferDays: number
  isFallback: boolean
}

function daysBetween(orderDate: string, arrivalDate: string): number | null {
  const start = new Date(`${orderDate}T00:00:00.000Z`)
  const end = new Date(`${arrivalDate}T00:00:00.000Z`)
  const diffMs = end.getTime() - start.getTime()

  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return null
  }

  return Math.round(diffMs / MS_PER_DAY)
}

export function averageLatestLeadTimes(
  input: AverageLatestLeadTimesInput,
): number | null {
  const completed = input.samples
    .filter((sample): sample is ShipmentSample & { arrival_date: string } => {
      return (
        sample.sku === input.sku &&
        sample.shipping_mode === input.shippingMode &&
        sample.arrival_date !== null
      )
    })
    .sort((a, b) => b.arrival_date.localeCompare(a.arrival_date))
    .map((sample) => ({
      ...sample,
      leadDays: daysBetween(sample.order_date, sample.arrival_date),
    }))
    .filter((sample): sample is ShipmentSample & {
      arrival_date: string
      leadDays: number
    } => sample.leadDays !== null)
    .slice(0, 3)

  if (completed.length === 0) {
    return null
  }

  const totalLeadDays = completed.reduce((sum, sample) => {
    return sum + sample.leadDays
  }, 0)

  return Math.round(totalLeadDays / completed.length)
}

export function buildReorderWindow(
  input: ReorderWindowInput,
): ReorderWindowResult {
  if (input.learnedLeadDays !== null) {
    const totalDays = input.learnedLeadDays + input.bufferDays
    const reorderUnits = Math.ceil(input.avgDaily * totalDays)

    return {
      leadDays: input.learnedLeadDays,
      reorderMin: reorderUnits,
      reorderMax: reorderUnits,
      isFallback: false,
    }
  }

  return {
    leadDays: null,
    reorderMin: Math.ceil(
      input.avgDaily * (input.fallbackLeadMin + input.bufferDays),
    ),
    reorderMax: Math.ceil(
      input.avgDaily * (input.fallbackLeadMax + input.bufferDays),
    ),
    isFallback: true,
  }
}

export function buildLeadBufferLabel(input: LeadBufferLabelInput): string {
  if (input.isFallback || input.leadDays === null) {
    return `Fallback ${input.fallbackLeadMin}-${input.fallbackLeadMax}d + Buffer ${input.bufferDays}d`
  }

  const totalDays = input.leadDays + input.bufferDays

  return `Lead ${input.leadDays}d + Buffer ${input.bufferDays}d = ${totalDays}d`
}
