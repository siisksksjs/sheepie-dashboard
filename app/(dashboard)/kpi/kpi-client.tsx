"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarDays, Save, TrendingUp } from "lucide-react"
import type { KpiWorkspace } from "@/lib/actions/kpi"
import { saveMonthlyKpiTargets } from "@/lib/actions/kpi"
import { formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type EditableRow = KpiWorkspace["rows"][number]

export function KpiClient({ initialWorkspace }: { initialWorkspace: KpiWorkspace }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [month, setMonth] = useState(initialWorkspace.month)
  const [rows, setRows] = useState<EditableRow[]>(initialWorkspace.rows)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setMonth(initialWorkspace.month)
    setRows(initialWorkspace.rows)
  }, [initialWorkspace])

  const totals = useMemo(() => {
    const base = rows.reduce(
      (acc, row) => ({
        target_units: acc.target_units + row.target_units,
        target_revenue: acc.target_revenue + row.target_revenue,
        actual_units: acc.actual_units + row.actual_units,
        actual_revenue: acc.actual_revenue + row.actual_revenue,
      }),
      { target_units: 0, target_revenue: 0, actual_units: 0, actual_revenue: 0 },
    )
    const unitsProgress = getProgress(base.actual_units, base.target_units)
    const revenueProgress = getProgress(base.actual_revenue, base.target_revenue)

    return {
      ...base,
      units_progress: unitsProgress,
      revenue_progress: revenueProgress,
      overall_progress: (unitsProgress + revenueProgress) / 2,
    }
  }, [rows])

  const monthPacing = getMonthPacing(month)

  const updateRow = (sku: string, field: "target_units" | "target_revenue", value: string) => {
    const parsed = Number(value)
    const nextValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0

    setRows((current) =>
      current.map((row) =>
        row.sku === sku
          ? { ...row, [field]: field === "target_units" ? Math.round(nextValue) : nextValue }
          : row,
      ),
    )
  }

  const handleMonthChange = (value: string) => {
    setMonth(value)
    router.push(`/kpi?month=${value}`)
  }

  const handleSave = () => {
    setMessage(null)
    startTransition(async () => {
      const result = await saveMonthlyKpiTargets({
        month,
        rows: rows.map((row) => ({
          sku: row.sku,
          target_units: row.target_units,
          target_revenue: row.target_revenue,
        })),
      })

      if (!result.success) {
        setMessage(result.error)
        return
      }

      setMessage("KPI targets saved.")
      router.refresh()
    })
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">KPI</h1>
          <p className="text-muted-foreground">
            Monthly product targets compared with actual sales performance.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="month"
              value={month}
              onChange={(event) => handleMonthChange(event.target.value)}
              className="pl-10 sm:w-44"
            />
          </div>
          <Button type="button" onClick={handleSave} disabled={isPending}>
            <Save className="mr-2 h-4 w-4" />
            {isPending ? "Saving" : "Save"}
          </Button>
        </div>
      </div>

      {message ? (
        <div className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}

      <section className="space-y-5">
        <Card className="border border-primary/10 bg-card shadow-sm">
          <CardHeader className="pb-0">
            <CardTitle className="text-lg font-semibold text-[#30343b]">
              GMV {formatMonthName(month)}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-[330px] flex-col items-center justify-center pt-2">
            <CircularGauge value={totals.revenue_progress} size={228} strokeWidth={24} />
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-2xl font-semibold leading-tight">
              <span className="text-primary">Current {formatCompactNumber(totals.actual_revenue)}</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-[#5d626b]">Target {formatCompactNumber(totals.target_revenue)}</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-3">
          {rows.map((row) => (
            <Card key={row.sku} className="border border-primary/10 bg-card shadow-sm">
              <CardHeader className="pb-0">
                <CardTitle className="text-lg font-semibold text-[#30343b]">
                  {formatProductShortName(row)}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex min-h-[270px] flex-col items-center justify-center pt-0">
                <SemiCircleGauge value={getProgress(row.actual_units, row.target_units)} />
                <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xl font-semibold leading-tight">
                  <span className="text-primary">Current {row.actual_units.toLocaleString()}</span>
                  <span className="text-muted-foreground">|</span>
                  <span className="text-[#5d626b]">Target {row.target_units.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Target Units" value={totals.target_units.toLocaleString()} />
        <MetricCard title="Actual Units" value={totals.actual_units.toLocaleString()} />
        <MetricCard title="Target Revenue" value={formatCurrency(totals.target_revenue)} />
        <MetricCard title="Actual Revenue" value={formatCurrency(totals.actual_revenue)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>SKU Monthly Pace</CardTitle>
          <CardDescription>
            Unit progress by SKU against the expected pace for day {monthPacing.elapsedDays} of {monthPacing.daysInMonth}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {rows.map((row) => {
            const status = getPaceStatus(row, monthPacing)

            return (
              <div key={row.sku} className="rounded-lg border bg-card p-4">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-lg font-semibold">{formatProductShortName(row).replace(" | Units Sold", "")}</div>
                    <div className="text-sm text-muted-foreground">{row.sku}</div>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-sm font-semibold ${status.className}`}>
                    {status.label}
                  </div>
                </div>

                <div className="space-y-4">
                  <ProgressRow
                    label="Units sold"
                    actual={row.actual_units}
                    target={row.target_units}
                    value={getProgress(row.actual_units, row.target_units)}
                    valueLabel={`${row.actual_units.toLocaleString()} / ${row.target_units.toLocaleString()} units`}
                  />
                  <ProgressRow
                    label="Revenue"
                    actual={row.actual_revenue}
                    target={row.target_revenue}
                    value={getProgress(row.actual_revenue, row.target_revenue)}
                    valueLabel={`${formatCurrency(row.actual_revenue)} / ${formatCurrency(row.target_revenue)}`}
                  />
                </div>

                <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
                  <div>
                    Expected by today: <span className="font-semibold text-foreground">{status.requiredByToday.toLocaleString()} units</span>
                  </div>
                  <div>
                    Monthly target: <span className="font-semibold text-foreground">{row.target_units.toLocaleString()} units</span>
                  </div>
                  <div>
                    Remaining: <span className="font-semibold text-foreground">{Math.max(0, row.target_units - row.actual_units).toLocaleString()} units</span>
                  </div>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Product KPI Targets</CardTitle>
          <CardDescription>
            Input target units sold and target revenue for each active product.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Target Units</TableHead>
                  <TableHead className="text-right">Actual Units</TableHead>
                  <TableHead className="text-right">Target Revenue</TableHead>
                  <TableHead className="text-right">Actual Revenue</TableHead>
                  <TableHead className="text-right">Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const rowProgress = (getProgress(row.actual_units, row.target_units) + getProgress(row.actual_revenue, row.target_revenue)) / 2

                  return (
                    <TableRow key={row.sku}>
                      <TableCell>
                        <div className="font-medium">{row.variant ? `${row.name} - ${row.variant}` : row.name}</div>
                        <div className="text-xs text-muted-foreground">{row.sku}</div>
                      </TableCell>
                      <TableCell className="min-w-36">
                        <Input
                          type="number"
                          min={0}
                          value={row.target_units}
                          onChange={(event) => updateRow(row.sku, "target_units", event.target.value)}
                          className="text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">{row.actual_units}</TableCell>
                      <TableCell className="min-w-44">
                        <Input
                          type="number"
                          min={0}
                          step="1000"
                          value={row.target_revenue}
                          onChange={(event) => updateRow(row.sku, "target_revenue", event.target.value)}
                          className="text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(row.actual_revenue)}</TableCell>
                      <TableCell className="text-right font-semibold">{rowProgress.toFixed(0)}%</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold leading-tight break-words tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}

function ProgressRow({
  label,
  value,
  valueLabel,
}: {
  label: string
  actual: number
  target: number
  value: number
  valueLabel: string
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{valueLabel}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#dbe8f5]">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
        />
      </div>
    </div>
  )
}

function CircularGauge({
  value,
  size,
  strokeWidth,
}: {
  value: number
  size: number
  strokeWidth: number
}) {
  const normalized = Math.max(0, Math.min(value, 100))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (normalized / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#dbe8f5"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--primary)"
          strokeLinecap="round"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-6xl font-black text-[#151922] tabular-nums">
        {normalized.toFixed(0)}%
      </div>
    </div>
  )
}

function SemiCircleGauge({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(value, 100))
  const size = 260
  const strokeWidth = 24
  const radius = 104
  const center = size / 2
  const circumference = Math.PI * radius
  const offset = circumference - (normalized / 100) * circumference

  return (
    <div className="relative h-[165px] w-[260px]">
      <svg width={size} height={165} viewBox="0 0 260 165">
        <path
          d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
          fill="none"
          stroke="#dbe8f5"
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
        <path
          d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
          fill="none"
          stroke="var(--primary)"
          strokeLinecap="round"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-x-0 top-[78px] text-center text-6xl font-black text-[#151922] tabular-nums">
        {normalized.toFixed(0)}%
      </div>
    </div>
  )
}

function getProgress(actual: number, target: number) {
  if (target <= 0) {
    return actual > 0 ? 100 : 0
  }

  return Math.min((actual / target) * 100, 100)
}

function getMonthPacing(month: string) {
  const [year, monthNumber] = month.split("-").map(Number)
  const today = new Date()
  const selectedMonthStart = new Date(year, monthNumber - 1, 1)
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const daysInMonth = new Date(year, monthNumber, 0).getDate()
  let elapsedDays = today.getDate()

  if (selectedMonthStart < currentMonthStart) {
    elapsedDays = daysInMonth
  }

  if (selectedMonthStart > currentMonthStart) {
    elapsedDays = 0
  }

  return {
    daysInMonth,
    elapsedDays: Math.max(0, Math.min(elapsedDays, daysInMonth)),
  }
}

function getPaceStatus(row: EditableRow, pacing: { elapsedDays: number; daysInMonth: number }) {
  const requiredByToday = pacing.elapsedDays <= 0
    ? 0
    : Math.ceil((row.target_units * pacing.elapsedDays) / pacing.daysInMonth)
  const unitDelta = row.actual_units - requiredByToday

  if (unitDelta < 0) {
    return {
      label: `Behind by ${Math.abs(unitDelta).toLocaleString()} units`,
      requiredByToday,
      className: "bg-destructive/10 text-destructive",
    }
  }

  if (unitDelta > 0) {
    return {
      label: `In front by ${unitDelta.toLocaleString()} units`,
      requiredByToday,
      className: "bg-success/10 text-success",
    }
  }

  return {
    label: "On track",
    requiredByToday,
    className: "bg-primary/10 text-primary",
  }
}

function formatMonthName(month: string) {
  const parsed = new Date(`${month}-01T00:00:00`)

  if (Number.isNaN(parsed.getTime())) {
    return month
  }

  return parsed.toLocaleString("default", { month: "long" })
}

function formatCompactNumber(value: number) {
  return Math.round(value).toLocaleString("en-US")
}

function formatProductShortName(row: EditableRow) {
  const sku = row.sku.toLowerCase()

  if (sku.startsWith("cervi")) return "CerviCloud | Units Sold"
  if (sku.startsWith("lumi")) return "LumiCloud | Units Sold"
  if (sku.startsWith("calmi")) return "CalmiCloud | Units Sold"

  return `${row.name} | Units Sold`
}
