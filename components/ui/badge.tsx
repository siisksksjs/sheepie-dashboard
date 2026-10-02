import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary/45 text-primary",
        destructive:
          "border-[#c2412d]/25 bg-[#c2412d]/10 text-[#9b2f1f]",
        success:
          "border-[#2f8f5b]/25 bg-[#2f8f5b]/12 text-[#1f6b42]",
        warning:
          "border-[#d48b2c]/30 bg-[#d48b2c]/14 text-[#8a5212]",
        outline: "border-primary/15 bg-white/50 text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
