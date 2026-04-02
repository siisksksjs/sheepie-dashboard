import Link from "next/link"
import { Plus, TrendingUp } from "lucide-react"

import { AdsSetupWorkspace } from "@/components/ad-campaigns/ads-setup-workspace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getAllCampaignsMetrics,
  getMonthlyAdsReportBundle,
  getMonthlyAdSpendRows,
  getSkuAdSetups,
  getSkuSalesTargets,
} from "@/lib/actions/ad-campaigns"
import { getProducts } from "@/lib/actions/products"
import type { AdPlatform, CampaignStatus, Channel } from "@/lib/types/database.types"
import { formatCurrency } from "@/lib/utils"

const platformLabels: Record<AdPlatform, string> = {
  tiktok_ads: "TikTok Ads",
  shopee_ads: "Shopee Ads",
  facebook_ads: "Facebook Ads",
  google_ads: "Google Ads",
}

const channelLabels: Record<Channel, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  tiktok: "TikTok",
  offline: "Offline",
}

const statusVariants: Record<CampaignStatus, "default" | "success" | "secondary"> = {
  active: "success",
  completed: "secondary",
  paused: "default",
}

export default async function AdCampaignsPage() {
  const selectedMonth = getCurrentMonthStart()
  const [campaigns, products, report, setups, spendRows, targets] = await Promise.all([
    getAllCampaignsMetrics(),
    getProducts(),
    getMonthlyAdsReportBundle(selectedMonth),
    getSkuAdSetups(),
    getMonthlyAdSpendRows(selectedMonth),
    getSkuSalesTargets(),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-3xl font-display font-bold">Ad Campaigns</h1>
        <p className="text-muted-foreground">
          Configure SKU-level ads, monthly spend, and profitability first. Legacy campaigns stay available below.
        </p>
      </div>

      <AdsSetupWorkspace
        products={products}
        report={report}
        selectedMonth={selectedMonth}
        setups={setups}
        spendRows={spendRows}
        targets={targets}
      />

      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold">Legacy Campaigns</h2>
            <p className="text-sm text-muted-foreground">
              Historical campaign cards and the legacy ROAS table remain here during the SKU workspace rollout.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/ad-campaigns/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Legacy Campaign
            </Link>
          </Button>
        </div>

        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border bg-card p-12">
            <TrendingUp className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No legacy campaigns yet</h3>
            <p className="mb-4 text-center text-muted-foreground">
              Create a campaign if you still need the legacy spend and ROAS workflow.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {campaigns.map((campaign) => (
                <Card key={campaign.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">{campaign.campaign_name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {platformLabels[campaign.platform]}
                        </p>
                      </div>
                      <Badge variant={statusVariants[campaign.status]}>
                        {campaign.status}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Channels:</span>
                        <span className="flex flex-wrap justify-end gap-1">
                          {campaign.target_channels.map((channel) => (
                            <Badge key={channel} variant="outline" className="text-xs">
                              {channelLabels[channel]}
                            </Badge>
                          ))}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Spend:</span>
                        <span className="font-medium">{formatCurrency(campaign.total_spend)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Revenue:</span>
                        <span className="font-medium">{formatCurrency(campaign.revenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ROAS:</span>
                        <span
                          className={`font-semibold ${
                            campaign.roas >= 2
                              ? "text-success"
                              : campaign.roas >= 1
                                ? "text-warning"
                                : "text-destructive"
                          }`}
                        >
                          {campaign.roas.toFixed(2)}x
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Orders:</span>
                        <span>{campaign.orders_count}</span>
                      </div>
                    </div>

                    <Button asChild variant="outline" size="sm" className="w-full">
                      <Link href={`/ad-campaigns/${campaign.id}`}>
                        View Details
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Channels</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                    <TableHead className="text-right">Cost/Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => {
                    const startDate = new Date(`${campaign.start_date}T00:00:00Z`).toLocaleDateString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      },
                    )
                    const endDate = campaign.end_date
                      ? new Date(`${campaign.end_date}T00:00:00Z`).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          timeZone: "UTC",
                        })
                      : "Ongoing"

                    return (
                      <TableRow key={campaign.id}>
                        <TableCell className="font-medium">{campaign.campaign_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{platformLabels[campaign.platform]}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {startDate} - {endDate}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {campaign.target_channels.map((channel) => (
                              <Badge key={channel} variant="outline" className="text-xs">
                                {channelLabels[channel]}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(campaign.total_spend)}
                        </TableCell>
                        <TableCell className="text-right">{campaign.orders_count}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(campaign.revenue)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`font-semibold ${
                              campaign.roas >= 2
                                ? "text-success"
                                : campaign.roas >= 1
                                  ? "text-warning"
                                  : "text-destructive"
                            }`}
                          >
                            {campaign.roas.toFixed(2)}x
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(campaign.cost_per_order)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariants[campaign.status]}>
                            {campaign.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/ad-campaigns/${campaign.id}`}>
                              View
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function getCurrentMonthStart() {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = `${now.getUTCMonth() + 1}`.padStart(2, "0")

  return `${year}-${month}-01`
}
