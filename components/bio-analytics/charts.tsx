"use client"

import type { ReactNode } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { buildFunnelSteps, percent, summarizeScrollDepth } from "@/lib/bio-analytics/metrics"
import type {
  BioFunnelCounts,
  BioHeatmapCell,
  BioMarketplaceRow,
  BioProductRow,
  BioScrollRow,
  BioSectionRow,
  MergedTrafficPoint,
  TrafficBreakdownRow,
} from "@/lib/bio-analytics/types"
import {
  CHART_AXIS,
  CHART_BAR_CURSOR,
  CHART_CATEGORY_AXIS,
  CHART_COLORS,
  CHART_GRID,
  CHART_LINE_CURSOR,
  CHART_PALETTE,
} from "@/lib/charts/theme"
import {
  DESTINATION_LABELS,
  PRODUCT_LABELS,
  SECTION_LABELS,
  TRAFFIC_SERIES,
  WEEKDAY_LABELS,
  formatCount,
  formatPercent,
  labelFor,
} from "./presentation"

type SourceLabel = "PostHog" | "Supabase" | "PostHog + Supabase"

type TooltipPayloadEntry = {
  name?: string
  dataKey?: string | number
  value?: number
  color?: string
}

type ChartCardProps = {
  title: string
  description: string
  source: SourceLabel
  info?: string
  isEmpty: boolean
  emptyMessage?: string
  children: ReactNode
}

