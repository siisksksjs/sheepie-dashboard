/**
 * Shared chart tokens. These mirror the values used by the financial report
 * charts so every chart in the dashboard reads as one system.
 *
 * Colors are plain hex custom properties in `globals.css`, not HSL triplets, so
 * they are referenced as `var(--token)` directly. Wrapping them in `hsl()`
 * produces an invalid color and Recharts falls back to black.
 */

export const CHART_GRID = {
  stroke: "var(--border)",
  strokeDasharray: "3 5",
} as const

export const CHART_AXIS = {
  axisLine: false,
  tickLine: false,
  tick: { fill: "var(--muted-foreground)", fontSize: 12 },
} as const

export const CHART_CATEGORY_AXIS = {
  axisLine: false,
  tickLine: false,
  tick: { fill: "var(--foreground)", fontSize: 12 },
} as const

export const CHART_LINE_CURSOR = { stroke: "var(--border)", strokeWidth: 1 } as const
export const CHART_BAR_CURSOR = { fill: "var(--muted)" } as const

/** Brand series colors, ordered to match the financial report charts. */
export const CHART_COLORS = {
  violet: "#7457df",
  blue: "#3478d4",
  orange: "#e6922e",
  green: "#16a16c",
  red: "#d9534f",
  teal: "#00a3a3",
  purple: "#a855f7",
  slate: "#64748b",
} as const

export const CHART_PALETTE = [
  CHART_COLORS.violet,
  CHART_COLORS.blue,
  CHART_COLORS.orange,
  CHART_COLORS.green,
  CHART_COLORS.red,
  CHART_COLORS.teal,
  CHART_COLORS.purple,
  CHART_COLORS.slate,
] as const
