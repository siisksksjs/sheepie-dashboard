import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { ListingThumb } from "@/components/listing-thumb"
import { PaceBar } from "@/components/ui/page"
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
        <ul className="space-y-2.5">
          {rows.map((row) => {
            const name = row.variant_skus.length ? row.name.replace(/ Blue$/, "") : row.name
            const hasTarget = row.target_units > 0
            const progress = hasTarget ? Math.round(row.actual_units / row.target_units * 100) : null
            return (
              <li key={row.sku}>
                <Link
                  href={`/kpi?month=${month}#product-${row.sku}`}
                  className="glass-inset group flex items-start gap-3 rounded-[16px] p-3 transition-colors hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <ListingThumb src={row.imageUrl} name={name} sku={row.sku} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="font-body text-[13.5px] font-bold leading-snug">{name}</h3>
                      <ArrowRight aria-hidden className="mt-0.5 size-3.5 flex-none text-muted-foreground group-hover:text-primary" />
                    </div>
                    <PaceBar
                      label="Items sold"
                      value={row.actual_units}
                      target={row.target_units}
                      elapsed={elapsed}
                      format={(value) => Math.round(value).toLocaleString("id-ID")}
                    />
                    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
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
