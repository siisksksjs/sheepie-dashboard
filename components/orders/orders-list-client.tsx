"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronRight, RotateCcw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ListingThumb } from "@/components/listing-thumb"
import { PlatformBadge } from "@/components/shell/platform-badge"
import { PLATFORMS, PLATFORM_ORDER } from "@/components/shell/platforms"
import { filterOrdersForSearch } from "@/lib/orders/search"
import { getPackSizeLabel } from "@/lib/products/pack-sizes"
import { cn, formatCurrency, formatDate } from "@/lib/utils"
import type { Channel } from "@/lib/types/database.types"

const statusBadges: Record<string, "default" | "success" | "destructive" | "outline" | "secondary"> = {
  paid: "success",
  shipped: "secondary",
  cancelled: "destructive",
  returned: "outline",
}

type OrderListItem = Awaited<ReturnType<typeof import("@/lib/actions/orders").getOrders>>[number]
type OrderListLineItem = OrderListItem["order_line_items"][number]

type Props = {
  orders: OrderListItem[]
  /** Listing thumbnails keyed `${sku}:${packSize}`. */
  images: Record<string, string>
}

function lineLabel(item: OrderListLineItem) {
  return `${item.quantity > 1 ? `${item.quantity}× ` : ""}${item.product_name}${item.pack_size && item.pack_size !== "single" ? ` · ${getPackSizeLabel(item.pack_size)}` : ""}`
}

