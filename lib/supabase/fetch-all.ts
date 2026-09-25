// PostgREST caps every response at `max_rows` (1000 on Supabase), silently
// dropping the rest. Aggregates over orders or ledger rows must page through
// the full result instead of trusting a single select.
export const SUPABASE_PAGE_SIZE = 1000

type PageResult<Row> = PromiseLike<{
  data: Row[] | null
  error: { message: string } | null
}>

type RangeableQuery<Row> = {
  range: (from: number, to: number) => PageResult<Row>
}

/**
 * `buildQuery` must return a fresh, deterministically ordered query on every
 * call: range() mutates the builder, and unordered pages can skip or repeat rows.
 */
export async function fetchAllRows<Row>(
  buildQuery: () => RangeableQuery<Row>,
  pageSize = SUPABASE_PAGE_SIZE,
): Promise<{ data: Row[]; error: { message: string } | null }> {
  const rows: Row[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)

    if (error) {
      return { data: rows, error }
    }

    const page = data || []
    rows.push(...page)

    if (page.length < pageSize) {
      return { data: rows, error: null }
    }
  }
}
