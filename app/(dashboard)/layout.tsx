import { redirect } from "next/navigation"
import { Rail } from "@/components/shell/rail"
import { TabBar } from "@/components/shell/tab-bar"
import { createClient } from "@/lib/supabase/server"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const name = typeof user.user_metadata?.name === "string" ? user.user_metadata.name : (user.email ?? "").split("@")[0]

  return (
    <div className="flex min-h-dvh">
      <Rail userLabel={name || "Signed in"} />
      <main className="min-w-0 flex-1 px-4 pb-32 pt-4 sm:px-6 lg:px-7 lg:pb-10 lg:pt-3.5">
        <div className="mx-auto max-w-[1240px]">{children}</div>
      </main>
      <TabBar />
    </div>
  )
}
