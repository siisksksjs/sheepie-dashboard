"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Check, CircleAlert, Save, Settings2 } from "lucide-react"
import type { KpiWorkspace } from "@/lib/actions/kpi"
import { saveMonthlyKpiTargets } from "@/lib/actions/kpi"
import { formatCurrency, getJakartaToday } from "@/lib/utils"
import { PageHeader, PaceBar, Stat } from "@/components/ui/page"
import { ListingThumb } from "@/components/listing-thumb"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"

type Targets = { target_units: number; target_gmv: number }
export function KpiClient({
  initialWorkspace,
  images
}: {
  initialWorkspace: KpiWorkspace
  images: Record<string, string>
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState("")
  const [targets, setTargets] = useState<Record<string, Targets>>(() =>
    Object.fromEntries(
      initialWorkspace.rows.map((r) => [
        r.sku,
        { target_units: r.target_units, target_gmv: r.target_gmv }
      ])
    )
  )
  const { month } = initialWorkspace
  const rows = initialWorkspace.rows
  const totals = initialWorkspace.totals
  const [year, m] = month.split("-").map(Number)
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate()
  const today = getJakartaToday()
  const elapsedDays =
    month < today.slice(0, 7)
      ? days
      : month > today.slice(0, 7)
        ? 0
        : Number(today.slice(8, 10))
  const elapsed = elapsedDays / days
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${month}-01T00:00:00Z`))
  const remainingDays = Math.max(0, days - elapsedDays)
  const gap = Math.max(0, totals.target_gmv - totals.actual_gmv)
  const hasGmvTarget = totals.target_gmv > 0
  const hasUnitTarget = totals.target_units > 0
  const unitGap = Math.max(0, totals.target_units - totals.actual_units)
  const progress = hasGmvTarget
    ? totals.actual_gmv / totals.target_gmv
    : hasUnitTarget
      ? totals.actual_units / totals.target_units
      : null
  const pace =
    progress === null
      ? "Set a target to see your pace"
      : progress >= 1
        ? hasGmvTarget
          ? "Monthly GMV target reached"
          : "Monthly unit target reached"
        : progress < elapsed - 0.05
          ? "Behind pace this month"
          : progress > elapsed + 0.05
            ? "Ahead of pace"
            : "On pace this month"
  function update(sku: string, field: keyof Targets, raw: string) {
    const number = Number(raw)
    setTargets((t) => ({
      ...t,
      [sku]: {
        ...t[sku],
        [field]: Math.max(
          0,
          Number.isFinite(number)
            ? field === "target_units"
              ? Math.round(number)
              : number
            : 0
        )
      }
    }))
  }
  function save() {
    setMessage("")
    start(async () => {
      try {
        const result = await saveMonthlyKpiTargets({
          month,
          rows: rows.map((r) => ({ sku: r.sku, ...targets[r.sku] }))
        })
        if (!result.success) {
          setMessage(result.error)
          return
        }
        setEditing(false)
        router.refresh()
      } catch {
        setMessage("Could not save targets. Please try again.")
      }
    })
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Monthly targets"
        description="A clear view of where you are, where you need to be, and what is left to sell."
        actions={
          <>
            <Input
              aria-label="KPI month"
              type="month"
              value={month}
              onChange={(e) => {
                if (/^\d{4}-\d{2}$/.test(e.target.value))
                  router.push(`/kpi?month=${e.target.value}`)
              }}
              className="w-44"
            />
            <Button
              onClick={() => {
                setMessage("")
                setTargets(
                  Object.fromEntries(
                    rows.map((r) => [
                      r.sku,
                      { target_units: r.target_units, target_gmv: r.target_gmv }
                    ])
                  )
                )
                setEditing(true)
              }}
            >
              <Settings2 className="mr-2 size-4" /> Edit targets
            </Button>
          </>
        }
      />
      <section className="glass grid gap-6 rounded-[26px] p-5 sm:p-7 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="workspace-eyebrow">
            {monthLabel} · day {elapsedDays} of {days}
          </p>
          <h2 className="mt-3 text-[26px] leading-snug sm:text-[32px]">
            {pace}
          </h2>
          <p className="mt-3 max-w-[44ch] text-sm text-muted-foreground">
            {progress === null
              ? "Choose a monthly GMV and unit target for each product to measure your progress."
              : `${hasGmvTarget ? `${formatCurrency(totals.actual_gmv)} in GMV` : `${totals.actual_units} of ${totals.target_units} items sold`} so far. ${Math.round(elapsed * 100)}% of the month has passed.`}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            GMV is sales before platform fees. The marker shows an even pace
            through the month.
          </p>
        </div>
        <div className="flex flex-col justify-center gap-6">
          <PaceBar
            label="Monthly GMV"
            value={totals.actual_gmv}
            target={totals.target_gmv}
            elapsed={elapsed}
            format={formatCurrency}
          />
          <PaceBar
            label="Items sold"
            value={totals.actual_units}
            target={totals.target_units}
            elapsed={elapsed}
            format={(n) => n.toLocaleString()}
            tone="sky"
          />
        </div>
      </section>
      <section
        className="workspace-summary grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label="Monthly KPI summary"
      >
        <Stat
          label="GMV still to go"
          value={hasGmvTarget ? formatCurrency(gap) : "—"}
          note={
            totals.target_gmv > 0
              ? "To reach the saved target"
              : "No GMV target set"
          }
        />
        <Stat
          label="Items still to sell"
          value={Math.max(
            0,
            totals.target_units - totals.actual_units
          ).toLocaleString()}
          note={
            totals.target_units > 0
              ? "Across tracked products"
              : "No unit target set"
          }
        />
        <Stat
          label="Days remaining"
          value={remainingDays}
          note="After today · WIB"
        />
        <Stat
          label={hasGmvTarget ? "GMV needed per day" : "Items needed per day"}
          value={
            progress !== null && remainingDays > 0
              ? hasGmvTarget
                ? formatCurrency(gap / remainingDays)
                : Math.ceil(unitGap / remainingDays).toLocaleString()
              : "—"
          }
          note="Across the remaining days"
        />
      </section>
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-xl">Product by product</h2>
        <p className="text-xs text-muted-foreground">
          All colours and kit components included
        </p>
      </div>
      <section className="grid gap-4 xl:grid-cols-3">
        {rows.map((row) => {
          const expected = Math.ceil(row.target_units * elapsed)
          const delta = row.actual_units - expected
          const hasTarget = row.target_units > 0
          const behind = hasTarget && delta < 0
          const label = !hasTarget
            ? "No unit target"
            : row.actual_units >= row.target_units
              ? "Target reached"
              : behind
                ? `${-delta} items behind pace`
                : delta > 0
                  ? `${delta} items ahead of pace`
                  : "On pace"
          return (
            <article key={row.sku} id={`product-${row.sku}`} className="glass scroll-mt-6 rounded-[24px] p-5">
              <div className="mb-5 flex items-center gap-3">
                <ListingThumb
                  src={images[`${row.sku}:single`]}
                  name={row.name}
                  sku={row.sku}
                  size={60}
                />
                <div className="min-w-0">
                  <h3 className="font-body text-[15px] font-bold">
                    {row.variant_skus.length
                      ? row.name.replace(/ Blue$/, "")
                      : row.name}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.variant_skus.length
                      ? "All colours"
                      : row.variant || row.sku}
                  </p>
                </div>
              </div>
              <span
                className={`mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${behind ? "bg-[#f9ecdc] text-[#8a4917]" : "bg-primary/5 text-primary"}`}
              >
                {behind ? (
                  <CircleAlert className="size-3.5" />
                ) : hasTarget ? (
                  <Check className="size-3.5" />
                ) : (
                  <Settings2 className="size-3.5" />
                )}
                {label}
              </span>
              <div className="space-y-5">
                <PaceBar
                  label="Items sold"
                  value={row.actual_units}
                  target={row.target_units}
                  elapsed={elapsed}
                  format={(n) => n.toLocaleString()}
                />
                <PaceBar
                  label="GMV"
                  value={row.actual_gmv}
                  target={row.target_gmv}
                  elapsed={elapsed}
                  format={formatCurrency}
                  tone="sky"
                />
              </div>
              <div className="mt-5 flex justify-between border-t border-primary/10 pt-4 text-xs">
                <span className="text-muted-foreground">Items to target</span>
                <span className="num font-bold">
                  {Math.max(0, row.target_units - row.actual_units)}
                </span>
              </div>
            </article>
          )
        })}
      </section>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Targets for {monthLabel}</DialogTitle>
            <DialogDescription>
              Set GMV before platform fees and physical units sold. These
              targets also appear on Today.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {rows.map((row) => (
              <div key={row.sku} className="glass-inset rounded-2xl p-4">
                <p className="mb-3 text-sm font-bold">
                  {row.name}
                  {row.variant_skus.length ? " · All colours" : ""}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor={`units-${row.sku}`}>Item target</Label>
                    <Input
                      id={`units-${row.sku}`}
                      type="number"
                      min={0}
                      step={1}
                      value={targets[row.sku].target_units}
                      onChange={(e) =>
                        update(row.sku, "target_units", e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`gmv-${row.sku}`}>GMV target · IDR</Label>
                    <Input
                      id={`gmv-${row.sku}`}
                      type="number"
                      min={0}
                      step={1000}
                      value={targets[row.sku].target_gmv}
                      onChange={(e) =>
                        update(row.sku, "target_gmv", e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
          <Button onClick={save} disabled={pending}>
            <Save className="mr-2 size-4" />
            {pending ? "Saving…" : "Save targets"}
            <ArrowRight className="ml-2 size-4" />
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
