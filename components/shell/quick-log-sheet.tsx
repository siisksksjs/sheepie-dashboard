"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition, type ReactNode } from "react"
import { Drawer } from "vaul"
import { ArrowLeft, Pin, Search } from "lucide-react"
import { toast } from "sonner"
import { getQuickLogTemplates, quickLogOrder, undoQuickLog, type QuickLogTemplate } from "@/lib/actions/quick-log"
import { ListingThumb } from "@/components/listing-thumb"
import { PLATFORMS, PLATFORM_ORDER } from "./platforms"
import { PlatformBadge } from "./platform-badge"
import { cn, formatCurrency } from "@/lib/utils"
import type { Channel } from "@/lib/types/database.types"

const PIN_KEY = "sheepie.quicklog.pins"

function readPins(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PIN_KEY) || "[]")
  } catch {
    return []
  }
}

function describe(t: QuickLogTemplate) {
  return t.lines.map((l) => `${l.name}${l.packSize === "single" ? "" : ` · ${l.packLabel}`}${l.quantity > 1 ? ` ×${l.quantity}` : ""}`).join(" + ")
}

/** "+ Log an order": pick a usual order, check it, log it. Undo stays for 10 seconds. */
export function QuickLogSheet({ trigger }: { trigger: ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<QuickLogTemplate[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [platform, setPlatform] = useState<Channel | "all">("all")
  const [query, setQuery] = useState("")
  const [pins, setPins] = useState<string[]>([])
  const [picked, setPicked] = useState<QuickLogTemplate | null>(null)
  const [pending, start] = useTransition()

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) return
    setPins(readPins())
    setPicked(null)
    getQuickLogTemplates()
      .then((t) => {
        setTemplates(t)
        setLoadError(null)
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load your usual orders"))
  }

  const togglePin = (key: string) => {
    const next = pins.includes(key) ? pins.filter((k) => k !== key) : [...pins, key]
    setPins(next)
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(next))
    } catch {
      // pins are a convenience; ignore storage failures
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (templates ?? []).filter(
      (t) => (platform === "all" || t.channel === platform) && (!q || `${describe(t)} ${PLATFORMS[t.channel].label} ${t.lines.map((l) => `${l.sku} ${l.variant ?? ""}`).join(" ")}`.toLowerCase().includes(q)),
    )
    return [...list].sort((a, b) => Number(pins.includes(b.key)) - Number(pins.includes(a.key)))
  }, [templates, platform, query, pins])

  const log = (t: QuickLogTemplate) =>
    start(async () => {
      const r = await quickLogOrder(t.sourceOrderId)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      setOpen(false)
      router.refresh()
      toast(`Logged ${r.orderId} · ${formatCurrency(t.total)}`, {
        description: `${PLATFORMS[t.channel].label} · ${describe(t)}`,
        duration: 10_000,
        action: {
          label: "Undo",
          onClick: async () => {
            const u = await undoQuickLog(r.id)
            if (u.success) {
              toast(`Undone — ${r.orderId} cancelled and stock put back`)
              router.refresh()
            } else toast.error(u.error ?? "Couldn't undo")
          },
        },
      })
    })

  return (
    <Drawer.Root open={open} onOpenChange={handleOpenChange}>
      <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-[#213368]/25 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 border border-white bg-[#f7fafd] mx-auto flex max-h-[88dvh] max-w-xl flex-col rounded-t-[28px] outline-none">
          <div className="mx-auto mb-1 mt-3 h-1 w-10 flex-none rounded-full bg-primary/15" />
          {picked ? (
            <div className="flex flex-col px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2">
              <button onClick={() => setPicked(null)} className="mb-3 inline-flex items-center gap-1 self-start text-[13px] font-semibold text-muted-foreground hover:text-primary">
                <ArrowLeft className="size-4" /> Back to usual orders
              </button>
              <Drawer.Title className="flex items-center gap-3 font-display text-[22px] font-semibold leading-tight">
                <PlatformBadge channel={picked.channel} size={40} />
                {PLATFORMS[picked.channel].label} order
              </Drawer.Title>
              <Drawer.Description className="sr-only">Check the order before logging it</Drawer.Description>
              <ul className="mt-4 divide-y divide-primary/[0.07]">
                {picked.lines.map((l) => (
                  <li key={`${l.sku}${l.packSize}`} className="flex items-center gap-3 py-3">
                    <ListingThumb src={l.imageUrl} name={l.name} sku={l.sku} size={64} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{l.name}</p>
                      <p className="text-[13px] text-muted-foreground">
                        {l.packLabel}
                        {l.quantity > 1 ? ` × ${l.quantity}` : ""}
                      </p>
                    </div>
                    <p className="num font-semibold">{formatCurrency(l.sellingPrice * l.quantity)}</p>
                  </li>
                ))}
              </ul>
              <dl className="num mt-2 space-y-1.5 rounded-2xl bg-white/60 p-4 text-[14px]">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Date</dt>
                  <dd className="font-semibold">Today, as paid</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="font-display text-[20px] font-semibold">{formatCurrency(picked.total)}</dd>
                </div>
              </dl>
              <button
                onClick={() => log(picked)}
                disabled={pending}
                className="mt-4 h-12 rounded-full bg-primary text-[16px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
              >
                {pending ? "Logging…" : "Log it"}
              </button>
              <Link href={`/orders/new?from=${picked.sourceOrderId}`} onClick={() => setOpen(false)} className="mt-3 text-center text-[13px] font-semibold text-muted-foreground hover:text-primary">
                Change something first
              </Link>
            </div>
          ) : (
            <div className="flex min-h-0 flex-col px-5 pt-2">
              <div className="flex flex-none items-end justify-between gap-3">
                <div>
                  <Drawer.Title className="font-display text-[22px] font-semibold">Log an order</Drawer.Title>
                  <Drawer.Description className="text-[13px] text-muted-foreground">Your usual orders from the last 90 days. Tap one, check, done.</Drawer.Description>
                </div>
                <Link href="/orders/new" onClick={() => setOpen(false)} className="whitespace-nowrap text-[13px] font-semibold text-primary/80 hover:text-primary">
                  New from scratch
                </Link>
              </div>
              <div className="-mx-1 mt-3 flex flex-none gap-1.5 overflow-x-auto px-1 py-1">
                {(["all", ...PLATFORM_ORDER] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={cn(
                      "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition-colors",
                      platform === p ? "border-primary bg-primary text-white" : "border-primary/10 bg-white/70 text-muted-foreground hover:text-primary",
                    )}
                  >
                    {p !== "all" && <span className="size-2 rounded-full" style={{ background: PLATFORMS[p].color }} />}
                    {p === "all" ? "All" : PLATFORMS[p].label}
                  </button>
                ))}
              </div>
              <label className="relative mt-2 block flex-none">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search — apricot, pillow, bundle of 2…"
                  className="h-11 w-full rounded-full border border-primary/10 bg-white/75 pl-10 pr-4 text-[14px] outline-none focus:border-secondary"
                />
              </label>
              <ul className="-mx-1 mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-[max(20px,env(safe-area-inset-bottom))]">
                {loadError && <li className="rounded-2xl bg-white/60 p-4 text-[14px] text-destructive">{loadError}</li>}
                {!templates && !loadError && Array.from({ length: 4 }).map((_, i) => <li key={i} className="h-[76px] animate-pulse rounded-2xl bg-white/50" />)}
                {templates && visible.length === 0 && (
                  <li className="rounded-2xl bg-white/60 p-5 text-center text-[14px] text-muted-foreground">
                    {templates.length === 0 ? "No orders in the last 90 days yet — log one from scratch and it will show up here." : "Nothing matches. Try another word or platform."}
                  </li>
                )}
                {visible.map((t) => {
                  const pinned = pins.includes(t.key)
                  return (
                    <li key={t.key} className="glass flex items-center gap-3 rounded-2xl p-2.5 pr-3">
                      <button onClick={() => setPicked(t)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className="relative flex-none">
                          <ListingThumb src={t.lines[0].imageUrl} name={t.lines[0].name} sku={t.lines[0].sku} size={56} />
                          <span className="absolute -bottom-1 -right-1 rounded-[7px] ring-2 ring-white">
                            <PlatformBadge channel={t.channel} size={22} />
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block text-[14px] font-bold leading-snug">{describe(t)}</span>
                          <span className="block truncate text-[12.5px] text-muted-foreground">
                            <span className="num font-bold text-primary sm:hidden">{formatCurrency(t.total)} · </span>
                            {PLATFORMS[t.channel].label} · {t.timesThisMonth > 0 ? `${t.timesThisMonth}× this month` : `${t.timesTotal}× in 90 days`}
                          </span>
                        </span>
                        <span className="num hidden whitespace-nowrap text-right text-[14px] font-bold sm:block">{formatCurrency(t.total)}</span>
                      </button>
                      <button
                        onClick={() => togglePin(t.key)}
                        aria-label={pinned ? "Unpin" : "Pin to top"}
                        aria-pressed={pinned}
                        className={cn("grid size-8 flex-none place-items-center rounded-full transition-colors", pinned ? "bg-secondary/50 text-primary" : "text-primary/30 hover:text-primary")}
                      >
                        <Pin className="size-4" fill={pinned ? "currentColor" : "none"} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

