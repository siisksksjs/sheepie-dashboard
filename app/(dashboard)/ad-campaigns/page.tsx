import { getAllCampaignsMetrics } from "@/lib/actions/ad-campaigns"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency } from "@/lib/utils"
import { Plus, TrendingUp } from "lucide-react"
import Link from "next/link"

const platformLabels: Record<string, string> = {
  tiktok_ads: "TikTok Ads",
  shopee_ads: "Shopee Ads",
  facebook_ads: "Facebook Ads",
  google_ads: "Google Ads",
}

const channelLabels: Record<string, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  tiktok: "TikTok",
  offline: "Offline",
}

const statusVariants: Record<string, "default" | "success" | "secondary"> = {
  active: "success",
  completed: "secondary",
  paused: "default",
}

export default async function AdCampaignsPage() {
  const campaigns = await getAllCampaignsMetrics()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">Ad Campaigns</h1>
          <p className="text-muted-foreground">
            Track ad spend and measure ROAS across campaigns
          </p>
        </div>
        <Link href="/ad-campaigns/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Campaign
          </Button>
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center border rounded-lg p-12 bg-card">
          <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No campaigns yet</h3>
          <p className="text-muted-foreground mb-4 text-center">
            Create your first ad campaign to start tracking ad spend and ROAS.
          </p>
          <Link href="/ad-campaigns/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create First Campaign
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {campaigns.map((campaign) => (
              <Card key={campaign.id}>
                <CardContent className="p-4 space-y-3">
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
                      <span className="flex gap-1 flex-wrap justify-end">
                        {campaign.target_channels.map((ch) => (
                          <Badge key={ch} variant="outline" className="text-xs">
                            {channelLabels[ch]}
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
                      <span className={`font-semibold ${campaign.roas >= 2 ? 'text-success' : campaign.roas >= 1 ? 'text-warning' : 'text-destructive'}`}>
                        {campaign.roas.toFixed(2)}x
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Orders:</span>
                      <span>{campaign.orders_count}</span>
                    </div>
                  </div>

                  <Link href={`/ad-campaigns/${campaign.id}`}>
                    <Button variant="outline" size="sm" className="w-full">
                      View Details
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block border rounded-lg bg-card overflow-x-auto">
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
                  const startDate = new Date(campaign.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  const endDate = campaign.end_date
                    ? new Date(campaign.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : 'Ongoing'

                  return (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium">
                        {campaign.campaign_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {platformLabels[campaign.platform]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {startDate} - {endDate}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {campaign.target_channels.map((ch) => (
                            <Badge key={ch} variant="outline" className="text-xs">
                              {channelLabels[ch]}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(campaign.total_spend)}
                      </TableCell>
                      <TableCell className="text-right">
                        {campaign.orders_count}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(campaign.revenue)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-semibold ${campaign.roas >= 2 ? 'text-success' : campaign.roas >= 1 ? 'text-warning' : 'text-destructive'}`}>
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
                        <Link href={`/ad-campaigns/${campaign.id}`}>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
