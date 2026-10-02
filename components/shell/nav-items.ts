import { BarChart3, Boxes, CloudSun, FileText, Goal, MousePointerClick, Package, ShoppingBag, Truck, type LucideIcon } from "lucide-react"

export type NavItem = { href: string; label: string; icon: LucideIcon }

export const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Today", icon: CloudSun },
      { href: "/orders", label: "Orders", icon: ShoppingBag },
    ],
  },
  {
    label: "Stock",
    items: [
      { href: "/products", label: "Products", icon: Package },
      { href: "/ledger", label: "Ledger", icon: FileText },
      { href: "/restock", label: "Restock", icon: Truck },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/kpi", label: "KPI", icon: Goal },
      { href: "/bio-analytics", label: "Bio analytics", icon: MousePointerClick },
    ],
  },
]

export const MORE_HREFS = ["/more", "/ledger", "/restock", "/reports", "/kpi", "/bio-analytics"]

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export { Boxes }
