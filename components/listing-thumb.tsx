import { cn } from "@/lib/utils"

const TINT: Record<string, string> = {
  Cervi: "#dfe9f5",
  Lumi: "#cfe0f3",
  Calmi: "#d9e6f6",
}

/** Product listing photo, or a soft lettered placeholder until one is uploaded. */
export function ListingThumb({
  src,
  name,
  sku,
  size = 44,
  className,
}: {
  src: string | null | undefined
  name: string
  sku?: string
  size?: number
  className?: string
}) {
  const style = { width: size, height: size }
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={cn("flex-none rounded-[12px] border border-white/80 bg-white/70 object-cover", className)}
        style={style}
      />
    )
  }
  const family = (sku ?? name).split("-")[0]
  const initials = name
    .replace(/Cloud/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
  // SVG text scales with whatever box the caller gives it (fixed thumb or full-width card).
  return (
    <span
      aria-hidden
      className={cn("block flex-none overflow-hidden rounded-[12px] border border-white/80 text-primary/70", className)}
      style={{ ...style, background: TINT[family] ?? "#e3ecf7" }}
    >
      <svg viewBox="0 0 100 100" className="size-full">
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fill="currentColor" className="font-display font-semibold" fontSize="30">
          {initials}
        </text>
      </svg>
    </span>
  )
}