export function OrdersListClient({ orders, images }: Props) {
  const [searchQuery, setSearchQuery] = useState("")
  const [channel, setChannel] = useState<Channel | "all">("all")
  const filteredOrders = useMemo(
    () => filterOrdersForSearch(orders, searchQuery).filter((order) => channel === "all" || order.channel === channel),
    [orders, searchQuery, channel],
  )
  const thumbFor = (order: OrderListItem) => {
    const first = order.order_line_items[0]
    if (!first) return null
    return images[`${first.sku}:${first.pack_size ?? "single"}`] ?? images[`${first.sku}:single`] ?? null
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-[20px] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-md">
            <Input
              type="search"
              name="order-search"
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by product name or revenue"
              aria-label="Search orders"
              className="rounded-full"
            />
          </div>
          <p className="shrink-0 text-sm font-semibold text-muted-foreground" aria-live="polite">
            {filteredOrders.length} matching order{filteredOrders.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 py-0.5">
          {(["all", ...PLATFORM_ORDER] as const).map((p) => (
            <button
              key={p}
              onClick={() => setChannel(p)}
              aria-pressed={channel === p}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition-colors",
                channel === p ? "border-primary bg-primary text-white" : "border-primary/10 bg-white/70 text-muted-foreground hover:text-primary",
              )}
            >
              {p !== "all" && <PlatformBadge channel={p} size={23} />}
              {p === "all" ? "All platforms" : PLATFORMS[p].label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Revenue can be partial. Example: 500000</p>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="glass rounded-[20px] px-6 py-12 text-center">
          <h2 className="font-display text-lg font-semibold text-foreground">No orders match your search</h2>
          <p className="mt-1 text-sm text-muted-foreground">Try another product name, part of the revenue amount, or a different platform.</p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => {
              setSearchQuery("")
              setChannel("all")
            }}
          >
            Clear Search
          </Button>
        </div>
      ) : (
        <>
          {/* Phone: one card per order */}
          <ul className="space-y-2.5 md:hidden">
            {filteredOrders.map((order) => (
              <li key={order.id} className="glass rounded-[20px] p-3.5">
                <Link href={`/orders/${order.id}`} className="flex items-start gap-3">
                  <span className="relative flex-none">
                    <ListingThumb src={thumbFor(order)} name={order.order_line_items[0]?.product_name ?? order.order_id} sku={order.order_line_items[0]?.sku} size={56} />
                    <span className="absolute -bottom-1 -right-1 rounded-[7px] ring-2 ring-white">
                      <PlatformBadge channel={order.channel} size={22} />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold leading-snug">{order.order_line_items.map(lineLabel).join(" + ") || "No items"}</span>
                    <span className="num mt-0.5 block text-[12px] text-muted-foreground">
                      {PLATFORMS[order.channel as Channel].label} · {order.order_id} · {formatDate(order.order_date)}
                    </span>
                  </span>
                  <Badge variant={statusBadges[order.status]}>{order.status.charAt(0).toUpperCase() + order.status.slice(1)}</Badge>
                </Link>
                <div className="num mt-3 flex items-end justify-between gap-3 border-t border-primary/[0.07] pt-3 text-[12.5px]">
                  <span className="space-y-0.5">
                    <span className="block">GMV {formatCurrency(order.gmv)}</span>
                    <span className="block text-muted-foreground">Revenue {formatCurrency(order.revenue)}</span>
                    <span className="block font-semibold text-[#1f6b42]">Profit {formatCurrency(order.profit)}</span>
                  </span>
                  <Link href={`/orders/new?from=${order.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-white/70 px-3 py-1.5 font-bold text-primary">
                    <RotateCcw className="size-3.5" /> Log again
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: dense rows, picture first so the right product is obvious */}
          <div className="glass hidden overflow-hidden rounded-[20px] md:block">
            <div className="grid grid-cols-[minmax(0,2.4fr)_120px_100px_repeat(3,minmax(0,1fr))_112px] gap-3 border-b border-primary/[0.07] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              <span>Order</span>
              <span>Date</span>
              <span>Status</span>
              <span className="text-right">GMV</span>
              <span className="text-right">Revenue</span>
              <span className="text-right">Profit</span>
              <span />
            </div>
            <ul className="divide-y divide-primary/[0.06]">
              {filteredOrders.map((order) => (
                <li key={order.id} className="group grid grid-cols-[minmax(0,2.4fr)_120px_100px_repeat(3,minmax(0,1fr))_112px] items-center gap-3 px-5 py-3 transition-colors hover:bg-white/55">
                  <Link href={`/orders/${order.id}`} className="flex min-w-0 items-center gap-3">
                    <span className="relative flex-none">
                      <ListingThumb src={thumbFor(order)} name={order.order_line_items[0]?.product_name ?? order.order_id} sku={order.order_line_items[0]?.sku} size={46} />
                      <span className="absolute -bottom-1 -right-1 rounded-[6px] ring-2 ring-white">
                        <PlatformBadge channel={order.channel} size={24} />
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-bold">{order.order_line_items.map(lineLabel).join(" + ") || "No items"}</span>
                      <span className="num block truncate text-[12px] text-muted-foreground">
                        {PLATFORMS[order.channel as Channel].label} · {order.order_id}
                        {order.notes ? ` · ${order.notes}` : ""}
                      </span>
                    </span>
                  </Link>
                  <span className="num text-[13px] text-muted-foreground">{formatDate(order.order_date)}</span>
                  <span>
                    <Badge variant={statusBadges[order.status]}>{order.status.charAt(0).toUpperCase() + order.status.slice(1)}</Badge>
                  </span>
                  <span className="num text-right text-[13.5px] font-semibold">{formatCurrency(order.gmv)}</span>
                  <span className="num text-right text-[13.5px] text-muted-foreground">{formatCurrency(order.revenue)}</span>
                  <span className={cn("num text-right text-[13.5px] font-semibold", order.profit >= 0 ? "text-[#1f6b42]" : "text-destructive")}>{formatCurrency(order.profit)}</span>
                  <span className="flex items-center justify-end gap-1">
                    <Link
                      href={`/orders/new?from=${order.id}`}
                      title="Log this order again — you check it before saving"
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-bold text-primary/70 opacity-0 transition-opacity hover:bg-white/80 hover:text-primary focus:opacity-100 group-hover:opacity-100"
                    >
                      <RotateCcw className="size-3.5" /> Log again
                    </Link>
                    <Link href={`/orders/${order.id}`} aria-label={`Open ${order.order_id}`} className="rounded-full p-1.5 text-primary/40 hover:text-primary">
                      <ChevronRight className="size-4" />
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
