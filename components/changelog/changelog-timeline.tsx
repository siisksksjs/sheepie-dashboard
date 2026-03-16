"use client"

import Link from "next/link"
import {
  Boxes,
  FileText,
  Megaphone,
  Package,
  Pencil,
  ReceiptText,
  Settings2,
  ShoppingCart,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Timeline, type TimelineEntry } from "@/components/ui/timeline"
import type { ChangelogEntryWithItems } from "@/lib/types/database.types"

type ChangelogTimelineProps = {
  entries: ChangelogEntryWithItems[]
}

const areaIcons = {
  ads: Megaphone,
  inventory: Boxes,
  orders: ShoppingCart,
  products: Package,
  bundles: Package,
  admin: Settings2,
} as const

function formatDayLabel(dateString: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateString))
}

function formatTimeLabel(dateString: string) {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString))
}

function groupEntries(entries: ChangelogEntryWithItems[]) {
  const groups = new Map<string, ChangelogEntryWithItems[]>()

  for (const entry of entries) {
    const dayKey = new Date(entry.logged_at).toISOString().slice(0, 10)
    const existing = groups.get(dayKey) || []
    existing.push(entry)
    groups.set(dayKey, existing)
  }

  return Array.from(groups.entries()).map(([dayKey, groupedEntries]) => ({
    dayKey,
    title: formatDayLabel(dayKey),
    entries: groupedEntries.sort(
      (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
    ),
  }))
}

export function ChangelogTimeline({ entries }: ChangelogTimelineProps) {
  const data: TimelineEntry[] = groupEntries(entries).map((group) => ({
    title: group.title,
    content: (
      <div className="space-y-4">
        {group.entries.map((entry) => {
          const Icon = areaIcons[entry.area as keyof typeof areaIcons] || FileText

          return (
            <Card key={entry.id} className="overflow-hidden border-border/80 bg-card/95 shadow-sm">
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <Badge variant={entry.source === "manual" ? "outline" : "secondary"}>
                        {entry.source}
                      </Badge>
                      <Badge variant="outline">{entry.area}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatTimeLabel(entry.logged_at)}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {entry.action_summary}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {entry.entity_label}
                        {entry.entity_type ? ` • ${entry.entity_type}` : ""}
                        {entry.entity_id ? ` • ${entry.entity_id}` : ""}
                      </p>
                    </div>
                  </div>

                  <Link href={`/changelog/${entry.id}/edit`}>
                    <Button variant="outline" size="sm">
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </Link>
                </div>

                {entry.changelog_items.length > 0 ? (
                  <div className="grid gap-3">
                    {entry.changelog_items.map((item) => (
                      <div
                        key={item.id}
                        className="grid gap-2 rounded-2xl border border-border/70 bg-muted/40 p-4 md:grid-cols-[minmax(0,180px)_1fr_auto_1fr]"
                      >
                        <div className="text-sm font-semibold text-foreground">
                          {item.field_name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {item.old_value || "—"}
                        </div>
                        <div className="text-sm font-semibold text-primary">→</div>
                        <div className="text-sm text-foreground">
                          {item.new_value || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                    No field-level changes recorded.
                  </div>
                )}

                {entry.notes ? (
                  <div className="rounded-2xl border border-secondary/30 bg-secondary/10 p-4 text-sm text-foreground">
                    {entry.notes}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )
        })}
      </div>
    ),
  }))

  return (
    <Timeline
      data={data}
      heading="Operations changelog"
      description="A date-based timeline of changes made inside the dashboard plus manual notes for external platform updates."
    />
  )
}
