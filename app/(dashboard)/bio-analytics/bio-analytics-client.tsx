"use client"

import { AlertTriangle, ArrowUpRight, Download, Info } from "lucide-react"

import { useState } from "react"
import { PageHeader, Stat } from "@/components/ui/page"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DESTINATION_LABELS,
  PRODUCT_LABELS
} from "@/components/bio-analytics/presentation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import {
  BreakdownChart,
  EngagementHeatmap,
  ActivityCoverageChart,
  MarketplaceChart,
  ProductPerformanceChart,
  ScrollDepthChart,
  SectionReachChart,
  TrafficChart
} from "@/components/bio-analytics/charts"
import { BioAnalyticsFiltersBar } from "@/components/bio-analytics/filters"
import { EventTable, JourneyTable } from "@/components/bio-analytics/tables"
import {
  formatCount,
  formatPercent
} from "@/components/bio-analytics/presentation"
import { serializeBioFilters } from "@/lib/bio-analytics/filters"
import { formatDuration, mergeTrafficSeries } from "@/lib/bio-analytics/metrics"
import type {
  BioAnalyticsBundle,
  SourceStatus
} from "@/lib/bio-analytics/types"

type KpiCard = {
  label: string
  value: string
  source: "PostHog" | "Supabase"
  info: string
  unavailable?: boolean
}

function SourceBanner({
  status,
  errors
}: {
  status: SourceStatus
  errors: string[]
}) {
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
            ? "Visitor and audience tracking is not connected."
            : "Visitor and audience tracking is temporarily unavailable."}
        </p>
        <p className="text-muted-foreground">
          {isUnconfigured
            ? "Connect the traffic source to see visitors and where they come from. Bio activity is tracked separately below."
            : "Visitor panels cannot load right now. Bio activity is tracked separately below."}
        </p>
        {errors.length > 0 ? (
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Connection details</summary>
            <p className="mt-1">{errors.join("; ")}</p>
          </details>
        ) : null}
      </div>
    </div>
  )
}

