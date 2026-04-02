import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

describe("ad campaigns workspace contract", () => {
  it("wires the ad campaigns page to the SKU workspace and keeps legacy campaigns secondary", async () => {
    const source = await readFile("app/(dashboard)/ad-campaigns/page.tsx", "utf8")

    expect(source).toContain('from "@/components/ad-campaigns/ads-setup-workspace"')
    expect(source).toContain("getMonthlyAdsReportBundle")
    expect(source).toContain("getSkuAdSetups")
    expect(source).toContain("getMonthlyAdSpendRows")
    expect(source).toContain("getSkuSalesTargets")
    expect(source).toContain("<AdsSetupWorkspace")
    expect(source).toContain("Legacy Campaigns")
    expect(source).toContain("Create Legacy Campaign")
    expect(source).toContain("<Button asChild variant=\"outline\">")
    expect(source).toContain("<Button asChild variant=\"ghost\" size=\"sm\">")
  })

  it("keeps the legacy label maps typed to concrete campaign unions", async () => {
    const source = await readFile("app/(dashboard)/ad-campaigns/page.tsx", "utf8")

    expect(source).toContain("AdPlatform")
    expect(source).toContain("CampaignStatus")
    expect(source).toContain("Record<AdPlatform, string>")
    expect(source).toContain('Record<CampaignStatus, "default" | "success" | "secondary">')
  })

  it("declares month-scoped setup and target filtering in the workspace", async () => {
    const source = await readFile(
      "components/ad-campaigns/ads-setup-workspace.tsx",
      "utf8",
    )

    expect(source).toContain("filterMonthScopedSetups")
    expect(source).toContain("filterMonthScopedTargets")
  })
})
