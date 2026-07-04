import { getCurrentMonth, getKpiWorkspace } from "@/lib/actions/kpi"
import { KpiClient } from "./kpi-client"

type SearchParams = Promise<{ month?: string }>

export default async function KpiPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const selectedMonth = params.month && /^\d{4}-\d{2}$/.test(params.month)
    ? params.month
    : await getCurrentMonth()
  const workspace = await getKpiWorkspace(selectedMonth)

  return <KpiClient initialWorkspace={workspace} />
}
