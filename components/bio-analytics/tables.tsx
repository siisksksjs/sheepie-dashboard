"use client"

import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDuration } from "@/lib/bio-analytics/metrics"
import type { BioEventPage, BioJourneyRow } from "@/lib/bio-analytics/types"
import {
  DESTINATION_LABELS,
  EVENT_LABELS,
  PRODUCT_LABELS,
  SECTION_LABELS,
  formatCount,
  formatPercent,
  labelFor,
  shortenId,
} from "./presentation"

const JAKARTA_TIME = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  dateStyle: "short",
  timeStyle: "medium",
})

function EmptyState({ message }: { message: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{message}</p>
}

/** Renders `bio_outbound_click:cervicloud:shopee` as readable Indonesian steps. */
function describeStep(step: string): string {
  const [eventName, ...rest] = step.split(":")
  const detail = rest
    .map((part) => PRODUCT_LABELS[part as keyof typeof PRODUCT_LABELS] ?? DESTINATION_LABELS[part as keyof typeof DESTINATION_LABELS] ?? part)
    .join(" · ")
  const label = labelFor(EVENT_LABELS, eventName)
  return detail ? `${label} (${detail})` : label
}

export function JourneyTable({ rows }: { rows: BioJourneyRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Urutan perjalanan sesi</CardTitle>
            <CardDescription>Rangkaian peristiwa paling umum dalam satu sesi.</CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0">
            Sumber: Supabase
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState message="Belum ada perjalanan sesi pada rentang dan filter ini." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Urutan peristiwa</TableHead>
                  <TableHead className="text-right">Sesi</TableHead>
                  <TableHead className="text-right">Bagian</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.path}>
                    <TableCell className="max-w-xl">
                      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs">
                        {row.path.split(" > ").map((step, index) => (
                          <li key={`${step}-${index}`} className="flex items-center gap-1">
                            {index > 0 ? <span className="text-muted-foreground">→</span> : null}
                            <span className="rounded bg-muted px-1.5 py-0.5">{describeStep(step)}</span>
                          </li>
                        ))}
                      </ol>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(row.sessions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPercent(row.share)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function EventTable({
  events,
  isUnavailable,
  pageHref,
}: {
  events: BioEventPage
  isUnavailable: boolean
  pageHref: (page: number) => string
}) {
  const lastPage = Math.max(1, Math.ceil(events.total / events.pageSize))
  const firstRow = events.total === 0 ? 0 : (events.page - 1) * events.pageSize + 1
  const lastRow = Math.min(events.total, events.page * events.pageSize)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Detail peristiwa</CardTitle>
            <CardDescription>
              Peristiwa anonim terbaru lebih dulu. Tidak ada nama, email, atau alamat IP.
            </CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0">
            Sumber: Supabase
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isUnavailable ? (
          <EmptyState message="Sumber data peristiwa sedang tidak tersedia. Coba muat ulang sebentar lagi." />
        ) : events.rows.length === 0 ? (
          <EmptyState message="Tidak ada peristiwa yang cocok dengan rentang dan filter ini." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu (Jakarta)</TableHead>
                    <TableHead>Sesi</TableHead>
                    <TableHead>Peristiwa</TableHead>
                    <TableHead>Produk</TableHead>
                    <TableHead>Tujuan</TableHead>
                    <TableHead>Bagian / CTA</TableHead>
                    <TableHead>Sumber / Kampanye</TableHead>
                    <TableHead className="text-right">Durasi</TableHead>
                    <TableHead>Perangkat</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.rows.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {JAKARTA_TIME.format(new Date(event.occurred_at))}
                      </TableCell>
                      <TableCell className="font-mono text-xs" title="ID sesi anonim">
                        {shortenId(event.session_id)}
                      </TableCell>
                      <TableCell>{labelFor(EVENT_LABELS, event.event_name)}</TableCell>
                      <TableCell>{event.product_slug ? labelFor(PRODUCT_LABELS, event.product_slug) : "—"}</TableCell>
                      <TableCell>{event.destination ? labelFor(DESTINATION_LABELS, event.destination) : "—"}</TableCell>
                      <TableCell className="text-xs">
                        <div>{event.section_id ? labelFor(SECTION_LABELS, event.section_id) : "—"}</div>
                        {event.cta_id ? (
                          <div className="text-muted-foreground">
                            {event.cta_id}
                            {event.cta_position ? ` · ${event.cta_position}` : ""}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{event.utm_source ?? event.referrer_category ?? "—"}</div>
                        {event.utm_campaign ? (
                          <div className="text-muted-foreground">{event.utm_campaign}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatDuration(event.elapsed_ms)}</TableCell>
                      <TableCell className="text-xs">
                        <div>{event.screen_category ?? "—"}</div>
                        {event.language ? <div className="text-muted-foreground">{event.language}</div> : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={event.is_returning ? "secondary" : "outline"}>
                          {event.is_returning ? "Kembali" : "Baru"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <nav
              className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
              aria-label="Navigasi halaman peristiwa"
            >
              <p className="text-muted-foreground tabular-nums">
                {formatCount(firstRow)}–{formatCount(lastRow)} dari {formatCount(events.total)} peristiwa
              </p>
              <div className="flex items-center gap-2">
                {events.page > 1 ? (
                  <Link
                    href={pageHref(events.page - 1)}
                    className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 hover:bg-accent"
                    scroll={false}
                  >
                    <ChevronLeft className="h-4 w-4" /> Sebelumnya
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-muted-foreground opacity-50">
                    <ChevronLeft className="h-4 w-4" /> Sebelumnya
                  </span>
                )}
                <span className="tabular-nums text-muted-foreground">
                  Halaman {events.page} dari {lastPage}
                </span>
                {events.page < lastPage ? (
                  <Link
                    href={pageHref(events.page + 1)}
                    className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 hover:bg-accent"
                    scroll={false}
                  >
                    Berikutnya <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-muted-foreground opacity-50">
                    Berikutnya <ChevronRight className="h-4 w-4" />
                  </span>
                )}
              </div>
            </nav>
          </>
        )}
      </CardContent>
    </Card>
  )
}
