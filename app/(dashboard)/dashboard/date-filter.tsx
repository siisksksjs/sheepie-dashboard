"use client"

import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"

type Props = {
  selectedDate: string
}

export function DateFilter({ selectedDate }: Props) {
  const router = useRouter()

  const handleChange = (value: string) => {
    if (!value) return
    router.push(`/dashboard?date=${value}`)
  }

  return (
    <div className="mb-4 w-full max-w-[220px]">
      <label htmlFor="date" className="mb-1 block text-xs text-muted-foreground">
        Date
      </label>
      <Input
        id="date"
        name="date"
        type="date"
        defaultValue={selectedDate}
        onChange={(e) => handleChange(e.target.value)}
      />
    </div>
  )
}
