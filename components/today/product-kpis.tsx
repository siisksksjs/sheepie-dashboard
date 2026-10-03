import Link from "next/link"
import { ListingThumb } from "@/components/listing-thumb"
import type { TodayData } from "@/lib/queries/today"
import { formatCurrency } from "@/lib/utils"

export function ProductKpis({
  rows,
  month,
  elapsed,
}: {
  rows: TodayData["productKpis"]
  month: string
  elapsed: number
}) {
  return (
    <div className="mt-6 border-t border-primary/10 pt-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[19px] font-semibold">Product KPI</h2>
        <p className="text-[12px] text-muted-foreground">All colours · kit components included</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active KPI products. Review your products and monthly targets in KPI.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const name = row.variant_skus.length ? row.name.replace(/ Blue$/, "") : row.name
            const hasTarget = row.target_units > 0
            const progress = hasTarget ? Math.round(row.actual_units / row.target_units * 100) : null
            const share = hasTarget ? Math.min(1, row.actual_units / row.target_units) : 0
            return (
              <li key={row.sku}>
                <Link
                  href={`/kpi?month=${month}#product-${row.sku}`}
                  className="glass-inset flex items-center gap-3 rounded-[14px] px-3 py-2.5 transition-colors hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <ListingThumb src={row.imageUrl} name={name} sku={row.sku} size={36} className="rounded-[9px]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-body text-[13px] font-bold leading-snug">{name}</h3>
                      <span className="num flex-none text-[12px] font-semibold">
                        {row.actual_units.toLocaleString("id-ID")}
                        <span className="font-medium text-muted-foreground">{hasTarget ? ` / ${row.target_units.toLocaleString("id-ID")}` : " sold"}</span>
                      </span>
                    </div>
                    <div className="relative mt-1.5 h-1.5 rounded-full bg-primary/[0.08]" role="meter" aria-label={`${name} items sold`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={share * 100} aria-valuetext={hasTarget ? `${row.actual_units} of ${row.target_units} items` : `${row.actual_units} items sold, no unit target`}>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${share * 100}%` }} />
                      {hasTarget && <span aria-hidden className="absolute -top-0.5 h-2.5 w-px rounded-full bg-[#e3a24a]" style={{ left: `${elapsed * 100}%` }} title="Where an even pace would be today" />}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="num">GMV {formatCurrency(row.actual_gmv)}</span>
                      <span className="font-semibold">{progress === null ? "No unit target" : row.actual_units >= row.target_units ? "Target reached" : `${progress}% of target`}</span>
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
