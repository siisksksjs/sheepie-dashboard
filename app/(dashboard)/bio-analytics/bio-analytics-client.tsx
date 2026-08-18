"use client"

import { AlertTriangle, Download, Info } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import {
  BreakdownChart,
  EngagementHeatmap,
  FunnelChart,
  MarketplaceChart,
  ProductPerformanceChart,
  ScrollDepthChart,
  SectionReachChart,
  TrafficChart,
} from "@/components/bio-analytics/charts"
import { BioAnalyticsFiltersBar } from "@/components/bio-analytics/filters"
import { EventTable, JourneyTable } from "@/components/bio-analytics/tables"
import { formatCount, formatPercent } from "@/components/bio-analytics/presentation"
import { serializeBioFilters } from "@/lib/bio-analytics/filters"
import { formatDuration, mergeTrafficSeries } from "@/lib/bio-analytics/metrics"
import type { BioAnalyticsBundle, SourceStatus } from "@/lib/bio-analytics/types"

type KpiCard = {
  label: string
  value: string
  source: "Umami" | "Supabase"
  info: string
  unavailable?: boolean
}

function SourceBanner({ status, errors }: { status: SourceStatus; errors: string[] }) {
  if (status === "healthy") return null

  const isUnconfigured = status === "unconfigured"

  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
      role="status"
    >
      {isUnconfigured ? (
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div>
        <p className="font-medium">
          {isUnconfigured
            ? "Umami traffic data is not configured."
            : "Umami traffic data is unavailable."}
        </p>
        <p className="text-muted-foreground">
          {isUnconfigured
            ? "Set UMAMI_API_KEY and UMAMI_WEBSITE_ID to show visitors and audience breakdowns. The Supabase behavior data below is unaffected."
            : "Visitor and audience panels may be empty. The Supabase behavior data below is unaffected."}
        </p>
        {errors.length > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">Details: {errors.join("; ")}</p>
        ) : null}
      </div>
    </div>
  )
}

export function BioAnalyticsClient({ bundle }: { bundle: BioAnalyticsBundle }) {
  const { filters, range, supabase, umami } = bundle
  const { kpis } = supabase.summary
  const umamiReady = umami.status === "healthy" && umami.stats !== null
  const trafficPoints = mergeTrafficSeries(umami.series, supabase.summary.time_series)
  const query = serializeBioFilters(filters)

  const cards: KpiCard[] = [
    {
      label: "Visitors",
      value: umamiReady ? formatCount(umami.stats!.visitors) : "—",
      source: "Umami",
      info: "Unique visitors to /bio according to Umami. Counted separately from bio sessions.",
      unavailable: !umamiReady,
    },
    {
      label: "Page views",
      value: umamiReady ? formatCount(umami.stats!.pageviews) : "—",
      source: "Umami",
      info: "Total /bio page views according to Umami.",
      unavailable: !umamiReady,
    },
    {
      label: "Bio sessions",
      value: formatCount(kpis.sessions),
      source: "Supabase",
      info: "Anonymous sessions that sent at least one bio event. A session ends after 30 minutes of inactivity.",
    },
    {
      label: "Engaged sessions",
      value: formatCount(kpis.engaged_sessions),
      source: "Supabase",
      info: "Sessions that viewed a product, clicked out, saw two or more sections, lasted 10 seconds, or scrolled 50%.",
    },
    {
      label: "Outbound clicks",
      value: formatCount(kpis.outbound_clicks),
      source: "Supabase",
      info: "Clicks toward a marketplace or another channel. These are not purchases and not revenue.",
    },
    {
      label: "Outbound CTR",
      value: formatPercent(kpis.outbound_ctr),
      source: "Supabase",
      info: "Share of bio sessions that produced at least one outbound click.",
    },
    {
      label: "Avg. engagement time",
      value: formatDuration(kpis.avg_engagement_ms),
      source: "Supabase",
      info: "Average recorded time up to the last event in a session.",
    },
    {
      label: "Returning share",
      value: formatPercent(kpis.returning_share),
      source: "Supabase",
      info: "Share of sessions from a device that has opened the bio page before.",
    },
  ]

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bio Analytics</h1>
          <p className="text-sm text-muted-foreground">
            {range.startDate} – {range.endDate} · timezone {range.timezone}
          </p>
        </div>
        <a
          href={`/api/bio-analytics/export?${query}`}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          Download CSV
        </a>
      </header>

      <SourceBanner status={umami.status} errors={umami.errors} />
      {supabase.status !== "healthy" && supabase.errors.length > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{supabase.errors.join(" ")}</p>
        </div>
      ) : null}

      <BioAnalyticsFiltersBar filters={filters} options={supabase.options} />

      <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center text-xs font-medium text-muted-foreground">
                  {card.label}
                  <InfoTooltip content={card.info} />
                </p>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {card.source}
                </Badge>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{card.value}</p>
              {card.unavailable ? (
                <p className="mt-1 text-xs text-muted-foreground">Source unavailable</p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </section>

      <TrafficChart points={trafficPoints} />

      <div className="grid gap-4 lg:grid-cols-2">
        <FunnelChart counts={supabase.summary.funnel} />
        <ProductPerformanceChart rows={supabase.summary.products} />
        <MarketplaceChart rows={supabase.summary.marketplaces} />
        <SectionReachChart rows={supabase.summary.sections} />
        <ScrollDepthChart rows={supabase.summary.scroll_depth} />
        <BreakdownChart
          title="Referrers"
          description="Where visitors to /bio came from."
          source="Umami"
          labelHeader="Referrer"
          rows={umami.metrics.referrer}
        />
      </div>

      <EngagementHeatmap cells={supabase.summary.heatmap} />

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownChart
          title="Devices"
          description="Device categories according to Umami."
          source="Umami"
          labelHeader="Device"
          rows={umami.metrics.device}
        />
        <BreakdownChart
          title="Browsers"
          description="Browsers visitors used."
          source="Umami"
          labelHeader="Browser"
          rows={umami.metrics.browser}
        />
        <BreakdownChart
          title="Operating systems"
          description="Visitor operating systems."
          source="Umami"
          labelHeader="Operating system"
          rows={umami.metrics.os}
        />
        <BreakdownChart
          title="Countries"
          description="Visitor countries according to Umami."
          source="Umami"
          labelHeader="Country"
          rows={umami.metrics.country}
        />
        <BreakdownChart
          title="Regions"
          description="Visitor regions according to Umami."
          source="Umami"
          labelHeader="Region"
          rows={umami.metrics.region}
        />
      </div>

      <JourneyTable rows={supabase.journeys} />

      <EventTable
        events={supabase.events}
        isUnavailable={supabase.status === "unavailable"}
        pageHref={(page) =>
          `/bio-analytics?${serializeBioFilters({ ...filters, eventPage: page })}`
        }
      />
    </div>
  )
}
