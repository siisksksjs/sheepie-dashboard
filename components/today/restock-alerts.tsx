import Link from "next/link"
import { Truck } from "lucide-react"
import { ListingThumb } from "@/components/listing-thumb"
import type { StockLine } from "@/lib/queries/today"
import { cn } from "@/lib/utils"

export function RestockAlerts({ stock }: { stock: StockLine[] }) {
  const needs = stock.filter((row) => row.needsReorder)
    .sort((a, b) => a.stock / Math.max(1, a.reorderAt ?? 1) - b.stock / Math.max(1, b.reorderAt ?? 1))
  const covered = stock.filter((row) => row.coveredByIncoming)
  const unavailable = stock.some((row) => row.incoming === null)

  return (
    <div>
      <h2 className="font-display text-[19px] font-semibold">Needs you</h2>
      {unavailable && <p role="status" className="mt-2 text-xs text-[#8a4917]">Incoming restocks could not load. Review shipments before ordering.</p>}
      {needs.length === 0 ? (
        <p className="mt-1.5 text-[14px] text-muted-foreground">No additional restock needed at the current reorder levels.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {needs.slice(0, 3).map((row, index) => (
            <li key={row.sku} className={cn("flex items-center gap-3 rounded-[18px] border p-3", index === 0 ? "border-[#e3a24a]/45 bg-[#e3a24a]/10" : "border-primary/10 bg-white/45")}>
              <ListingThumb src={row.imageUrl} name={row.name} sku={row.sku} size={40} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold leading-snug">{row.name}</p>
                <p className="num mt-0.5 text-[12px] text-muted-foreground">
                  {row.stock} available · {row.incoming === null ? "incoming unknown" : `${row.incoming} on the way`}
                </p>
                <p className="num text-[11.5px] text-muted-foreground">
                  Reorder at {row.reorderAt}{row.additionalUnits !== null && ` · ${row.additionalUnits} short`}
                </p>
              </div>
              <Link
                href={row.additionalUnits === null ? `/restock?sku=${encodeURIComponent(row.sku)}#in-transit` : `/restock?sku=${encodeURIComponent(row.sku)}&quantity=${row.additionalUnits}&new=1`}
                className="flex-none rounded-full bg-primary px-3 py-2 text-[12px] font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-label={`${row.additionalUnits === null ? "Review restock for" : "Restock"} ${row.name}`}
              >
                {row.additionalUnits === null ? "Review" : "Restock"}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {needs.length > 3 && <Link href="/products" className="mt-2 block text-xs font-semibold text-muted-foreground">{needs.length - 3} more products below their reorder level · View stock</Link>}
      {covered.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-primary/10 pt-3">
          <h3 className="flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground"><Truck aria-hidden className="size-3.5" /> Covered by incoming stock</h3>
          {covered.map((row) => (
            <Link key={row.sku} href={`/restock?sku=${encodeURIComponent(row.sku)}#in-transit`} className="glass-inset flex items-center gap-2.5 rounded-[14px] p-2.5 hover:bg-white/80">
              <ListingThumb src={row.imageUrl} name={row.name} sku={row.sku} size={32} className="rounded-[9px]" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-bold leading-snug">{row.name}</p>
                <p className="num text-[11.5px] text-muted-foreground">{row.stock} available · {row.incoming} on the way</p>
              </div>
              <span className="flex-none text-[12px] font-bold">View</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
