const MS_PER_DAY = 86_400_000

type InventoryDayDelta = {
  entry_date: string
  quantity: number
}

type CalculateInStockDaysInput = {
  currentStock: number
  startDate: string
  endDate: string
  deltas: InventoryDayDelta[]
}

function toIsoDay(date: string) {
  return date.slice(0, 10)
}

export function calculateInStockDays(input: CalculateInStockDaysInput): number {
  const start = new Date(`${toIsoDay(input.startDate)}T00:00:00.000Z`)
  const end = new Date(`${toIsoDay(input.endDate)}T00:00:00.000Z`)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0
  }

  const deltaByDate = new Map<string, number>()
  let postStartDelta = 0

  for (const delta of input.deltas) {
    const day = toIsoDay(delta.entry_date)
    deltaByDate.set(day, (deltaByDate.get(day) || 0) + delta.quantity)
    postStartDelta += delta.quantity
  }

  let openingStock = input.currentStock - postStartDelta
  let inStockDays = 0

  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += MS_PER_DAY) {
    const day = new Date(cursor).toISOString().slice(0, 10)
    const dayDelta = deltaByDate.get(day) || 0

    if (openingStock > 0 || openingStock + dayDelta > 0) {
      inStockDays += 1
    }

    openingStock += dayDelta
  }

  return inStockDays
}
