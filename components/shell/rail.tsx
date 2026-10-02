"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { motion } from "motion/react"
import { LogOut, Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { NAV_GROUPS, isActive } from "./nav-items"
import { QuickLogTrigger } from "./quick-log-trigger"

const spring = { type: "spring" as const, stiffness: 520, damping: 42, mass: 0.7 }

export function Rail({ userLabel }: { userLabel: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    await createClient().auth.signOut()
    router.push("/login")
  }

  return (
    <aside className="glass sticky top-3.5 m-3.5 mr-0 hidden h-[calc(100dvh-28px)] w-[224px] flex-none flex-col rounded-[22px] px-3.5 py-6 lg:flex">
      <Link href="/dashboard" className="mx-2.5 mb-7 font-display text-[24px] font-bold leading-none text-primary">
        Sheepie<span className="text-secondary">.</span>
      </Link>
      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className={cn(group.label && "mt-4")}>
            {group.label && <p className="mx-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/80">{group.label}</p>}
            {group.items.map((item) => {
              const active = isActive(pathname, item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-[12px] px-2.5 py-[9px] text-[14px] font-semibold transition-colors duration-200",
                    active ? "text-white" : "text-muted-foreground hover:text-primary",
                  )}
                >
                  {active && <motion.span layoutId="rail-active" transition={spring} className="absolute inset-0 rounded-[12px] bg-primary" />}
                  {!active && <span className="absolute inset-0 rounded-[12px] bg-white/0 transition-colors duration-200 group-hover:bg-white/60" />}
                  <Icon className="relative size-[17px]" strokeWidth={1.75} />
                  <span className="relative">{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="mt-auto space-y-3">
        <QuickLogTrigger
          trigger={
            <button className="flex w-full items-center justify-center gap-1.5 rounded-full bg-secondary px-3 py-2.5 text-[14px] font-bold text-primary transition-colors duration-200 hover:bg-[#b4cde6]">
              <Plus className="size-4" strokeWidth={2.25} /> Log an order
            </button>
          }
        />
        <div className="flex items-center gap-2.5 px-2.5">
          <span className="grid size-7 place-items-center rounded-full bg-secondary/40 font-display text-[12px] font-bold text-primary">{userLabel.slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{userLabel}</span>
          <button onClick={signOut} aria-label="Sign out" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/70 hover:text-primary">
            <LogOut className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </aside>
  )
}
