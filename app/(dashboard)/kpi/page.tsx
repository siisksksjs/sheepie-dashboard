import { getCurrentMonth, getKpiWorkspace } from "@/lib/actions/kpi"
import { getListingImageMap } from "@/lib/actions/quick-log"
import { KpiClient } from "./kpi-client"

type SearchParams = Promise<{ month?: string }>

export const metadata = { title: "KPI · Sheepie" }

export default async function KpiPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const selectedMonth = params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month)
    ? params.month
    : await getCurrentMonth()
  const [workspace, images] = await Promise.all([getKpiWorkspace(selectedMonth), getListingImageMap()])

  return <KpiClient key={selectedMonth} initialWorkspace={workspace} images={images} />
}
