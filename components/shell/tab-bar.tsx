"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "motion/react"
import { CloudSun, Ellipsis, Package, Plus, ShoppingBag } from "lucide-react"
import { cn } from "@/lib/utils"
import { MORE_HREFS, isActive } from "./nav-items"
import { QuickLogTrigger } from "./quick-log-trigger"

const LEFT = [
  { href: "/dashboard", label: "Today", icon: CloudSun },
  { href: "/orders", label: "Orders", icon: ShoppingBag },
]
const RIGHT = [
  { href: "/products", label: "Products", icon: Package },
  { href: "/more", label: "More", icon: Ellipsis },
]

/** Phone navigation: floating navy pill with the log button in the middle — the thing you do most. */
export function TabBar() {
  const pathname = usePathname()
  const tab = ({ href, label, icon: Icon }: (typeof LEFT)[number]) => {
    const active = href === "/more" ? MORE_HREFS.some((p) => isActive(pathname, p)) : isActive(pathname, href)
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn("relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[10.5px] font-bold", active ? "text-primary" : "text-white/70")}
      >
        {active && <motion.span layoutId="tab-active" transition={{ type: "spring", stiffness: 500, damping: 40 }} className="absolute inset-0 rounded-full bg-white" />}
        <Icon className="relative size-[18px]" strokeWidth={1.75} />
        <span className="relative">{label}</span>
      </Link>
    )
  }
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 flex items-center gap-1 rounded-full bg-primary/95 px-1.5 py-1.5 backdrop-blur-xl lg:hidden"
    >
      {LEFT.map(tab)}
      <QuickLogTrigger
        trigger={
          <button aria-label="Log an order" className="mx-1 grid size-12 flex-none place-items-center rounded-full bg-secondary text-primary transition-transform active:scale-95">
            <Plus className="size-6" strokeWidth={2.25} />
          </button>
        }
      />
      {RIGHT.map(tab)}
    </nav>
  )
}
