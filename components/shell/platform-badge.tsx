import type { Channel } from "@/lib/types/database.types"
import { PLATFORMS } from "./platforms"

export function PlatformBadge({ channel, size = 34 }: { channel: Channel; size?: number }) {
  const p = PLATFORMS[channel]
  return (
    <span
      className="grid flex-none place-items-center rounded-[10px] font-bold text-white"
      style={{ background: p.color, width: size, height: size, fontSize: Math.max(9, size * 0.32) }}
      title={p.label}
    >
      {p.short}
    </span>
  )
}
