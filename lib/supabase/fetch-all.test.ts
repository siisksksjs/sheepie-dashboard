import { describe, expect, it } from "vitest"
import { fetchAllRows } from "@/lib/supabase/fetch-all"

function fakeTable(total: number, maxRows = 1000) {
  const rows = Array.from({ length: total }, (_, index) => ({ id: index }))
  const ranges: Array<[number, number]> = []

  return {
    ranges,
    build: () => ({
      range: async (from: number, to: number) => {
        ranges.push([from, to])
        return { data: rows.slice(from, Math.min(to + 1, from + maxRows)), error: null }
      },
    }),
  }
}

describe("fetchAllRows", () => {
  it("reads past the 1000-row PostgREST cap", async () => {
    const table = fakeTable(2345)
    const result = await fetchAllRows(table.build)

    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(2345)
    expect(result.data.at(-1)).toEqual({ id: 2344 })
    expect(table.ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it("stops after a single short page", async () => {
    const table = fakeTable(12)
    const result = await fetchAllRows(table.build)

    expect(result.data).toHaveLength(12)
    expect(table.ranges).toHaveLength(1)
  })

  it("returns the error from a failed page", async () => {
    const result = await fetchAllRows(() => ({
      range: async () => ({ data: null, error: { message: "boom" } }),
    }))

    expect(result).toEqual({ data: [], error: { message: "boom" } })
  })
})
