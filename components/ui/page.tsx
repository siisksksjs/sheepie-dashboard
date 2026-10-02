import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Page title in Sheepie's voice: Playfair heading, one plain sentence underneath. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4 pt-2 lg:pt-5">
      <div className="min-w-0">
        <h1 className="font-display text-[30px] font-semibold leading-tight sm:text-[34px]">{title}</h1>
        {description && <p className="mt-1 max-w-[64ch] text-[14.5px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Stat({ label, value, note, className }: { label: string; value: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div className={cn("glass-inset rounded-[16px] px-4 py-3.5", className)}>
      <p className="text-[12.5px] font-semibold text-muted-foreground">{label}</p>
      <p className="num mt-1 font-display text-[22px] font-semibold leading-tight">{value}</p>
      {note && <p className="mt-1 text-[12px] text-muted-foreground">{note}</p>}
    </div>
  )
}

export function PaceBar({ label, value, target, elapsed, format, tone = "navy" }: { label: string; value: number; target: number; elapsed: number; format: (n: number) => string; tone?: "navy" | "sky" }) {
  const share = target > 0 ? Math.min(1, value / target) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-semibold text-muted-foreground">{label}</span>
        <span className="num font-semibold">
          {format(value)}
          <span className="text-muted-foreground"> / {target > 0 ? format(target) : "no target"}</span>
        </span>
      </div>
      <div className="relative mt-2 h-2.5 rounded-full bg-primary/[0.08]" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={target}>
        <div className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000", tone === "navy" ? "bg-primary" : "bg-secondary")} style={{ width: `${share * 100}%` }} />
        {target > 0 && <span className="absolute -top-1.5 h-[22px] w-[2px] rounded-full bg-[#e3a24a]" style={{ left: `calc(${elapsed * 100}% - 1px)` }} title="Where an even pace would be today" />}
      </div>
    </div>
  )
}
