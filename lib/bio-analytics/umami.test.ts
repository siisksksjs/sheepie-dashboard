import { describe, expect, it, vi } from "vitest"

import { parseRange } from "./range"
import { DEFAULT_UMAMI_BASE_URL, loadUmamiBundle } from "./umami"
import type { BioAnalyticsFilters } from "./types"

const RANGE = parseRange({ preset: "custom", startDate: "2026-08-11", endDate: "2026-08-17" })

const FILTERS: BioAnalyticsFilters = {
  preset: "custom",
  startDate: "2026-08-11",
  endDate: "2026-08-17",
  productSlugs: [],
  destinations: [],
  utmSources: [],
  campaigns: [],
  screenCategories: [],
  referrerCategories: [],
  eventPage: 1,
}

function payloadFor(url: string): unknown {
  if (url.includes("/stats")) {
    return { pageviews: 120, visitors: 80, visits: 95, bounces: 30, totaltime: 4200 }
  }
  if (url.includes("/pageviews")) {
    return { pageviews: [{ x: "2026-08-17", y: 12 }], sessions: [{ x: "2026-08-17", y: 8 }] }
  }
  if (url.includes("/sessions/weekly")) {
    return [[1, 2], [3, 4]]
  }
  return [{ x: "instagram.com", y: 40 }]
}

function recordingFetch(overrides: Record<string, () => Response> = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
    calls.push({ url: input, init })
    for (const [fragment, respond] of Object.entries(overrides)) {
      if (input.includes(fragment)) return respond()
    }
    return new Response(JSON.stringify(payloadFor(input)), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  })
  return { calls, fetcher }
}

const CONFIG = { apiKey: "secret-key", websiteId: "website-1" }

describe("loadUmamiBundle", () => {
  it("reports unconfigured when either secret is missing", async () => {
    const { fetcher } = recordingFetch()

    expect(
      await loadUmamiBundle(RANGE, FILTERS, { fetch: fetcher, apiKey: "", websiteId: "website-1" }),
    ).toMatchObject({ status: "unconfigured" })
    expect(
      await loadUmamiBundle(RANGE, FILTERS, { fetch: fetcher, apiKey: "key", websiteId: "" }),
    ).toMatchObject({ status: "unconfigured" })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("authenticates with x-umami-api-key and never a bearer token", async () => {
    const { calls, fetcher } = recordingFetch()

    await loadUmamiBundle(RANGE, FILTERS, { fetch: fetcher, ...CONFIG })

    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      const headers = new Headers(call.init?.headers)
      expect(headers.get("x-umami-api-key")).toBe("secret-key")
      expect(headers.has("authorization")).toBe(false)
      expect(headers.get("accept")).toBe("application/json")
    }
  })

  it("requests every panel the dashboard renders", async () => {
    const { calls, fetcher } = recordingFetch()

    await loadUmamiBundle(RANGE, FILTERS, { fetch: fetcher, ...CONFIG })

    const urls = calls.map((call) => call.url)
    expect(urls.some((url) => url.startsWith(`${DEFAULT_UMAMI_BASE_URL}/websites/website-1/stats`))).toBe(true)
    expect(urls.some((url) => url.includes("/pageviews"))).toBe(true)
    expect(urls.some((url) => url.includes("/sessions/weekly"))).toBe(true)
    for (const type of ["referrer", "country", "region", "device", "browser", "os"]) {
      expect(urls.some((url) => url.includes(`type=${type}`))).toBe(true)
    }
  })

  it("scopes every request to the bio path, the range, and the reporting timezone", async () => {
    const { calls, fetcher } = recordingFetch()

    await loadUmamiBundle(RANGE, FILTERS, { fetch: fetcher, ...CONFIG })

    for (const call of calls) {
      const url = new URL(call.url)
      expect(url.searchParams.get("path")).toBe("/bio")
      expect(url.searchParams.get("startAt")).toBe(String(RANGE.start.getTime()))
      expect(url.searchParams.get("endAt")).toBe(String(RANGE.end.getTime() - 1))
      expect(url.searchParams.get("timezone")).toBe("Asia/Jakarta")
    }

    const pageviews = calls.find((call) => call.url.includes("/pageviews"))!
    expect(new URL(pageviews.url).searchParams.get("unit")).toBe("hour")
  })

  it("passes a single selected UTM filter and omits ambiguous multi-selects", async () => {
    const { calls, fetcher } = recordingFetch()

    await loadUmamiBundle(
      RANGE,
      { ...FILTERS, utmSources: ["instagram"], campaigns: ["launch", "retarget"] },
      { fetch: fetcher, ...CONFIG },
    )

    for (const call of calls) {
      const url = new URL(call.url)
      expect(url.searchParams.get("utm_source")).toBe("instagram")
      expect(url.searchParams.has("utm_campaign")).toBe(false)
    }
  })

  it("honours a configured base URL", async () => {
    const { calls, fetcher } = recordingFetch()

    await loadUmamiBundle(RANGE, FILTERS, {
      fetch: fetcher,
      ...CONFIG,
      baseUrl: "https://analytics.internal/api",
    })

    expect(calls.every((call) => call.url.startsWith("https://analytics.internal/api/"))).toBe(true)
  })

  it("degrades to unavailable when one endpoint fails, keeping the rest", async () => {
    const { fetcher } = recordingFetch({
      "/sessions/weekly": () => new Response("upstream boom", { status: 502 }),
    })

    const bundle = await loadUmamiBundle(RANGE, FILTERS, { fetch: fetcher, ...CONFIG })

    expect(bundle.status).toBe("unavailable")
    expect(bundle.weekly).toBeNull()
    expect(bundle.stats).toMatchObject({ visitors: 80 })
    expect(bundle.metrics.referrer).toEqual([{ x: "instagram.com", y: 40 }])
    expect(bundle.errors.length).toBeGreaterThan(0)
  })

  it("never throws when the network rejects outright", async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error("dns failure")))

    const bundle = await loadUmamiBundle(RANGE, FILTERS, { fetch: fetcher, ...CONFIG })

    expect(bundle.status).toBe("unavailable")
    expect(bundle.stats).toBeNull()
    expect(bundle.series).toBeNull()
    expect(bundle.metrics.referrer).toEqual([])
  })

  it("treats a malformed payload as a failed endpoint rather than valid data", async () => {
    const { fetcher } = recordingFetch({
      "/stats": () => new Response("not json", { status: 200 }),
    })

    const bundle = await loadUmamiBundle(RANGE, FILTERS, { fetch: fetcher, ...CONFIG })

    expect(bundle.status).toBe("unavailable")
    expect(bundle.stats).toBeNull()
    expect(bundle.series).not.toBeNull()
  })
})