export function BioAnalyticsClient({
  bundle,
  initialView = "overview"
}: {
  bundle: BioAnalyticsBundle
  initialView?: string
}) {
  const [view, setView] = useState(initialView)
  const { filters, range, supabase, traffic } = bundle
  const { kpis } = supabase.summary
  const trafficReady = traffic.status === "healthy" && traffic.stats !== null
  const trafficPoints = mergeTrafficSeries(
    traffic.series,
    supabase.summary.time_series
  )
  const query = serializeBioFilters(filters)
  const behaviorReady = supabase.status === "healthy"
  const leadingProduct = [...supabase.summary.products].sort(
    (a, b) => b.clicks - a.clicks
  )[0]
  const leadingDestination = [...supabase.summary.marketplaces].sort(
    (a, b) => b.clicks - a.clicks
  )[0]
  const behaviorValue = (value: string) => (behaviorReady ? value : "—")

  const cards: KpiCard[] = [
    {
      label: "Visitors",
      value: trafficReady ? formatCount(traffic.stats!.visitors) : "—",
      source: "PostHog",
      info: "Unique visitors to /bio according to PostHog. Counted separately from bio sessions.",
      unavailable: !trafficReady
    },
    {
      label: "Page views",
      value: trafficReady ? formatCount(traffic.stats!.pageviews) : "—",
      source: "PostHog",
      info: "Total /bio page views according to PostHog.",
      unavailable: !trafficReady
    },
    {
      label: "Bio sessions",
      value: formatCount(kpis.sessions),
      source: "Supabase",
      info: "Anonymous sessions that sent at least one bio event. A session ends after 30 minutes of inactivity."
    },
    {
      label: "Engaged sessions",
      value: formatCount(kpis.engaged_sessions),
      source: "Supabase",
      info: "Sessions that viewed a product, clicked out, saw two or more sections, lasted 10 seconds, or scrolled 50%."
    },
    {
      label: "Outbound clicks",
      value: formatCount(kpis.outbound_clicks),
      source: "Supabase",
      info: "Clicks toward a marketplace or another channel. These are not purchases and not revenue."
    },
    {
      label: "Outbound CTR",
      value: formatPercent(kpis.outbound_ctr),
      source: "Supabase",
      info: "Share of bio sessions that produced at least one outbound click."
    },
    {
      label: "Avg. engagement time",
      value: formatDuration(kpis.avg_engagement_ms),
      source: "Supabase",
      info: "Average recorded time up to the last event in a session."
    },
    {
      label: "Returning share",
      value: formatPercent(kpis.returning_share),
      source: "Supabase",
      info: "Share of sessions from a device that has opened the bio page before."
    }
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bio analytics"
        description={`From opening your bio page to choosing a product and clicking through. ${range.startDate} – ${range.endDate} · WIB`}
        actions={
          <a
            href={`/api/bio-analytics/export?${query}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/15 bg-white/65 px-4 text-sm font-semibold hover:bg-white"
          >
            <Download className="size-4" /> Export activity
          </a>
        }
      />

      <SourceBanner status={traffic.status} errors={traffic.errors} />
      {supabase.status !== "healthy" && supabase.errors.length > 0 ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          role="status"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{supabase.errors.join(" ")}</p>
        </div>
      ) : null}

      <BioAnalyticsFiltersBar filters={filters} options={supabase.options} />

      <section
        className="glass overflow-hidden rounded-[26px]"
        aria-label="Bio engagement summary"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/10 px-5 py-4 sm:px-6">
          <h2 className="text-xl">From visit to click</h2>
          <Badge variant="outline">Bio activity · Supabase</Badge>
        </div>
        <div className="grid gap-6 p-5 sm:grid-cols-3 sm:p-6">
          {[
            {
              label: "01 / Bio sessions",
              value: behaviorValue(formatCount(kpis.sessions)),
              note: "Sessions with recorded activity"
            },
            {
              label: "02 / Engaged sessions",
              value: behaviorValue(formatCount(kpis.engaged_sessions)),
              note:
                behaviorReady && kpis.sessions > 0
                  ? `${formatPercent((kpis.engaged_sessions / kpis.sessions) * 100)} of recorded sessions`
                  : "People who explored your page"
            },
            {
              label: "03 / Outbound clicks",
              value: behaviorValue(formatCount(kpis.outbound_clicks)),
              note: behaviorReady
                ? `${formatPercent(kpis.outbound_ctr)} of sessions clicked out`
                : "Activity source unavailable"
            }
          ].map((item) => (
            <div key={item.label}>
              <p className="workspace-eyebrow">{item.label}</p>
              <p className="num mt-3 font-display text-4xl font-semibold">
                {item.value}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{item.note}</p>
            </div>
          ))}
        </div>
        <p className="border-t border-primary/10 px-5 py-3 text-xs text-muted-foreground sm:px-6">
          Outbound clicks are not purchases and not revenue. Visitor counts and
          recorded sessions use different sources.
        </p>
      </section>
      <section
        aria-label="Key metrics"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {cards
          .filter((card) =>
            [
              "Visitors",
              "Page views",
              "Avg. engagement time",
              "Returning share"
            ].includes(card.label)
          )
          .map((card) => (
            <Card key={card.label}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center text-xs font-semibold text-muted-foreground">
                    {card.label}
                    <InfoTooltip content={card.info} />
                  </p>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {card.source}
                  </Badge>
                </div>
                <p className="num mt-3 font-display text-[26px] font-semibold">
                  {card.source === "Supabase"
                    ? behaviorValue(card.value)
                    : card.value}
                </p>
                {card.unavailable ||
                (card.source === "Supabase" && !behaviorReady) ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Source unavailable
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
      </section>
      <Tabs value={view} onValueChange={setView} className="space-y-5">
        <TabsList className="h-auto w-full sm:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="audience">Audience</TabsTrigger>
          <TabsTrigger value="events">Journeys & events</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-5">
          <section className="workspace-summary grid gap-3 sm:grid-cols-2">
            <Stat
              label="Most clicked product"
              value={
                behaviorReady && leadingProduct?.clicks
                  ? PRODUCT_LABELS[leadingProduct.product_slug]
                  : "—"
              }
              note={
                behaviorReady && leadingProduct?.clicks
                  ? `${formatCount(leadingProduct.clicks)} outbound clicks · ${formatPercent(leadingProduct.ctr)} product CTR`
                  : "No product clicks recorded in this range"
              }
            />
            <Stat
              label="Leading destination"
              value={
                behaviorReady && leadingDestination?.clicks ? (
                  <span className="inline-flex items-center gap-2">
                    {DESTINATION_LABELS[leadingDestination.destination]}
                    <ArrowUpRight className="size-5" />
                  </span>
                ) : (
                  "—"
                )
              }
              note={
                behaviorReady && leadingDestination?.clicks
                  ? `${formatCount(leadingDestination.clicks)} outbound clicks`
                  : "No outbound clicks recorded in this range"
              }
            />
          </section>
          <TrafficChart points={trafficPoints} showVisitors={trafficReady} />

          <div className="grid gap-4 lg:grid-cols-2">
            <ActivityCoverageChart
              counts={supabase.summary.funnel}
              totalSessions={kpis.sessions}
            />
            <ProductPerformanceChart rows={supabase.summary.products} />
            <MarketplaceChart rows={supabase.summary.marketplaces} />
            <SectionReachChart rows={supabase.summary.sections} />
            <ScrollDepthChart rows={supabase.summary.scroll_depth} />
          </div>
        </TabsContent>
        <TabsContent value="audience" className="space-y-5">
          <p className="px-1 text-sm text-muted-foreground">
            Understand where your visitors come from and what they use to
            browse.
          </p>
          {!trafficReady && (
            <div className="glass rounded-[24px] p-6">
              <h2 className="text-xl">Audience data is unavailable</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                These breakdowns will appear when the traffic source is
                connected and sending data.
              </p>
            </div>
          )}

          {trafficReady && (
            <div className="grid gap-4 lg:grid-cols-2">
              <BreakdownChart
                title="Referrers"
                description="Where visitors to /bio came from."
                source="PostHog"
                labelHeader="Referrer"
                rows={traffic.breakdowns.referrer}
              />
              <BreakdownChart
                title="Devices"
                description="Device categories according to PostHog."
                source="PostHog"
                labelHeader="Device"
                rows={traffic.breakdowns.device}
              />
              <BreakdownChart
                title="Browsers"
                description="Browsers visitors used."
                source="PostHog"
                labelHeader="Browser"
                rows={traffic.breakdowns.browser}
              />
              <BreakdownChart
                title="Operating systems"
                description="Visitor operating systems."
                source="PostHog"
                labelHeader="Operating system"
                rows={traffic.breakdowns.os}
              />
              <BreakdownChart
                title="Countries"
                description="Visitor countries according to PostHog."
                source="PostHog"
                labelHeader="Country"
                rows={traffic.breakdowns.country}
              />
              <BreakdownChart
                title="Regions"
                description="Visitor regions according to PostHog."
                source="PostHog"
                labelHeader="Region"
                rows={traffic.breakdowns.region}
              />
            </div>
          )}
        </TabsContent>
        <TabsContent value="events" className="space-y-5">
          <p className="px-1 text-sm text-muted-foreground">
            Explore common journeys, active hours, and individual events.
          </p>
          <EngagementHeatmap cells={supabase.summary.heatmap} />
          <JourneyTable rows={supabase.journeys} />

          <EventTable
            events={supabase.events}
            isUnavailable={supabase.status === "unavailable"}
            pageHref={(page) =>
              `/bio-analytics?${serializeBioFilters({ ...filters, eventPage: page })}&view=events`
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
