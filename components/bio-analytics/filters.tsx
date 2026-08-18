"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { RotateCcw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { hasActiveBioFilters, serializeBioFilters } from "@/lib/bio-analytics/filters"
import {
  BIO_REFERRER_CATEGORIES,
  BIO_SCREEN_CATEGORIES,
  type BioAnalyticsFilters,
  type BioFilterOptions,
  type BioRangePreset,
} from "@/lib/bio-analytics/types"
import { DESTINATION_LABELS, PRODUCT_LABELS, labelFor } from "./presentation"

const PRESETS: Array<{ value: BioRangePreset; label: string }> = [
  { value: "today", label: "Hari ini" },
  { value: "7d", label: "7 hari" },
  { value: "28d", label: "28 hari" },
  { value: "90d", label: "90 hari" },
  { value: "12m", label: "12 bulan" },
  { value: "custom", label: "Kustom" },
]

const REFERRER_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  google: "Google",
  direct: "Langsung",
  other: "Lainnya",
}

const SCREEN_LABELS: Record<string, string> = {
  mobile: "Ponsel",
  tablet: "Tablet",
  desktop: "Desktop",
}

type ToggleGroupProps = {
  legend: string
  values: string[]
  selected: string[]
  labels?: Record<string, string>
  onToggle: (value: string) => void
}

function ToggleGroup({ legend, values, selected, labels, onToggle }: ToggleGroupProps) {
  if (values.length === 0) return null

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => {
          const isSelected = selected.includes(value)
          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              aria-pressed={isSelected}
              className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors data-[selected=true]:border-transparent data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground hover:bg-accent"
              data-selected={isSelected}
            >
              {labels ? labelFor(labels, value) : value}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export function BioAnalyticsFiltersBar({
  filters,
  options,
}: {
  filters: BioAnalyticsFilters
  options: BioFilterOptions
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  /** Any filter change resets pagination: page 3 of the old result set is meaningless. */
  const apply = (next: Partial<BioAnalyticsFilters>) => {
    const merged: BioAnalyticsFilters = { ...filters, ...next, eventPage: 1 }
    startTransition(() => {
      router.replace(`/bio-analytics?${serializeBioFilters(merged)}`, { scroll: false })
    })
  }

  const toggle = (key: keyof BioAnalyticsFilters, value: string) => {
    const current = filters[key] as string[]
    apply({
      [key]: current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    } as Partial<BioAnalyticsFilters>)
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Rentang waktu</legend>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => apply({ preset: preset.value })}
                  aria-pressed={filters.preset === preset.value}
                  data-selected={filters.preset === preset.value}
                  className="rounded-full border px-3 py-1 text-xs font-medium transition-colors data-[selected=true]:border-transparent data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground hover:bg-accent"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </fieldset>

          {filters.preset === "custom" ? (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="bio-from" className="text-xs text-muted-foreground">
                  Dari
                </Label>
                <Input
                  id="bio-from"
                  type="date"
                  className="h-8 w-40"
                  value={filters.startDate ?? ""}
                  onChange={(event) => apply({ startDate: event.target.value || null })}
                />
              </div>
              <div>
                <Label htmlFor="bio-to" className="text-xs text-muted-foreground">
                  Sampai
                </Label>
                <Input
                  id="bio-to"
                  type="date"
                  className="h-8 w-40"
                  value={filters.endDate ?? ""}
                  onChange={(event) => apply({ endDate: event.target.value || null })}
                />
              </div>
            </div>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {isPending ? <Badge variant="outline">Memuat…</Badge> : null}
            {hasActiveBioFilters(filters) ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  apply({
                    productSlugs: [],
                    destinations: [],
                    utmSources: [],
                    campaigns: [],
                    screenCategories: [],
                    referrerCategories: [],
                  })
                }
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Hapus filter
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ToggleGroup
            legend="Produk"
            values={options.products}
            selected={filters.productSlugs}
            labels={PRODUCT_LABELS}
            onToggle={(value) => toggle("productSlugs", value)}
          />
          <ToggleGroup
            legend="Tujuan"
            values={options.destinations}
            selected={filters.destinations}
            labels={DESTINATION_LABELS}
            onToggle={(value) => toggle("destinations", value)}
          />
          <ToggleGroup
            legend="Perangkat"
            values={[...BIO_SCREEN_CATEGORIES]}
            selected={filters.screenCategories}
            labels={SCREEN_LABELS}
            onToggle={(value) => toggle("screenCategories", value)}
          />
          <ToggleGroup
            legend="Asal kunjungan"
            values={[...BIO_REFERRER_CATEGORIES]}
            selected={filters.referrerCategories}
            labels={REFERRER_LABELS}
            onToggle={(value) => toggle("referrerCategories", value)}
          />
          <ToggleGroup
            legend="UTM source"
            values={options.utm_sources}
            selected={filters.utmSources}
            onToggle={(value) => toggle("utmSources", value)}
          />
          <ToggleGroup
            legend="Kampanye"
            values={options.campaigns}
            selected={filters.campaigns}
            onToggle={(value) => toggle("campaigns", value)}
          />
        </div>
      </CardContent>
    </Card>
  )
}
