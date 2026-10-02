import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { OrderSky } from "@/components/today/order-sky"
import { ListingThumb } from "@/components/listing-thumb"
import { PlatformBadge } from "@/components/shell/platform-badge"
import { PLATFORMS } from "@/components/shell/platforms"
import { PaceBar, Stat } from "@/components/ui/page"
import { getTodayData } from "@/lib/queries/today"
import { cn, formatCurrency } from "@/lib/utils"

export const metadata: Metadata = { title: "Today · Sheepie" }
export const dynamic = "force-dynamic"

const units = (n: number) => `${Math.round(n).toLocaleString("id-ID")} ${Math.round(n) === 1 ? "item" : "items"}`
const pct = (n: number) => `${Math.round(n * 100)}%`
const rp = (n: number) => formatCurrency(n)
const count = (n: number) => Math.round(n).toLocaleString("id-ID")

export default async function TodayPage() {
  const data = await getTodayData()
  const { totals, month, stock, reorder } = data
  const greeting = data.hourNow < 11 ? "Good morning" : data.hourNow < 18 ? "Good afternoon" : "Good evening"
  const share = month.targetGmv > 0 ? month.actualGmv / month.targetGmv : null
  const pace = share === null ? null : share >= month.elapsed + 0.05 ? "ahead of pace" : share <= month.elapsed - 0.05 ? "behind pace" : "on pace"

  const groupedReorderRecommendations = reorder.recommendations.reduce<
    Array<{ sku: string; name: string; routes: typeof reorder.recommendations }>
  >((groups, rec) => {
    const existing = groups.find((group) => group.sku === rec.sku)
    if (existing) existing.routes.push(rec)
    else groups.push({ sku: rec.sku, name: rec.name, routes: [rec] })
    return groups
  }, [])

  const low = stock
    .filter((s) => s.needsReorder)
    .sort((a, b) => a.stock / Math.max(1, a.reorderAt ?? 1) - b.stock / Math.max(1, b.reorderAt ?? 1))

  return (
    <div className="space-y-4">
      <section className="sky relative overflow-hidden rounded-[26px] px-5 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-[15px] font-semibold text-white/80">{greeting}. Today so far</h1>
          <p className="num text-[12px] font-semibold text-white/60">
            {new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${data.today}T00:00:00Z`))} · WIB
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="num font-display text-[44px] font-semibold leading-none sm:text-[54px]">{rp(totals.gmv)}</p>
            <p className="mt-3 text-[14px] font-medium text-white/80">
              {totals.orders === 0 ? "No orders logged yet today." : `${totals.orders} ${totals.orders === 1 ? "order" : "orders"} · ${units(totals.units)}`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[16px] border border-white/25 bg-white/12 px-4 py-2.5 backdrop-blur-md">
              <p className="text-[11.5px] font-semibold text-white/70">After fees</p>
              <p className="num font-display text-[18px] font-semibold">{rp(totals.revenue)}</p>
            </div>
            <div className="rounded-[16px] border border-white/25 bg-white/12 px-4 py-2.5 backdrop-blur-md">
              <p className="text-[11.5px] font-semibold text-white/70">Kept after costs</p>
              <p className="num font-display text-[18px] font-semibold">
                {rp(totals.profit)}
                {!totals.costComplete && <span className="ml-1 font-body text-[11px] text-white/60">est.</span>}
              </p>
            </div>
          </div>
        </div>
        {data.orders.length > 0 ? (
          <OrderSky orders={data.orders} hourNow={data.hourNow} />
        ) : (
          <p className="mt-6 max-w-[48ch] text-[14px] text-white/75">Each order you log today floats in here as a small cloud at the hour you logged it — tap + to log the first one.</p>
        )}
        {data.byChannel.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {data.byChannel.map((c) => (
              <span key={c.channel} className="num inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[12px] font-semibold">
                <span className="size-2 rounded-full" style={{ background: PLATFORMS[c.channel].color }} />
                {PLATFORMS[c.channel].label} {c.orders} · {rp(c.gmv)}
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section className="glass rounded-[22px] p-5 sm:p-6">
          <p className="max-w-[44ch] font-display text-[21px] font-medium leading-snug">
            {pace ? (
              <>
                {month.label} is <span className={cn("font-semibold", pace === "behind pace" && "text-[#b4561f]")}>{pace}</span> — {rp(month.actualGmv)} of the {rp(month.targetGmv)} GMV
                target with {pct(month.elapsed)} of the month gone.
              </>
            ) : (
              <>
                {rp(month.actualGmv)} so far in {month.label}. Set this month&apos;s KPI targets to see whether that&apos;s on pace.
              </>
            )}
          </p>
          <div className="mt-6 space-y-5">
            <PaceBar label="GMV" value={month.actualGmv} target={month.targetGmv} elapsed={month.elapsed} format={rp} />
            <PaceBar label="Items sold" value={month.actualUnits} target={month.targetUnits} elapsed={month.elapsed} format={count} tone="sky" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Stat label="GMV this month" value={rp(month.actualGmv)} note={month.targetGmv ? `${pct(month.actualGmv / month.targetGmv)} of target` : "No target yet"} />
            <Stat label="Items this month" value={count(month.actualUnits)} note={month.targetUnits ? `of ${count(month.targetUnits)}` : "No target yet"} />
            <Link href="/kpi" className="glass-inset col-span-2 flex items-center justify-between rounded-[16px] px-4 py-3.5 text-[13.5px] font-semibold text-primary/80 hover:text-primary sm:col-span-1">
              KPI by product <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

        <section className="glass flex flex-col rounded-[22px] p-5 sm:p-6">
          <h2 className="font-display text-[19px] font-semibold">Needs you</h2>
          {low.length === 0 ? (
            <p className="mt-1.5 text-[14px] text-muted-foreground">Nothing right now — every product is above its reorder point.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {low.slice(0, 3).map((s, i) => (
                <li key={s.sku} className={cn("flex items-center gap-3 rounded-[18px] border p-3", i === 0 ? "border-[#e3a24a]/45 bg-[#e3a24a]/10" : "border-primary/10 bg-white/45")}>
                  <ListingThumb src={s.imageUrl} name={s.name} sku={s.sku} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">Reorder {s.name}</p>
                    <p className="num text-[13px] text-muted-foreground">
                      {s.stock} left · reorder at {s.reorderAt}
                    </p>
                  </div>
                  {i === 0 && (
                    <Link href="/restock" className="rounded-full bg-primary px-3.5 py-2 text-[12.5px] font-bold text-white">
                      Restock
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto pt-6">
            <div className="mb-1 flex items-baseline justify-between">
              <h3 className="text-[14px] font-bold">Stock</h3>
              <Link href="/products" className="text-[12.5px] font-semibold text-muted-foreground hover:text-primary">
                Products
              </Link>
            </div>
            {stock.map((s) => {
              const ref = Math.max(s.reorderAt ?? 0, 1) * 2.5
              const w = Math.min(1, Math.max(0, s.stock) / ref)
              return (
                <div key={s.sku} className="grid grid-cols-[32px_1fr_minmax(0,1.2fr)_56px] items-center gap-3 border-b border-primary/[0.07] py-2 last:border-0">
                  <ListingThumb src={s.imageUrl} name={s.name} sku={s.sku} size={32} className="rounded-[9px]" />
                  <span className="truncate text-[13px] font-semibold">{s.name}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-primary/[0.08]">
                    <div className={cn("h-full rounded-full", s.needsReorder ? "bg-[#e3a24a]" : "bg-primary")} style={{ width: `${Math.max(w * 100, s.stock > 0 ? 3 : 0)}%` }} />
                  </div>
                  <span className={cn("num text-right text-[13px] font-semibold", s.stock < 0 && "text-destructive")}>{s.stock}</span>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {groupedReorderRecommendations.length > 0 && (
        <section className="glass rounded-[22px] p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-[19px] font-semibold">Reorder guide</h2>
            <p className="text-[12.5px] text-muted-foreground">
              From average daily sales on in-stock days since {reorder.startDate.toISOString().slice(0, 10)}, and learned shipping times.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {groupedReorderRecommendations.map((group) => (
              <div key={group.sku} className="glass-inset rounded-[18px] p-4">
                <p className="font-semibold">{group.name}</p>
                <ul className="mt-2 space-y-1.5">
                  {group.routes.map((rec) => (
                    <li key={`${rec.sku}-${rec.mode}`} className="num flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
                      <span className="text-muted-foreground">
                        {rec.mode} · {rec.avgDaily.toFixed(2)}/day · {rec.leadTimeLabel}
                      </span>
                      <span className="font-semibold">{rec.reorderMin === rec.reorderMax ? `${rec.reorderMin} units` : `${rec.reorderMin}–${rec.reorderMax} units`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.orders.length > 0 && (
        <section className="glass rounded-[22px] p-5 sm:p-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-display text-[19px] font-semibold">Logged today</h2>
            <Link href="/orders" className="text-[12.5px] font-semibold text-muted-foreground hover:text-primary">
              All orders
            </Link>
          </div>
          <ul className="divide-y divide-primary/[0.07]">
            {[...data.orders].reverse().map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                  <PlatformBadge channel={o.channel} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{o.summary}</span>
                    <span className="num block text-[12px] text-muted-foreground">
                      {o.orderId} · {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(o.createdAt))}
                    </span>
                  </span>
                  <span className="num font-semibold">{rp(o.gmv)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
