"use client"

import type { ReactNode } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
  UmamiMetricRow,
} from "@/lib/bio-analytics/types"
import {
  CHART_PALETTE,
  DESTINATION_LABELS,
  PRODUCT_LABELS,
  SECTION_LABELS,
  TRAFFIC_SERIES,
  WEEKDAY_LABELS,
  formatCount,
  formatPercent,
  labelFor,
} from "./presentation"

type SourceLabel = "Umami" | "Supabase" | "Umami + Supabase"

type ChartCardProps = {
  title: string
  description: string
  source: SourceLabel
  info?: string
  isEmpty: boolean
  emptyMessage?: string
  children: ReactNode
  footer?: ReactNode
}

export function ChartCard({
  title,
  description,
  source,
  info,
  isEmpty,
  emptyMessage = "Belum ada data pada rentang dan filter ini.",
  children,
  footer,
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
            Sumber: {source}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <>
            {children}
            {footer}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Legend({ series }: { series: ReadonlyArray<{ key: string; label: string; color: string }> }) {
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

/** Screen-reader and print fallback for every chart, per the accessibility contract. */
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
      <summary className="cursor-pointer text-xs text-muted-foreground">Lihat data sebagai tabel</summary>
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

const AXIS_PROPS = {
  stroke: "hsl(var(--muted-foreground))",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter = formatCount,
}: {
  active?: boolean
  payload?: Array<{ name?: string; dataKey?: string | number; value?: number; color?: string }>
  label?: string | number
  valueFormatter?: (value: number) => string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="min-w-48 rounded-xl border bg-card p-3 text-sm shadow-xl">
      <div className="mb-2 font-semibold">{String(label ?? "")}</div>
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}
            </span>
            <span className="font-semibold tabular-nums">{valueFormatter(Number(entry.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TrafficChart({ points }: { points: MergedTrafficPoint[] }) {
  return (
    <ChartCard
      title="Lalu lintas dan perilaku dari waktu ke waktu"
      description="Pengunjung dihitung Umami; sesi dan klik keluar dihitung dari peristiwa bio."
      source="Umami + Supabase"
      info="Kedua sumber dihitung terpisah dan tidak digabung menjadi satu angka. Klik keluar bukan pembelian."
      isEmpty={points.length === 0}
    >
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
          <XAxis dataKey="timestamp" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          {TRAFFIC_SERIES.slice(0, 2).map((series) => (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={series.color}
              strokeWidth={2}
              dot={false}
            />
          ))}
          <Bar dataKey="clicks" name={TRAFFIC_SERIES[2].label} fill={TRAFFIC_SERIES[2].color} radius={[4, 4, 0, 0]} />
        </ComposedChart>
      </ResponsiveContainer>
      <Legend series={TRAFFIC_SERIES} />
      <DataTableFallback
        caption="Lalu lintas dan perilaku per periode"
        headers={["Periode", "Pengunjung", "Sesi", "Klik keluar"]}
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
  rows: UmamiMetricRow[]
  labelHeader: string
  info?: string
}) {
  const data = rows
    .slice(0, 10)
    .map((row) => ({ label: row.x ?? "Tidak diketahui", value: row.y }))
  const total = data.reduce((sum, row) => sum + row.value, 0)

  return (
    <ChartCard
      title={title}
      description={description}
      source={source}
      info={info}
      isEmpty={data.length === 0}
    >
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 32)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
          <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={120} {...AXIS_PROPS} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="value" name={labelHeader} radius={[0, 4, 4, 0]}>
            {data.map((row, index) => (
              <Cell key={row.label} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <DataTableFallback
        caption={title}
        headers={[labelHeader, "Jumlah", "Bagian"]}
        rows={data.map((row) => [row.label, formatCount(row.value), formatPercent(percent(row.value, total))])}
      />
    </ChartCard>
  )
}

export function ProductPerformanceChart({ rows }: { rows: BioProductRow[] }) {
  const data = rows.map((row) => ({
    label: labelFor(PRODUCT_LABELS, row.product_slug),
    views: row.views,
    clicks: row.clicks,
    ctr: row.ctr,
  }))

  return (
    <ChartCard
      title="Performa produk"
      description="Sesi yang melihat setiap produk dan sesi yang lanjut klik ke marketplace."
      source="Supabase"
      info="CTR adalah bagian sesi yang melihat produk lalu mengklik tautan keluar. Ini bukan konversi pembelian."
      isEmpty={data.length === 0}
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
          <XAxis dataKey="label" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="views" name="Sesi melihat" fill={CHART_PALETTE[0]} radius={[4, 4, 0, 0]} />
          <Bar dataKey="clicks" name="Sesi klik keluar" fill={CHART_PALETTE[2]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <Legend
        series={[
          { key: "views", label: "Sesi melihat", color: CHART_PALETTE[0] },
          { key: "clicks", label: "Sesi klik keluar", color: CHART_PALETTE[2] },
        ]}
      />
      <DataTableFallback
        caption="Performa produk"
        headers={["Produk", "Sesi melihat", "Sesi klik keluar", "CTR keluar"]}
        rows={data.map((row) => [row.label, formatCount(row.views), formatCount(row.clicks), formatPercent(row.ctr)])}
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
      title="Tujuan klik keluar"
      description="Perbandingan Shopee, Tokopedia, dan tujuan lain."
      source="Supabase"
      info="Menghitung klik menuju tujuan, bukan pesanan atau pendapatan."
      isEmpty={data.length === 0}
    >
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
          <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={100} {...AXIS_PROPS} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="clicks" name="Klik keluar" radius={[0, 4, 4, 0]}>
            {data.map((row, index) => (
              <Cell key={row.label} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <DataTableFallback
        caption="Tujuan klik keluar"
        headers={["Tujuan", "Klik", "Bagian"]}
        rows={data.map((row) => [row.label, formatCount(row.clicks), formatPercent(percent(row.clicks, total))])}
      />
    </ChartCard>
  )
}

export function FunnelChart({ counts }: { counts: BioFunnelCounts }) {
  const steps = buildFunnelSteps(counts)
  const first = steps[0]?.sessions ?? 0

  return (
    <ChartCard
      title="Alur kunjungan"
      description="Buka halaman → lihat bagian → lihat produk → klik ke marketplace."
      source="Supabase"
      info="Setiap tahap menghitung sesi unik. Tahap terakhir adalah klik keluar, bukan pembelian."
      isEmpty={first === 0}
    >
      <ol className="space-y-3">
        {steps.map((step) => (
          <li key={step.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{step.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatCount(step.sessions)} sesi · {formatPercent(step.conversionFromFirst)} dari awal
              </span>
            </div>
            <div
              className="h-3 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${step.label}: ${formatCount(step.sessions)} sesi, ${formatPercent(
                step.conversionFromFirst,
              )} dari tahap pertama`}
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(0, Math.min(100, step.conversionFromFirst))}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
      <DataTableFallback
        caption="Alur kunjungan"
        headers={["Tahap", "Sesi", "Dari awal", "Dari tahap sebelumnya"]}
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
      title="Jangkauan bagian halaman"
      description="Sesi unik yang benar-benar melihat setiap bagian."
      source="Supabase"
      isEmpty={rows.length === 0}
    >
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.section_id} className="flex items-center gap-3 text-sm">
            <span className="w-40 shrink-0 truncate">{labelFor(SECTION_LABELS, row.section_id)}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary/70"
                style={{ width: `${percent(row.sessions, widest)}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right tabular-nums">{formatCount(row.sessions)}</span>
          </li>
        ))}
      </ul>
      <DataTableFallback
        caption="Jangkauan bagian halaman"
        headers={["Bagian", "Sesi"]}
        rows={rows.map((row) => [labelFor(SECTION_LABELS, row.section_id), formatCount(row.sessions)])}
      />
    </ChartCard>
  )
}

export function ScrollDepthChart({ rows }: { rows: BioScrollRow[] }) {
  const summary = summarizeScrollDepth(rows)

  return (
    <ChartCard
      title="Kedalaman gulir"
      description="Seberapa jauh pengunjung menggulir halaman bio."
      source="Supabase"
      isEmpty={rows.length === 0}
    >
      <ul className="space-y-2">
        {summary.map((row) => (
          <li key={row.depth} className="flex items-center gap-3 text-sm">
            <span className="w-14 shrink-0 tabular-nums">{row.depth}%</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary/70"
                style={{ width: `${row.share}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right tabular-nums">{formatCount(row.sessions)}</span>
          </li>
        ))}
      </ul>
      <DataTableFallback
        caption="Kedalaman gulir"
        headers={["Kedalaman", "Sesi", "Bagian dari terluas"]}
        rows={summary.map((row) => [`${row.depth}%`, formatCount(row.sessions), formatPercent(row.share)])}
      />
    </ChartCard>
  )
}

export function EngagementHeatmap({ cells }: { cells: BioHeatmapCell[] }) {
  const lookup = new Map(cells.map((cell) => [`${cell.day_of_week}:${cell.hour_of_day}`, cell]))
  const peak = Math.max(0, ...cells.map((cell) => cell.sessions))
  const hours = Array.from({ length: 24 }, (_, hour) => hour)

  return (
    <ChartCard
      title="Peta waktu keterlibatan"
      description="Sesi per jam dalam waktu Jakarta, Senin sampai Minggu."
      source="Supabase"
      info="Warna lebih pekat berarti lebih banyak sesi pada jam tersebut."
      isEmpty={cells.length === 0}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-[2px] text-[10px]">
          <caption className="sr-only">Sesi per hari dan jam dalam waktu Jakarta</caption>
          <thead>
            <tr>
              <th scope="col" className="w-10" />
              {hours.map((hour) => (
                <th key={hour} scope="col" className="font-normal text-muted-foreground">
                  {hour % 3 === 0 ? hour : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAY_LABELS.map((day, index) => (
              <tr key={day}>
                <th scope="row" className="pr-1 text-right font-normal text-muted-foreground">
                  {day}
                </th>
                {hours.map((hour) => {
                  const cell = lookup.get(`${index + 1}:${hour}`)
                  const sessions = cell?.sessions ?? 0
                  return (
                    <td
                      key={hour}
                      title={`${day} ${String(hour).padStart(2, "0")}:00 — ${formatCount(sessions)} sesi`}
                      className="h-5 rounded-sm"
                      style={{
                        backgroundColor:
                          sessions === 0
                            ? "hsl(var(--muted))"
                            : `color-mix(in srgb, ${CHART_PALETTE[0]} ${Math.max(
                                12,
                                Math.round(percent(sessions, peak)),
                              )}%, transparent)`,
                      }}
                    >
                      <span className="sr-only">{`${day} jam ${hour}: ${sessions} sesi`}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}
