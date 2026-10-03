"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  Ban,
  Plus,
  Search,
  SlidersHorizontal
} from "lucide-react"
import { PageHeader, Stat } from "@/components/ui/page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ListingThumb } from "@/components/listing-thumb"
import { parseSample } from "@/lib/inventory/samples"
import { cn } from "@/lib/utils"
import { formatJakartaDate } from "@/lib/bio-analytics/range"
import type {
  InventoryLedger,
  Product,
  StockOnHand
} from "@/lib/types/database.types"

const views = [
  { key: "all", label: "All movements" },
  { key: "samples", label: "Samples & gifts" },
  { key: "sales", label: "Sales" },
  { key: "dead", label: "Dead stock / loss" },
  { key: "received", label: "Stock in" },
  { key: "adjustments", label: "Adjustments" }
]
const labels: Record<string, string> = {
  IN_PURCHASE: "Stock received",
  OUT_SALE: "Sale",
  OUT_PROMO: "Sample / gift",
  OUT_DAMAGE: "Damage / loss",
  RETURN: "Return",
  ADJUSTMENT: "Adjustment"
}

export function LedgerClient({
  entries,
  products,
  stock,
  images,
  today,
  initialView
}: {
  entries: InventoryLedger[]
  products: Product[]
  stock: StockOnHand[]
  images: Record<string, string>
  today: string
  initialView: string
}) {
  const [view, setView] = useState(initialView)
  const [query, setQuery] = useState("")
  const [sku, setSku] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [limit, setLimit] = useState(50)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const productMap = useMemo(
    () => new Map(products.map((p) => [p.sku, p])),
    [products]
  )
  const visible = useMemo(
    () =>
      entries.filter((e) => {
        if (view === "samples" && e.movement_type !== "OUT_PROMO") return false
        if (view === "sales" && e.movement_type !== "OUT_SALE") return false
        if (view === "dead" && e.movement_type !== "OUT_DAMAGE") return false
        if (
          view === "received" &&
          !["IN_PURCHASE", "RETURN"].includes(e.movement_type)
        )
          return false
        if (
          view === "adjustments" &&
          !["ADJUSTMENT", "OUT_DAMAGE"].includes(e.movement_type)
        )
          return false
        const day = formatJakartaDate(new Date(e.entry_date))
        if ((sku && e.sku !== sku) || (from && day < from) || (to && day > to))
          return false
        const product = productMap.get(e.sku)
        return `${product?.name} ${product?.variant} ${e.sku} ${e.reference ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase())
      }),
    [entries, view, query, sku, from, to, productMap]
  )
  const todayEntries = entries.filter(
    (e) => formatJakartaDate(new Date(e.entry_date)) === today
  )
  const inbound = todayEntries
    .filter((e) => e.quantity > 0)
    .reduce((sum, e) => sum + e.quantity, 0)
  const outbound = todayEntries
    .filter((e) => e.quantity < 0)
    .reduce((sum, e) => sum - e.quantity, 0)
  const samples = entries
    .filter(
      (e) =>
        e.movement_type === "OUT_PROMO" &&
        formatJakartaDate(new Date(e.entry_date)).startsWith(today.slice(0, 7))
    )
    .reduce((sum, e) => sum + Math.abs(e.quantity), 0)
  function filterView(next: string) {
    setView(next)
    setLimit(50)
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory movements"
        description="Follow every unit, from the warehouse to a customer or creator."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/ledger/new?purpose=adjustment">
                <Plus className="mr-2 size-4" /> Stock adjustment
              </Link>
            </Button>
            <Button asChild>
              <Link href="/ledger/new?purpose=sample">
                <Gift className="mr-2 size-4" /> Send a sample
              </Link>
            </Button>
          </>
        }
      />
      <section
        className="workspace-summary grid grid-cols-2 gap-3 md:grid-cols-4"
        aria-label="Inventory summary"
      >
        <Stat
          label="Units on hand"
          value={stock
            .filter((s) => s.status === "active" && !s.is_bundle)
            .reduce((sum, s) => sum + s.current_stock, 0)
            .toLocaleString()}
          note="Physical products · current stock"
        />
        <Stat
          label="Stock in today"
          value={`+${inbound}`}
          note="Purchases, returns & adjustments"
        />
        <Stat
          label="Stock out today"
          value={`−${outbound}`}
          note="Sales, samples & other deductions"
        />
        <Stat
          label="Sample units this month"
          value={samples}
          note="Includes existing Promo Out records"
        />
      </section>
      <section className="glass overflow-hidden rounded-[24px]">
        <div className="space-y-4 border-b border-primary/10 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Movement categories"
            >
              {views.map((v) => (
                <button
                  key={v.key}
                  onClick={() => filterView(v.key)}
                  aria-pressed={view === v.key}
                  className={cn(
                    "min-h-10 rounded-full px-3.5 py-2 text-[13px] font-semibold",
                    view === v.key
                      ? "bg-primary text-white"
                      : "bg-white/70 text-muted-foreground hover:bg-white"
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {visible.length.toLocaleString()} matching movements
            </p>
          </div>
          <div className="flex gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
              <Input
                aria-label="Search inventory movements"
                placeholder="Product, creator or reference…"
                className="pl-10"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setLimit(50)
                }}
              />
            </div>
            <Button
              variant="outline"
              aria-expanded={filtersOpen}
              aria-controls="ledger-filters"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal className="mr-2 size-4" />
              Filters
              {[sku, from, to].filter(Boolean).length > 0
                ? ` (${[sku, from, to].filter(Boolean).length})`
                : ""}
            </Button>
          </div>
          {filtersOpen && (
            <div id="ledger-filters" className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="ledger-product"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Product
                </label>
                <select
                  id="ledger-product"
                  aria-label="Filter by product"
                  className="workspace-select"
                  value={sku}
                  onChange={(e) => {
                    setSku(e.target.value)
                    setLimit(50)
                  }}
                >
                  <option value="">All products</option>
                  {products.map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="ledger-from"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  From date · WIB
                </label>
                <Input
                  id="ledger-from"
                  aria-label="Movements from date"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value)
                    setLimit(50)
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="ledger-to"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  To date · WIB
                </label>
                <Input
                  id="ledger-to"
                  aria-label="Movements to date"
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value)
                    setLimit(50)
                  }}
                />
              </div>
            </div>
          )}
          {(query || sku || from || to) && (
            <button
              className="text-xs font-bold underline"
              onClick={() => {
                setQuery("")
                setSku("")
                setFrom("")
                setTo("")
                setLimit(50)
              }}
            >
              Clear filters
            </button>
          )}
          {view === "dead" && (
            <p className="text-xs text-muted-foreground">
              Damaged or lost units written off. These goods are excluded from
              saleable stock.
            </p>
          )}
        </div>
        <div className="hidden grid-cols-[minmax(0,1.3fr)_140px_minmax(0,1fr)_90px_130px] gap-4 border-b border-primary/10 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground lg:grid">
          <span>Product</span>
          <span>Movement</span>
          <span>Recipient / reference</span>
          <span className="text-right">Units</span>
          <span className="text-right">Date · WIB</span>
        </div>
        <ul className="divide-y divide-primary/[0.07]">
          {visible.slice(0, limit).map((e) => {
            const p = productMap.get(e.sku)
            const sample = parseSample(e.reference)
            const bundleSku = e.reference?.match(/ \(Bundle: ([^\n]*)\)$/)?.[1]
            return (
              <li
                key={e.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 hover:bg-white/40 sm:px-5 lg:grid-cols-[minmax(0,1.3fr)_140px_minmax(0,1fr)_90px_130px] lg:gap-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ListingThumb
                    src={images[`${e.sku}:single`]}
                    name={p?.name ?? e.sku}
                    sku={e.sku}
                    size={46}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold">
                      {p?.name ?? e.sku}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {e.sku}
                      {p?.variant ? ` · ${p.variant}` : ""}
                    </p>
                  </div>
                </div>
                <div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
                      e.movement_type === "OUT_DAMAGE"
                        ? "bg-[#fff1e3] text-[#7a420d]"
                        : e.movement_type === "OUT_PROMO"
                          ? "bg-[#edeaf8] text-[#53427d]"
                          : "bg-primary/5 text-primary"
                    )}
                  >
                    {e.movement_type === "OUT_DAMAGE" ? (
                      <Ban className="size-3" />
                    ) : e.movement_type === "OUT_PROMO" ? (
                      <Gift className="size-3" />
                    ) : e.quantity > 0 ? (
                      <ArrowDownLeft className="size-3" />
                    ) : (
                      <ArrowUpRight className="size-3" />
                    )}
                    {e.movement_type === "OUT_DAMAGE" &&
                    e.reference?.includes("· Dead stock")
                      ? "Dead stock"
                      : labels[e.movement_type]}
                  </span>
                </div>
                <div className="col-span-2 min-w-0 text-xs lg:col-span-1">
                  {sample ? (
                    <>
                      <p className="font-bold">{sample.recipient}</p>
                      <p className="truncate text-muted-foreground">
                        {sample.platform}
                        {sample.handle ? ` · ${sample.handle}` : ""}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {sample.reason}
                      </p>
                      {bundleSku && (
                        <p className="mt-1 text-muted-foreground">
                          Sent as {productMap.get(bundleSku)?.name ?? bundleSku}
                        </p>
                      )}
                      {sample.notes && (
                        <p
                          className="mt-1 truncate text-muted-foreground"
                          title={sample.notes}
                        >
                          {sample.notes}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="break-words text-muted-foreground">
                      {e.reference || "—"}
                    </p>
                  )}
                </div>
                <p
                  className={cn(
                    "num col-start-2 row-start-1 flex items-center justify-end gap-1 text-lg font-bold lg:col-start-auto lg:row-start-auto lg:justify-end",
                    e.quantity < 0 ? "text-primary" : "text-[#17614e]"
                  )}
                >
                  {e.quantity > 0 ? "+" : ""}
                  {e.quantity}
                </p>
                <p className="col-start-2 row-start-2 text-right text-[10px] text-muted-foreground lg:col-start-auto lg:row-start-auto lg:text-xs">
                  {new Intl.DateTimeFormat("id-ID", {
                    timeZone: "Asia/Jakarta",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  }).format(new Date(e.entry_date))}
                </p>
              </li>
            )
          })}
          {visible.length === 0 && (
            <li className="px-5 py-12 text-center">
              <SlidersHorizontal className="mx-auto mb-3 size-6 text-muted-foreground" />
              <p className="font-bold">No movements match</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try another product or date range.
              </p>
            </li>
          )}
        </ul>
        {visible.length > limit && (
          <div className="border-t border-primary/10 p-4 text-center">
            <Button variant="outline" onClick={() => setLimit((n) => n + 50)}>
              Show 50 more
            </Button>
          </div>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        Every movement stays in your history. To correct an entry, record an
        adjustment with the opposite quantity.
      </p>
    </div>
  )
}
