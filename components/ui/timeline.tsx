"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import React, { useEffect, useRef, useState } from "react"

export interface TimelineEntry {
  title: string
  content: React.ReactNode
}

interface TimelineProps {
  data: TimelineEntry[]
  heading?: string
  description?: string
}

export function Timeline({
  data,
  heading = "Operations changelog",
  description = "A timeline of updates made across the dashboard and manual operational notes recorded by the team.",
}: TimelineProps) {
  const ref = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setHeight(rect.height)
    }
  }, [data])

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 10%", "end 50%"],
  })

  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height])
  const opacityTransform = useTransform(scrollYProgress, [0, 0.1], [0, 1])

  return (
    <div className="w-full font-body" ref={containerRef}>
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 lg:px-10">
        <h2 className="max-w-4xl text-2xl text-foreground md:text-4xl">
          {heading}
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
          {description}
        </p>
      </div>

      <div ref={ref} className="relative mx-auto max-w-6xl px-4 pb-20 md:px-8 lg:px-10">
        {data.map((item, index) => (
          <div
            key={`${item.title}-${index}`}
            className="flex justify-start gap-4 pt-10 md:gap-10 md:pt-20"
          >
            <div className="sticky top-28 z-20 flex w-16 shrink-0 flex-col items-center self-start md:w-full md:max-w-xs md:flex-row lg:max-w-sm">
              <div className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-sm md:left-3">
                <div className="h-4 w-4 rounded-full bg-primary/20 ring-4 ring-primary/10" />
              </div>
              <h3 className="hidden pl-20 text-xl font-bold text-foreground/70 md:block md:text-4xl">
                {item.title}
              </h3>
            </div>

            <div className="relative w-full pl-16 pr-1 md:pl-4">
              <h3 className="mb-4 block text-2xl font-bold text-foreground/70 md:hidden">
                {item.title}
              </h3>
              {item.content}
            </div>
          </div>
        ))}

        <div
          style={{ height: `${height}px` }}
          className="absolute left-7 top-0 w-[2px] overflow-hidden bg-[linear-gradient(to_bottom,var(--tw-gradient-stops))] from-transparent via-border to-transparent md:left-11"
        >
          <motion.div
            style={{
              height: heightTransform,
              opacity: opacityTransform,
            }}
            className="absolute inset-x-0 top-0 w-[2px] rounded-full bg-gradient-to-t from-secondary via-primary to-transparent"
          />
        </div>
      </div>
    </div>
  )
}
