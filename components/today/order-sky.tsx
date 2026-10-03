"use client"

import Link from "next/link"
import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { PLATFORMS } from "@/components/shell/platforms"
import { formatCurrency } from "@/lib/utils"
import type { SkyOrder } from "@/lib/queries/today"

const jakartaHour = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso))
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0)
  return { value: h + m / 60, label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` }
}

/** Today's orders as small clouds across the day (WIB). Bigger cloud = bigger order; dot = platform. */
export function OrderSky({ orders, hourNow }: { orders: SkyOrder[]; hourNow: number }) {
  const reduce = useReducedMotion()
  const [focus, setFocus] = useState<string | null>(null)
  const maxGmv = Math.max(1, ...orders.map((o) => o.gmv))
  const clouds = orders.map((o) => {
    const h = jakartaHour(o.createdAt)
    return { ...o, x: Math.min(97, Math.max(3, (h.value / 24) * 100)), time: h.label, scale: 0.75 + 0.6 * Math.sqrt(o.gmv / maxGmv) }
  })
  const active = clouds.find((c) => c.id === focus)
  const nowX = Math.min(100, (hourNow / 24) * 100)

  return (
    <div className="relative mt-5 h-[104px] select-none">
      {/* the part of the day still to come */}
      <div className="pointer-events-none absolute bottom-[24px] top-0 rounded-r-xl bg-gradient-to-r from-white/0 to-white/[0.07]" style={{ left: `${nowX}%`, right: 0 }} />
      <div className="absolute inset-x-0 bottom-[24px] h-px bg-white/30" />
      <div className="absolute bottom-[18px] h-3 w-px bg-white/70" style={{ left: `${nowX}%` }} />
      {[0, 6, 9, 12, 15, 18, 21].map((h) => (
        <span key={h} className={`num absolute bottom-0 -translate-x-1/2 text-[10px] font-semibold text-white/60 ${h === 9 || h === 15 || h === 21 ? "max-sm:hidden" : ""}`} style={{ left: `${(h / 24) * 100}%` }}>
          {String(h).padStart(2, "0")}
        </span>
      ))}
      <span className="absolute bottom-0 -translate-x-1/2 text-[10px] font-bold tracking-[0.12em] text-white" style={{ left: `${Math.min(94, nowX)}%` }}>
        NOW
      </span>
      {clouds.map((c, i) => (
        <motion.div
          key={c.id}
          className="absolute bottom-[26px]"
          style={{ left: `${c.x}%` }}
          initial={reduce ? false : { opacity: 0, y: 10, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ delay: 0.2 + i * 0.06, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <Link
            href={`/orders/${c.id}`}
            aria-label={`${c.orderId}, ${PLATFORMS[c.channel].label}, ${formatCurrency(c.gmv)} at ${c.time}`}
            onMouseEnter={() => setFocus(c.id)}
            onMouseLeave={() => setFocus(null)}
            onFocus={() => setFocus(c.id)}
            onBlur={() => setFocus(null)}
            className="cloud-drift absolute bottom-0 block -translate-x-1/2 rounded-full p-1"
            style={{ animationDelay: `${(i % 6) * 0.8}s` }}
          >
            <svg width={40 * c.scale} height={26 * c.scale} viewBox="0 0 40 26" aria-hidden>
              <path d="M10 24h22a8 8 0 0 0 .9-15.95A11 11 0 0 0 12.4 6.6 8.7 8.7 0 0 0 10 24Z" fill="white" fillOpacity={focus === c.id ? 1 : 0.92} />
            </svg>
            <span className="absolute -bottom-[7px] left-1/2 size-[7px] -translate-x-1/2 rounded-full ring-2 ring-white/70" style={{ background: PLATFORMS[c.channel].color }} />
          </Link>
        </motion.div>
      ))}
      {active && (
        <div
          role="status"
          className="num pointer-events-none absolute bottom-[84px] z-10 -translate-x-1/2 whitespace-nowrap rounded-xl border border-white/30 bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur-md"
          style={{ left: `${Math.min(84, Math.max(16, active.x))}%` }}
        >
          {PLATFORMS[active.channel].label} · {formatCurrency(active.gmv)} · {active.time}
          <span className="block max-w-[260px] truncate font-medium text-white/75">{active.summary}</span>
        </div>
      )}
    </div>
  )
}
