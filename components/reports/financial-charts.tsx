"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatCurrency } from "@/lib/utils"
import { FINANCIAL_SERIES, formatCompactRupiahAxis } from "@/lib/reports/presentation"

type ChartRow = Record<string, string | number | boolean | null | undefined>
type TooltipPayloadEntry = {
  dataKey?: string | number
  value?: string | number
}
type FinancialTooltipProps = {
  active?: boolean
  label?: string | number
  payload?: TooltipPayloadEntry[]
  labelFormatter: (label: string) => string
}

function FinancialLegend() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground">
      {FINANCIAL_SERIES.map((series) => (
        <div key={series.key} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: series.color }} />
          <span>{series.label}</span>
        </div>
      ))}
    </div>
  )
}

function FinancialTooltip({
  active,
  label,
  payload,
  labelFormatter,
}: FinancialTooltipProps) {
  if (!active || !payload?.length) return null

  const values = new Map(
    payload.map((entry) => [String(entry.dataKey), Number(entry.value || 0)]),
  )

  return (
    <div className="min-w-56 rounded-xl border bg-card p-3 text-sm shadow-xl">
      <div className="mb-2 font-semibold text-foreground">
        {labelFormatter(String(label ?? ""))}
      </div>
      <div className="space-y-1.5">
        {FINANCIAL_SERIES.map((series) => (
          <div key={series.key} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2" style={{ color: series.color }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} />
              {series.label}
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {formatCurrency(values.get(series.key) || 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function UnitsTooltip({
  active,
  label,
  payload,
  labelFormatter,
}: FinancialTooltipProps) {
  if (!active || !payload?.length) return null

  const units = Number(payload[0]?.value || 0)

  return (
    <div className="min-w-48 rounded-xl border bg-card p-3 text-sm shadow-xl">
      <div className="mb-2 font-semibold text-foreground">
        {labelFormatter(String(label ?? ""))}
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="flex items-center gap-2 text-violet-600">
          <span className="h-2 w-2 rounded-full bg-violet-500" />
          Units Sold
        </span>
        <span className="font-semibold tabular-nums text-foreground">
          {units.toLocaleString("id-ID")}
        </span>
      </div>
    </div>
  )
}

export function FinancialTrendChart({
  data,
  xKey,
  xTickFormatter,
  labelFormatter,
}: {
  data: ChartRow[]
  xKey: string
  xTickFormatter: (value: string) => string
  labelFormatter: (label: string) => string
}) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={data} margin={{ top: 12, right: 24, left: 32, bottom: 8 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={xTickFormatter}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            tickMargin={12}
          />
          <YAxis
            width={88}
            tickFormatter={formatCompactRupiahAxis}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
            content={(props) => (
              <FinancialTooltip
                active={props.active}
                label={props.label}
                payload={props.payload as TooltipPayloadEntry[] | undefined}
                labelFormatter={labelFormatter}
              />
            )}
          />
          {FINANCIAL_SERIES.map((series, index) => (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={series.color}
              strokeWidth={index < 2 ? 3 : 2.5}
              dot={{ r: 3, fill: "hsl(var(--card))", strokeWidth: 2 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <FinancialLegend />
    </div>
  )
}

export function FinancialComparisonChart({
  data,
  categoryKey,
  categoryFormatter = (value) => value,
  height = 360,
}: {
  data: ChartRow[]
  categoryKey: string
  categoryFormatter?: (value: string) => string
  height?: number
}) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 16, bottom: 8 }}
          barCategoryGap="20%"
        >
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 5" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={formatCompactRupiahAxis}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            tickMargin={10}
          />
          <YAxis
            dataKey={categoryKey}
            type="category"
            width={150}
            tickFormatter={categoryFormatter}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.45)" }}
            content={(props) => (
              <FinancialTooltip
                active={props.active}
                label={props.label}
                payload={props.payload as TooltipPayloadEntry[] | undefined}
                labelFormatter={categoryFormatter}
              />
            )}
          />
          {FINANCIAL_SERIES.map((series) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.label}
              fill={series.color}
              radius={[0, 4, 4, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <FinancialLegend />
    </div>
  )
}

export function UnitsTrendChart({
  data,
  xKey,
  xTickFormatter,
  labelFormatter,
}: {
  data: ChartRow[]
  xKey: string
  xTickFormatter: (value: string) => string
  labelFormatter: (label: string) => string
}) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 12, right: 24, left: 8, bottom: 8 }} barCategoryGap="22%">
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={xTickFormatter}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            tickMargin={12}
          />
          <YAxis
            width={48}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
            content={(props) => (
              <UnitsTooltip
                active={props.active}
                label={props.label}
                payload={props.payload as TooltipPayloadEntry[] | undefined}
                labelFormatter={labelFormatter}
              />
            )}
          />
          <Bar dataKey="units_sold" fill="#8b5cf6" name="Units Sold" radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="h-2.5 w-2.5 rounded-sm bg-violet-500" />
        <span>Units Sold</span>
      </div>
    </div>
  )
}
