import type { NextRequest } from "next/server"

import { BIO_EVENT_COLUMNS } from "@/lib/actions/bio-analytics"
import { exportFileName, toBioEventsCsv } from "@/lib/bio-analytics/csv"
import { parseBioFilters, type BioSearchParams } from "@/lib/bio-analytics/filters"
import { parseRange } from "@/lib/bio-analytics/range"
import type { BioEvent } from "@/lib/bio-analytics/types"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_EXPORT_ROWS = 100_000
const CHUNK_SIZE = 1_000
// Excel needs a BOM to read UTF-8 CSV correctly.
const UTF8_BOM = "﻿"

function searchParamsToRecord(request: NextRequest): BioSearchParams {
  const record: BioSearchParams = {}
  for (const key of new Set(request.nextUrl.searchParams.keys())) {
    const values = request.nextUrl.searchParams.getAll(key)
    record[key] = values.length > 1 ? values : values[0]
  }
  return record
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response("Unauthorized", { status: 401, headers: { "cache-control": "no-store" } })
  }

  const filters = parseBioFilters(searchParamsToRecord(request))
  const range = parseRange({
    preset: filters.preset,
    startDate: filters.startDate,
    endDate: filters.endDate,
  })
  const startAt = range.start.toISOString()
  const endAt = range.end.toISOString()

  const columnFilters: Array<[string, string[]]> = [
    ["product_slug", filters.productSlugs],
    ["destination", filters.destinations],
    ["utm_source", filters.utmSources],
    ["utm_campaign", filters.campaigns],
    ["screen_category", filters.screenCategories],
    ["referrer_category", filters.referrerCategories],
  ]

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(UTF8_BOM + toBioEventsCsv([]) + "\r\n"))

      try {
        for (let offset = 0; offset < MAX_EXPORT_ROWS; offset += CHUNK_SIZE) {
          let query = supabase
            .from("bio_events")
            .select(BIO_EVENT_COLUMNS)
            .gte("occurred_at", startAt)
            .lt("occurred_at", endAt)

          for (const [column, values] of columnFilters) {
            if (values.length > 0) query = query.in(column, values)
          }

          const { data, error } = await query
            .order("occurred_at", { ascending: false })
            .order("sequence_no", { ascending: false })
            .range(offset, Math.min(offset + CHUNK_SIZE, MAX_EXPORT_ROWS) - 1)

          if (error) throw new Error("export query failed")

          const rows = (data ?? []) as unknown as BioEvent[]
          if (rows.length === 0) break

          controller.enqueue(encoder.encode(toBioEventsCsv(rows).split("\r\n").slice(1).join("\r\n") + "\r\n"))
          if (rows.length < CHUNK_SIZE) break
        }
      } catch {
        // The consumer receives a truncated file rather than a broken download.
        controller.enqueue(encoder.encode('"Ekspor terhenti sebelum selesai."\r\n'))
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFileName()}"`,
      "cache-control": "no-store",
    },
  })
}
