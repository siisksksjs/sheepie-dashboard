import { Info } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface InfoTooltipProps {
  content: string
  formula?: string
}

export function InfoTooltip({ content, formula }: InfoTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help inline-block ml-1.5" />
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
