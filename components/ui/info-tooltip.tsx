"use client"

import { Info } from "lucide-react"
import { useState } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface InfoTooltipProps {
  content: string
  formula?: string
  openOnClick?: boolean
}

export function InfoTooltip({ content, formula, openOnClick = true }: InfoTooltipProps) {
  const [open, setOpen] = useState(false)

  const handleToggle = () => {
    if (!openOnClick) return
    setOpen((prev) => !prev)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!openOnClick) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      setOpen((prev) => !prev)
    }
  }

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center ml-1.5"
            aria-label="Show info"
            onClick={handleToggle}
            onKeyDown={handleKeyDown}
          >
            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <div className="space-y-1">
            <p className="font-medium">{content}</p>
            {formula && (
              <p className="text-xs font-mono bg-muted px-2 py-1 rounded mt-1">
                {formula}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
