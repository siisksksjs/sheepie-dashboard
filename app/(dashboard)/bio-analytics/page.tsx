import type { Metadata } from "next"

import { getBioAnalyticsBundle } from "@/lib/actions/bio-analytics"
import { parseBioFilters, type BioSearchParams } from "@/lib/bio-analytics/filters"

import { BioAnalyticsClient } from "./bio-analytics-client"

export const metadata: Metadata = {
  title: "Bio Analytics",
}

// Filters change per request and the report must never be served from a stale cache.
export const dynamic = "force-dynamic"

export default async function BioAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<BioSearchParams>
}) {
  // Authentication is enforced by the dashboard middleware and route group.
  const filters = parseBioFilters(await searchParams)
  const bundle = await getBioAnalyticsBundle(filters)

  return <BioAnalyticsClient bundle={bundle} />
}
