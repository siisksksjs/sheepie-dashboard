import { getCampaignMetrics, getSpendEntries } from "@/lib/actions/ad-campaigns"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency } from "@/lib/utils"
import { ArrowLeft, TrendingUp, DollarSign, ShoppingCart, Target, Eye } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AddSpendModal } from "@/components/ad-campaigns/add-spend-modal"

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

type Props = {
  params: Promise<{ id: string }>
}

export default async function CampaignDetailPage({ params }: Props) {
  const { id } = await params
  const [metrics, spendEntries] = await Promise.all([
    getCampaignMetrics(id),
    getSpendEntries(id),
  ])

  if (!metrics) {
    notFound()
  }

  const { campaign, total_spend, orders_count, revenue, profit, roas, cost_per_order, attributed_orders } = metrics

  const startDate = new Date(campaign.start_date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
  const endDate = campaign.end_date
    ? new Date(campaign.end_date).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    : 'Ongoing'

  return (
    <div>
      <div className="mb-6">
        <Link href="/ad-campaigns">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Campaigns
          </Button>
        </Link>
      </div>

      {/* Campaign Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-3xl font-display font-bold">{campaign.campaign_name}</h1>
            <p className="text-muted-foreground mt-1">
              {platformLabels[campaign.platform]} • {startDate} - {endDate}
            </p>
          </div>
          <Badge variant={statusVariants[campaign.status]} className="text-sm">
            {campaign.status}
          </Badge>
        </div>
        <div className="flex gap-2 flex-wrap mt-3">
          {campaign.target_channels.map((ch) => (
            <Badge key={ch} variant="outline">
              {channelLabels[ch]}
            </Badge>
          ))}
        </div>
        {campaign.notes && (
          <p className="text-sm text-muted-foreground mt-3 p-3 bg-muted rounded-md">
            {campaign.notes}
          </p>
        )}
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(total_spend)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {spendEntries.length} {spendEntries.length === 1 ? 'entry' : 'entries'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders_count}</div>
            <p className="text-xs text-muted-foreground mt-1">
              From target channels
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(revenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Net profit: {formatCurrency(profit || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROAS</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              roas >= 2 ? 'text-success' :
              roas >= 1 ? 'text-warning' :
              'text-destructive'
            }`}>
              {roas.toFixed(2)}x
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(cost_per_order)}/order
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Spend Entries Section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Spend Entries</CardTitle>
              <CardDescription>
                Record of all ad spend topups for this campaign
              </CardDescription>
            </div>
            <AddSpendModal campaignId={campaign.id} />
          </div>
        </CardHeader>
        <CardContent>
          {spendEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No spend entries yet</p>
              <p className="text-sm mt-1">Add your first topup entry to start tracking</p>
            </div>
          ) : (
            <>
              {/* Mobile View */}
              <div className="md:hidden space-y-3">
                {spendEntries.map((entry, index) => {
                  const runningTotal = spendEntries
                    .slice(0, index + 1)
                    .reduce((sum, e) => sum + e.amount, 0)

                  return (
                    <div key={entry.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{formatCurrency(entry.amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(entry.entry_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          Total: {formatCurrency(runningTotal)}
                        </Badge>
                      </div>
                      {entry.payment_method && (
                        <p className="text-sm text-muted-foreground">
                          {entry.payment_method}
                        </p>
                      )}
                      {entry.notes && (
                        <p className="text-sm text-muted-foreground italic">
                          {entry.notes}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Desktop View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Running Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {spendEntries.map((entry, index) => {
                      const runningTotal = spendEntries
                        .slice(0, index + 1)
                        .reduce((sum, e) => sum + e.amount, 0)

                      return (
                        <TableRow key={entry.id}>
                          <TableCell>
                            {new Date(entry.entry_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(entry.amount)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {entry.payment_method || '-'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {entry.notes || '-'}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(runningTotal)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Attributed Orders Section */}
      <Card>
        <CardHeader>
          <CardTitle>Attributed Orders</CardTitle>
          <CardDescription>
            Orders from {campaign.target_channels.map(ch => channelLabels[ch]).join(', ')} between {startDate} and {endDate}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {attributed_orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No orders attributed to this campaign yet</p>
              <p className="text-sm mt-1">Orders will appear here as they come in from target channels</p>
            </div>
          ) : (
            <>
              {/* Mobile View */}
              <div className="md:hidden space-y-3">
                {attributed_orders.map((order: any) => (
                  <div key={order.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{order.order_id}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(order.order_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                      <Badge variant="outline">{channelLabels[order.channel]}</Badge>
                    </div>

                    {/* Products */}
                    {order.line_items_with_names && order.line_items_with_names.length > 0 && (
                      <div className="space-y-1 py-1 border-y border-dashed">
                        {order.line_items_with_names.map((item: any, idx: number) => (
                          <div key={idx} className="text-xs">
                            <span className="text-muted-foreground">
                              {item.quantity}x {item.product_name}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Revenue:</span>
                      <span className="font-medium">{formatCurrency(order.revenue)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Net Profit:</span>
                      <span className={`font-medium ${order.net_profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {formatCurrency(order.net_profit)}
                      </span>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Link href={`/orders/${order.id}`} className="w-full">
                        <Button variant="outline" size="sm" className="w-full">
                          <Eye className="h-4 w-4 mr-2" />
                          View Order
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Net Profit</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attributed_orders.map((order: any) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">
                          <Link href={`/orders/${order.id}`} className="hover:underline">
                            {order.order_id}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {new Date(order.order_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{channelLabels[order.channel]}</Badge>
                        </TableCell>
                        <TableCell>
                          {order.line_items_with_names && order.line_items_with_names.length > 0 ? (
                            <div className="space-y-1">
                              {order.line_items_with_names.map((item: any, idx: number) => (
                                <div key={idx} className="text-sm text-muted-foreground">
                                  {item.quantity}x {item.product_name}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={order.status === 'paid' ? 'default' : 'secondary'}>
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(order.revenue)}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${
                          order.net_profit >= 0 ? 'text-success' : 'text-destructive'
                        }`}>
                          {formatCurrency(order.net_profit)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/orders/${order.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
