"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export function SignOutButton() {
  const router = useRouter()
  return (
    <button
      onClick={async () => {
        await createClient().auth.signOut()
        router.push("/login")
      }}
      className="glass mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 text-[14px] font-semibold text-muted-foreground"
    >
      <LogOut className="size-4" /> Sign out
    </button>
  )
}
