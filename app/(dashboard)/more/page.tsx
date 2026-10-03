import Link from "next/link"
import { BarChart3, ChevronRight, FileText, Goal, MousePointerClick, Truck } from "lucide-react"
import { PageHeader } from "@/components/ui/page"
import { SignOutButton } from "@/components/shell/sign-out-button"

const LINKS = [
  { href: "/restock", label: "Restock", detail: "Supplier batches, arrivals and lead times", icon: Truck },
  { href: "/ledger", label: "Ledger", detail: "Every stock movement", icon: FileText },
  { href: "/reports", label: "Reports", detail: "Sales, profit and channels", icon: BarChart3 },
  { href: "/kpi", label: "KPI", detail: "Monthly targets by product", icon: Goal },
  { href: "/bio-analytics", label: "Bio analytics", detail: "Link-in-bio traffic and clicks", icon: MousePointerClick },
]

export default function MorePage() {
  return (
    <div className="mx-auto max-w-[560px]">
      <PageHeader title="More" />
      <ul className="glass divide-y divide-primary/[0.07] overflow-hidden rounded-[22px]">
        {LINKS.map(({ href, label, detail, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3.5 px-5 py-4 active:bg-white/60">
              <Icon className="size-5 text-primary/70" strokeWidth={1.75} />
              <span className="flex-1">
                <span className="block font-semibold">{label}</span>
                <span className="block text-[13px] text-muted-foreground">{detail}</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      <SignOutButton />
    </div>
  )
}
