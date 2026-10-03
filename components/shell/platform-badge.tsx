import type { Channel } from "@/lib/types/database.types"
import { PLATFORMS } from "./platforms"

export function PlatformBadge({ channel, size = 34, showLabel = false }: { channel: Channel; size?: number; showLabel?: boolean }) {
  const p = PLATFORMS[channel]
  return (
    <span className="inline-flex flex-none items-center gap-2 whitespace-nowrap">
      <span role="img" aria-label={p.label} title={p.label} className="grid flex-none place-items-center rounded-lg font-bold text-white" style={{ background: p.color, width: size, height: size, fontSize: Math.max(9, size * 0.32) }}>
        {channel === "offline" ? p.short : (
          // Local brand SVGs keep platform recognition available without a CDN request.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/platforms/${channel}.${channel === "tokopedia" ? "ico" : "svg"}`} alt="" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} />
        )}
      </span>
      {showLabel && <span className="text-[12px] font-semibold">{p.label}</span>}
    </span>
  )
}
