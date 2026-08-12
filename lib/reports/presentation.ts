export const FINANCIAL_SERIES = [
  { key: "gmv", label: "GMV", color: "#7457df" },
  { key: "revenue", label: "Revenue", color: "#3478d4" },
  { key: "cost", label: "Cost", color: "#e6922e" },
  { key: "profit", label: "Profit", color: "#16a16c" },
] as const

const formatOneDecimal = (value: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)

export function formatCompactRupiahAxis(value: number) {
  const absolute = Math.abs(value)

  if (absolute >= 1_000_000_000) {
    return `Rp ${formatOneDecimal(value / 1_000_000_000)} M`
  }

  if (absolute >= 1_000_000) {
    return `Rp ${formatOneDecimal(value / 1_000_000)} jt`
  }

  if (absolute >= 1_000) {
    return `Rp ${formatOneDecimal(value / 1_000)} rb`
  }

  return `Rp ${formatOneDecimal(value)}`
}

export function sortByGmvDescending<T extends { gmv: number }>(rows: readonly T[]) {
  return [...rows].sort((a, b) => b.gmv - a.gmv)
}
