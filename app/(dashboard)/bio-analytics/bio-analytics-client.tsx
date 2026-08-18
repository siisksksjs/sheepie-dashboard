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
            ? "Data lalu lintas Umami belum dikonfigurasi."
            : "Data lalu lintas Umami sedang tidak tersedia."}
        </p>
        <p className="text-muted-foreground">
          {isUnconfigured
            ? "Setel UMAMI_API_KEY dan UMAMI_WEBSITE_ID untuk menampilkan pengunjung dan rincian audiens. Data perilaku Supabase di bawah tetap lengkap."
            : "Bagian pengunjung dan audiens mungkin kosong. Data perilaku Supabase di bawah tetap lengkap."}
        </p>
        {errors.length > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">Detail: {errors.join("; ")}</p>
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
      label: "Pengunjung",
      value: umamiReady ? formatCount(umami.stats!.visitors) : "—",
      source: "Umami",
      info: "Pengunjung unik halaman /bio menurut Umami. Dihitung terpisah dari sesi bio.",
      unavailable: !umamiReady,
    },
    {
      label: "Kunjungan halaman",
      value: umamiReady ? formatCount(umami.stats!.pageviews) : "—",
      source: "Umami",
      info: "Total tampilan halaman /bio menurut Umami.",
      unavailable: !umamiReady,
    },
    {
      label: "Sesi bio",
      value: formatCount(kpis.sessions),
      source: "Supabase",
      info: "Sesi anonim yang mengirim setidaknya satu peristiwa bio. Sesi berakhir setelah 30 menit tanpa aktivitas.",
    },
    {
      label: "Sesi terlibat",
      value: formatCount(kpis.engaged_sessions),
      source: "Supabase",
      info: "Sesi yang melihat produk, mengklik, melihat dua bagian atau lebih, bertahan 10 detik, atau menggulir 50%.",
    },
    {
      label: "Klik keluar",
      value: formatCount(kpis.outbound_clicks),
      source: "Supabase",
      info: "Klik menuju marketplace atau kanal lain. Ini bukan pembelian dan bukan pendapatan.",
    },
    {
      label: "CTR keluar",
      value: formatPercent(kpis.outbound_ctr),
      source: "Supabase",
      info: "Bagian sesi bio yang menghasilkan setidaknya satu klik keluar.",
    },
    {
      label: "Rata-rata keterlibatan",
      value: formatDuration(kpis.avg_engagement_ms),
      source: "Supabase",
      info: "Rata-rata waktu tercatat sampai peristiwa terakhir dalam sesi.",
    },
    {
      label: "Pengunjung kembali",
      value: formatPercent(kpis.returning_share),
      source: "Supabase",
      info: "Bagian sesi dari perangkat yang pernah membuka halaman bio sebelumnya.",
    },
  ]

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bio Analytics</h1>
          <p className="text-sm text-muted-foreground">
            {range.startDate} – {range.endDate} · zona waktu {range.timezone}
          </p>
        </div>
        <a
          href={`/api/bio-analytics/export?${query}`}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          Unduh CSV
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

      <section aria-label="Ringkasan metrik" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                <p className="mt-1 text-xs text-muted-foreground">Sumber tidak tersedia</p>
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
          title="Rujukan"
          description="Dari mana pengunjung halaman /bio datang."
          source="Umami"
          labelHeader="Rujukan"
          rows={umami.metrics.referrer}
        />
      </div>

      <EngagementHeatmap cells={supabase.summary.heatmap} />

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownChart
          title="Perangkat"
          description="Kategori perangkat menurut Umami."
          source="Umami"
          labelHeader="Perangkat"
          rows={umami.metrics.device}
        />
        <BreakdownChart
          title="Peramban"
          description="Peramban yang digunakan pengunjung."
          source="Umami"
          labelHeader="Peramban"
          rows={umami.metrics.browser}
        />
        <BreakdownChart
          title="Sistem operasi"
          description="Sistem operasi pengunjung."
          source="Umami"
          labelHeader="Sistem operasi"
          rows={umami.metrics.os}
        />
        <BreakdownChart
          title="Negara"
          description="Negara asal pengunjung menurut Umami."
          source="Umami"
          labelHeader="Negara"
          rows={umami.metrics.country}
        />
        <BreakdownChart
          title="Wilayah"
          description="Wilayah asal pengunjung menurut Umami."
          source="Umami"
          labelHeader="Wilayah"
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
