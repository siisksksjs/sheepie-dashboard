import { describe, expect, it } from "vitest"

import { buildFunnelSteps, mergeTrafficSeries, percent, summarizeScrollDepth } from "./metrics"

describe("percent", () => {
  it("rounds to one decimal", () => {
    expect(percent(1, 4)).toBe(25)
    expect(percent(1, 3)).toBe(33.3)
    expect(percent(2, 3)).toBe(66.7)
  })

  it("never returns NaN or Infinity", () => {
    expect(percent(0, 0)).toBe(0)
    expect(percent(5, 0)).toBe(0)
    expect(percent(Number.NaN, 10)).toBe(0)
    expect(percent(1, Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe("mergeTrafficSeries", () => {
  it("aligns Umami and Supabase points on their timestamps", () => {
    const merged = mergeTrafficSeries(
      {
        pageviews: [{ x: "2026-08-16", y: 40 }],
        sessions: [
          { x: "2026-08-16", y: 12 },
          { x: "2026-08-17", y: 9 },
        ],
      },
      [
        { day: "2026-08-17", sessions: 7, outbound_clicks: 3 },
        { day: "2026-08-15", sessions: 2, outbound_clicks: 1 },
      ],
    )

    expect(merged).toEqual([
      { timestamp: "2026-08-15", visitors: 0, sessions: 2, clicks: 1 },
      { timestamp: "2026-08-16", visitors: 12, sessions: 0, clicks: 0 },
      { timestamp: "2026-08-17", visitors: 9, sessions: 7, clicks: 3 },
    ])
  })

  it("normalizes Umami space-separated timestamps to ISO dates", () => {
    const merged = mergeTrafficSeries(
      { pageviews: [], sessions: [{ x: "2026-08-17 00:00:00", y: 4 }] },
      [{ day: "2026-08-17", sessions: 1, outbound_clicks: 0 }],
    )

    expect(merged).toEqual([{ timestamp: "2026-08-17", visitors: 4, sessions: 1, clicks: 0 }])
  })

  it("survives a missing Umami source", () => {
    expect(mergeTrafficSeries(null, [{ day: "2026-08-17", sessions: 3, outbound_clicks: 2 }])).toEqual([
      { timestamp: "2026-08-17", visitors: 0, sessions: 3, clicks: 2 },
    ])
    expect(mergeTrafficSeries(null, [])).toEqual([])
  })
})

describe("buildFunnelSteps", () => {
  it("reports conversion from the first and previous steps", () => {
    const steps = buildFunnelSteps({
      page_view: 200,
      section_view: 150,
      product_view: 100,
      outbound_click: 25,
    })

    expect(steps.map((step) => step.key)).toEqual([
      "page_view",
      "section_view",
      "product_view",
      "outbound_click",
    ])
    expect(steps[1]).toMatchObject({ sessions: 150, conversionFromFirst: 75, conversionFromPrevious: 75 })
    expect(steps[3]).toMatchObject({ sessions: 25, conversionFromFirst: 12.5, conversionFromPrevious: 25 })
  })

  it("returns zeroed conversion when nobody entered the funnel", () => {
    const steps = buildFunnelSteps({
      page_view: 0,
      section_view: 0,
      product_view: 0,
      outbound_click: 0,
    })

    expect(steps.every((step) => step.conversionFromFirst === 0)).toBe(true)
  })
})

describe("summarizeScrollDepth", () => {
  it("fills every milestone and shares against the deepest reach", () => {
    expect(
      summarizeScrollDepth([
        { scroll_depth: 25, sessions: 100 },
        { scroll_depth: 100, sessions: 10 },
      ]),
    ).toEqual([
      { depth: 25, sessions: 100, share: 100 },
      { depth: 50, sessions: 0, share: 0 },
      { depth: 75, sessions: 0, share: 0 },
      { depth: 100, sessions: 10, share: 10 },
    ])
  })
})
