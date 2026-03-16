"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Package,
  FileText,
  ShoppingCart,
  BarChart3,
  TrendingUp,
  Upload,
  History,
  LogOut,
  Menu,
  X
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState } from "react"

const navigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Products",
    href: "/products",
    icon: Package,
  },
  {
    name: "Ledger",
    href: "/ledger",
    icon: FileText,
  },
  {
    name: "Orders",
    href: "/orders",
    icon: ShoppingCart,
  },
  {
    name: "Reports",
    href: "/reports",
    icon: BarChart3,
  },
  {
    name: "Ad Campaigns",
    href: "/ad-campaigns",
    icon: TrendingUp,
  },
  {
    name: "Changelog",
    href: "/changelog",
    icon: History,
  },
]

const adminNavigation = [
  {
    name: "Import Data",
    href: "/import",
    icon: Upload,
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  const closeMobileMenu = () => {
    setMobileMenuOpen(false)
  }

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b bg-card px-4">
        <h1 className="text-xl font-display font-bold text-primary">
          Sheepie.
        </h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "flex h-screen w-64 flex-col border-r bg-card transition-transform duration-200 ease-in-out",
          "lg:translate-x-0 lg:static lg:z-auto",
          "fixed z-40 top-0 left-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center border-b px-6">
          <h1 className="text-xl font-display font-bold text-primary">
            Sheepie.
          </h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-6 p-4 overflow-y-auto">
          <div className="space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={closeMobileMenu}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </div>

          {/* Admin Section */}
          <div>
            <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Admin
            </p>
            <div className="space-y-1">
              {adminNavigation.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={closeMobileMenu}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>
        </nav>

        {/* Sign Out */}
        <div className="border-t p-4">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={handleSignOut}
          >
            <LogOut className="mr-3 h-5 w-5" />
            Sign Out
          </Button>
        </div>
      </div>
    </>
  )
}