export function ChartCard({
  title,
  description,
  source,
  info,
  isEmpty,
  emptyMessage = "No data for this range and filter set.",
  children,
}: ChartCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center text-base">
              {title}
              {info ? <InfoTooltip content={info} /> : null}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0">
            Source: {source}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

function ChartLegend({
  series,
}: {
  series: ReadonlyArray<{ key: string; label: string; color: string }>
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground">
      {series.map((entry) => (
        <div key={entry.key} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span>{entry.label}</span>
        </div>
      ))}
    </div>
  )
}

function BioTooltip({
  active,
  payload,
  label,
  valueFormatter = formatCount,
}: {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string | number
  valueFormatter?: (value: number) => string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="min-w-48 rounded-xl border bg-card p-3 text-sm shadow-xl">
      <div className="mb-2 font-semibold text-foreground">{String(label ?? "")}</div>
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2" style={{ color: entry.color }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {valueFormatter(Number(entry.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Screen-reader and print fallback for every chart. */
function DataTableFallback({
  caption,
  headers,
  rows,
}: {
  caption: string
  headers: string[]
  rows: Array<Array<string | number>>
}) {
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-xs text-muted-foreground">View as table</summary>
      <table className="mt-2 w-full text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {headers.map((header) => (
              <th key={header} scope="col" className="py-1 pr-3 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-dashed last:border-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="py-1 pr-3 tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

export function TrafficChart({ points }: { points: MergedTrafficPoint[] }) {
  return (
    <ChartCard
      title="Traffic and behavior over time"
      description="Visitors are counted by PostHog; sessions and outbound clicks come from bio events."
      source="PostHog + Supabase"
      info="The two sources are counted separately and never merged into a single number. An outbound click is not a purchase."
      isEmpty={points.length === 0}
    >
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={points} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid {...CHART_GRID} vertical={false} />
          <XAxis dataKey="timestamp" {...CHART_AXIS} tickMargin={12} />
          <YAxis width={56} allowDecimals={false} {...CHART_AXIS} />
          <Tooltip cursor={CHART_LINE_CURSOR} content={(props) => (
            <BioTooltip
              active={props.active}
              label={props.label}
              payload={props.payload as TooltipPayloadEntry[] | undefined}
            />
          )} />
          <Bar
            dataKey="clicks"
            name={TRAFFIC_SERIES[2].label}
            fill={TRAFFIC_SERIES[2].color}
            radius={[4, 4, 0, 0]}
            barSize={18}
          />
          {TRAFFIC_SERIES.slice(0, 2).map((series) => (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={series.color}
              strokeWidth={3}
              dot={{ r: 3, fill: "var(--card)", strokeWidth: 2 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend series={TRAFFIC_SERIES} />
      <DataTableFallback
        caption="Traffic and behavior per period"
        headers={["Period", "Visitors", "Sessions", "Outbound clicks"]}
        rows={points.map((point) => [point.timestamp, point.visitors, point.sessions, point.clicks])}
      />
    </ChartCard>
  )
}

export function BreakdownChart({
  title,
  description,
  source,
  rows,
  labelHeader,
  info,
}: {
  title: string
  description: string
  source: SourceLabel
  rows: TrafficBreakdownRow[]
  labelHeader: string
  info?: string
}) {
  const data = rows.slice(0, 10).map((row) => ({ label: row.x ?? "Unknown", value: row.y }))
  const total = data.reduce((sum, row) => sum + row.value, 0)

  return (
    <ChartCard
      title={title}
      description={description}
      source={source}
      info={info}
      isEmpty={data.length === 0}
    >
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 38)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 16, bottom: 8 }}
          barCategoryGap="20%"
        >
          <CartesianGrid {...CHART_GRID} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tickMargin={10} {...CHART_AXIS} />
          <YAxis type="category" dataKey="label" width={130} {...CHART_CATEGORY_AXIS} />
          <Tooltip cursor={CHART_BAR_CURSOR} content={(props) => (
            <BioTooltip
              active={props.active}
              label={props.label}
              payload={props.payload as TooltipPayloadEntry[] | undefined}
            />
          )} />
          <Bar dataKey="value" name={labelHeader} radius={[0, 4, 4, 0]}>
            {data.map((row, index) => (
              <Cell key={row.label} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <DataTableFallback
        caption={title}
        headers={[labelHeader, "Count", "Share"]}
        rows={data.map((row) => [
          row.label,
          formatCount(row.value),
          formatPercent(percent(row.value, total)),
        ])}
      />
    </ChartCard>
  )
}

const PRODUCT_SERIES = [
  { key: "views", label: "Sessions that viewed", color: CHART_COLORS.violet },
  { key: "clicks", label: "Sessions that clicked out", color: CHART_COLORS.green },
] as const

export function ProductPerformanceChart({ rows }: { rows: BioProductRow[] }) {
  const data = rows.map((row) => ({
    label: labelFor(PRODUCT_LABELS, row.product_slug),
    views: row.views,
    clicks: row.clicks,
    ctr: row.ctr,
  }))

  return (
    <ChartCard
      title="Product performance"
      description="Sessions that viewed each product and went on to click through to a marketplace."
      source="Supabase"
      info="CTR is the share of sessions that viewed a product and then clicked an outbound link. It is not a purchase conversion rate."
      isEmpty={data.length === 0}
    >
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 12, right: 24, left: 8, bottom: 8 }} barCategoryGap="22%">
          <CartesianGrid {...CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tickMargin={12} {...CHART_CATEGORY_AXIS} />
          <YAxis width={48} allowDecimals={false} {...CHART_AXIS} />
          <Tooltip cursor={CHART_BAR_CURSOR} content={(props) => (
            <BioTooltip
              active={props.active}
              label={props.label}
              payload={props.payload as TooltipPayloadEntry[] | undefined}
            />
          )} />
          {PRODUCT_SERIES.map((series) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.label}
              fill={series.color}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ChartLegend series={PRODUCT_SERIES} />
      <DataTableFallback
        caption="Product performance"
        headers={["Product", "Sessions that viewed", "Sessions that clicked out", "Outbound CTR"]}
        rows={data.map((row) => [
          row.label,
          formatCount(row.views),
          formatCount(row.clicks),
          formatPercent(row.ctr),
        ])}
      />
    </ChartCard>
  )
}

export function MarketplaceChart({ rows }: { rows: BioMarketplaceRow[] }) {
  const data = rows.map((row) => ({
    label: labelFor(DESTINATION_LABELS, row.destination),
    clicks: row.clicks,
  }))
  const total = data.reduce((sum, row) => sum + row.clicks, 0)

  return (
    <ChartCard
      title="Outbound click destinations"
      description="Shopee versus Tokopedia and every other destination."
      source="Supabase"
      info="Counts clicks toward a destination, not orders or revenue."
      isEmpty={data.length === 0}
    >
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 16, bottom: 8 }}
          barCategoryGap="20%"
        >
          <CartesianGrid {...CHART_GRID} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tickMargin={10} {...CHART_AXIS} />
          <YAxis type="category" dataKey="label" width={110} {...CHART_CATEGORY_AXIS} />
          <Tooltip cursor={CHART_BAR_CURSOR} content={(props) => (
            <BioTooltip
              active={props.active}
              label={props.label}
              payload={props.payload as TooltipPayloadEntry[] | undefined}
            />
          )} />
          <Bar dataKey="clicks" name="Outbound clicks" radius={[0, 4, 4, 0]}>
            {data.map((row, index) => (
              <Cell key={row.label} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <DataTableFallback
        caption="Outbound click destinations"
        headers={["Destination", "Clicks", "Share"]}
        rows={data.map((row) => [
          row.label,
          formatCount(row.clicks),
          formatPercent(percent(row.clicks, total)),
        ])}
      />
    </ChartCard>
  )
}

export function FunnelChart({ counts }: { counts: BioFunnelCounts }) {
  const steps = buildFunnelSteps(counts)
  const first = steps[0]?.sessions ?? 0

  return (
    <ChartCard
      title="Visit funnel"
      description="Page view → section view → product view → outbound click."
      source="Supabase"
      info="Each stage counts unique sessions. The last stage is an outbound click, not a purchase."
      isEmpty={first === 0}
    >
      <ol className="space-y-3">
        {steps.map((step) => (
          <li key={step.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{step.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatCount(step.sessions)} sessions · {formatPercent(step.conversionFromFirst)} of first
              </span>
            </div>
            <div
              className="h-3 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${step.label}: ${formatCount(step.sessions)} sessions, ${formatPercent(
                step.conversionFromFirst,
              )} of the first stage`}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, step.conversionFromFirst))}%`,
                  backgroundColor: CHART_COLORS.violet,
                }}
              />
            </div>
          </li>
        ))}
      </ol>
      <DataTableFallback
        caption="Visit funnel"
        headers={["Stage", "Sessions", "Of first", "Of previous"]}
        rows={steps.map((step) => [
          step.label,
          formatCount(step.sessions),
          formatPercent(step.conversionFromFirst),
          formatPercent(step.conversionFromPrevious),
        ])}
      />
    </ChartCard>
  )
}

export function SectionReachChart({ rows }: { rows: BioSectionRow[] }) {
  const widest = Math.max(0, ...rows.map((row) => row.sessions))

  return (
    <ChartCard
      title="Section reach"
      description="Unique sessions that actually saw each section of the page."
      source="Supabase"
      isEmpty={rows.length === 0}
    >
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.section_id} className="flex items-center gap-3 text-sm">
            <span className="w-40 shrink-0 truncate">{labelFor(SECTION_LABELS, row.section_id)}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${percent(row.sessions, widest)}%`,
                  backgroundColor: CHART_COLORS.blue,
                }}
              />
            </span>
            <span className="w-16 shrink-0 text-right tabular-nums">{formatCount(row.sessions)}</span>
          </li>
        ))}
      </ul>
      <DataTableFallback
        caption="Section reach"
        headers={["Section", "Sessions"]}
        rows={rows.map((row) => [labelFor(SECTION_LABELS, row.section_id), formatCount(row.sessions)])}
      />
    </ChartCard>
  )
}

export function ScrollDepthChart({ rows }: { rows: BioScrollRow[] }) {
  const summary = summarizeScrollDepth(rows)

  return (
    <ChartCard
      title="Scroll depth"
      description="How far down the bio page visitors actually get."
      source="Supabase"
      isEmpty={rows.length === 0}
    >
      <ul className="space-y-2">
        {summary.map((row) => (
          <li key={row.depth} className="flex items-center gap-3 text-sm">
            <span className="w-14 shrink-0 tabular-nums">{row.depth}%</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full"
                style={{ width: `${row.share}%`, backgroundColor: CHART_COLORS.green }}
              />
            </span>
            <span className="w-16 shrink-0 text-right tabular-nums">{formatCount(row.sessions)}</span>
          </li>
        ))}
      </ul>
      <DataTableFallback
        caption="Scroll depth"
        headers={["Depth", "Sessions", "Share of widest"]}
        rows={summary.map((row) => [
          `${row.depth}%`,
          formatCount(row.sessions),
          formatPercent(row.share),
        ])}
      />
    </ChartCard>
  )
}

export function EngagementHeatmap({ cells }: { cells: BioHeatmapCell[] }) {
  const lookup = new Map(cells.map((cell) => [`${cell.day_of_week}:${cell.hour_of_day}`, cell]))
  const peak = Math.max(0, ...cells.map((cell) => cell.sessions))
  const hours = Array.from({ length: 24 }, (_, hour) => hour)
  const days = WEEKDAY_LABELS.map((label, index) => ({ label, isoDay: index + 1 }))

  const sessionsAt = (isoDay: number, hour: number) => lookup.get(`${isoDay}:${hour}`)?.sessions ?? 0
  const dayTotal = (isoDay: number) =>
    hours.reduce((sum, hour) => sum + sessionsAt(isoDay, hour), 0)
  const hourTotal = (hour: number) =>
    days.reduce((sum, day) => sum + sessionsAt(day.isoDay, hour), 0)
  const grandTotal = days.reduce((sum, day) => sum + dayTotal(day.isoDay), 0)

  // Every cell carries its own figure, so the colour is a scan aid rather than
  // the only way to read the grid.
  const tint = (sessions: number) =>
    sessions === 0
      ? "var(--muted)"
      : `color-mix(in srgb, ${CHART_COLORS.violet} ${Math.max(
          10,
          Math.round(percent(sessions, peak)),
        )}%, transparent)`

  const cellClass = "h-7 min-w-8 rounded-sm text-center tabular-nums"

  return (
    <ChartCard
      title="Engagement by time of day"
      description="Sessions for every hour of the day in Jakarta time, Monday through Sunday."
      source="Supabase"
      info="A deeper colour means more sessions started in that hour. The All row and column are totals."
      isEmpty={cells.length === 0}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-separate border-spacing-[2px] text-[10px]">
          <caption className="sr-only">Sessions by day and hour in Jakarta time</caption>
          <thead>
            <tr>
              <th scope="col" className="w-10" />
              {hours.map((hour) => (
                <th
                  key={hour}
                  scope="col"
                  className="min-w-8 pb-1 font-medium tabular-nums text-muted-foreground"
                >
                  {hour}
                </th>
              ))}
              <th scope="col" className="min-w-9 pb-1 pl-1 font-semibold text-muted-foreground">
                All
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.label}>
                <th scope="row" className="pr-1 text-right font-medium text-muted-foreground">
                  {day.label}
                </th>
                {hours.map((hour) => {
                  const sessions = sessionsAt(day.isoDay, hour)
                  return (
                    <td
                      key={hour}
                      title={`${day.label} ${String(hour).padStart(2, "0")}:00 — ${formatCount(
                        sessions,
                      )} sesi`}
                      className={cellClass}
                      style={{
                        backgroundColor: tint(sessions),
                        color: sessions === 0 ? "var(--muted-foreground)" : "var(--foreground)",
                      }}
                    >
                      {sessions}
                    </td>
                  )
                })}
                <td className={`${cellClass} bg-muted font-semibold`}>{dayTotal(day.isoDay)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="pr-1 text-right font-semibold text-muted-foreground">
                All
              </th>
              {hours.map((hour) => (
                <td key={hour} className={`${cellClass} bg-muted font-semibold`}>
                  {hourTotal(hour)}
                </td>
              ))}
              <td className={`${cellClass} bg-primary font-semibold text-primary-foreground`}>
                {grandTotal}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}
