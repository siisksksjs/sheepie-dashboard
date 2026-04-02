import Link from "next/link"

import {
  SetupRowActions,
  SpendRowActions,
  TargetRowActions,
} from "@/components/ad-campaigns/workspace-row-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { MonthlyAdsReportBundle } from "@/lib/ads/reporting"
import type {
  Channel,
  MonthlyAdSpend,
  Product,
  SkuAdSetup,
  SkuSalesTarget,
} from "@/lib/types/database.types"
import { formatCurrency } from "@/lib/utils"

const channelLabels: Record<Channel, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  tiktok: "TikTok",
  offline: "Offline",
}

const setupStatusVariants: Record<
  SkuAdSetup["status"],
  "default" | "secondary" | "success"
> = {
  active: "success",
  paused: "default",
  ended: "secondary",
}

type ReadSection<T> = {
  data: T[]
  load_error: string | null
}

export function AdsSetupWorkspace(props: {
  products: Product[]
  report: MonthlyAdsReportBundle
  selectedMonth: string
  setups: ReadSection<SkuAdSetup>
  spendRows: ReadSection<MonthlyAdSpend>
  targets: ReadSection<SkuSalesTarget>
}) {
  const productBySku = new Map(props.products.map((product) => [product.sku, product]))
  const monthLabel = formatMonthLabel(props.selectedMonth)
  const monthScopedSetups = filterMonthScopedSetups(props.setups.data, props.selectedMonth)
  const monthScopedTargets = filterMonthScopedTargets(props.targets.data, props.selectedMonth)
  const missingSpendScopes: NonNullable<MonthlyAdsReportBundle["missingSpendScopes"]> =
    props.report.missingSpendScopes ?? []

  return (
    <section className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ad Setup</CardTitle>
          <CardDescription>
            Active SKU-channel setups and target units for {monthLabel}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                SKU Ad Setups
              </h3>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{monthScopedSetups.length} rows</Badge>
                <Button asChild size="sm" variant="outline">
                  <Link href="/ad-campaigns/setup/new">Add Setup</Link>
                </Button>
              </div>
            </div>

            {props.setups.load_error ? (
              <LoadErrorBanner message={`Unable to load ad setups: ${props.setups.load_error}`} />
            ) : monthScopedSetups.length === 0 ? (
              <EmptyState message="No SKU ad setups overlap the current dataset yet." />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Channels</TableHead>
                      <TableHead>Objective</TableHead>
                      <TableHead className="text-right">Daily Budget Cap</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthScopedSetups.map((setup) => (
                      <TableRow key={setup.id}>
                        <TableCell>
                          <div className="font-medium">{renderProductLabel(productBySku, setup.sku)}</div>
                          <div className="text-xs text-muted-foreground">{setup.sku}</div>
                        </TableCell>
                        <TableCell>{formatChannelScope(getScopeChannels(setup))}</TableCell>
                        <TableCell>{setup.objective}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(setup.daily_budget_cap)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateRange(setup.start_date, setup.end_date)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={setupStatusVariants[setup.status]}>{setup.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <SetupRowActions setup={setup} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                SKU Sales Targets
              </h3>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{monthScopedTargets.length} rows</Badge>
                <Button asChild size="sm" variant="outline">
                  <Link href="/ad-campaigns/targets/new">Add Target</Link>
                </Button>
              </div>
            </div>

            {props.targets.load_error ? (
              <LoadErrorBanner message={`Unable to load sales targets: ${props.targets.load_error}`} />
            ) : monthScopedTargets.length === 0 ? (
              <EmptyState message="No SKU sales targets are configured yet." />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Daily Target Units</TableHead>
                      <TableHead>Effective Window</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthScopedTargets.map((target) => (
                      <TableRow key={target.id}>
                        <TableCell>
                          <div className="font-medium">{renderProductLabel(productBySku, target.sku)}</div>
                          <div className="text-xs text-muted-foreground">{target.sku}</div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {target.daily_target_units}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateRange(target.effective_from, target.effective_to)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {target.notes || "No notes"}
                        </TableCell>
                        <TableCell className="text-right">
                          <TargetRowActions target={target} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Monthly Spend Input</CardTitle>
              <CardDescription>
                Recorded monthly spend rows for {monthLabel}.
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/ad-campaigns/spend/new">Add Spend</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {props.spendRows.load_error ? (
            <LoadErrorBanner
              message={`Unable to load monthly spend inputs: ${props.spendRows.load_error}`}
            />
          ) : props.spendRows.data.length === 0 ? (
            <EmptyState message="No monthly ad spend rows have been recorded for this month yet." />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Channels</TableHead>
                    <TableHead className="text-right">Actual Spend</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {props.spendRows.data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{renderProductLabel(productBySku, row.sku)}</div>
                        <div className="text-xs text-muted-foreground">{row.sku}</div>
                      </TableCell>
                      <TableCell>{formatChannelScope(getScopeChannels(row))}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(row.actual_spend)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.notes || "No notes"}
                      </TableCell>
                      <TableCell className="text-right">
                        <SpendRowActions row={row} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {props.report.load_error ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Missing-spend guidance is unavailable until the monthly report finishes loading.
            </div>
          ) : missingSpendScopes.length > 0 ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
              <div className="mb-2 text-sm font-semibold text-destructive">
                Spend rows still missing for ads-active channel scopes
              </div>
              <div className="space-y-1 text-sm text-destructive">
                {missingSpendScopes.map((scope) => (
                  <div key={`${scope.sku}-${scope.channels.join("|")}`}>
                    {scope.sku} · {formatChannelScope(scope.channels)} · budget cap{" "}
                    {formatCurrency(scope.budget_cap)}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Every ads-active SKU-channel in the report has a monthly spend row.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Ads Report</CardTitle>
          <CardDescription>
            SKU-level profitability and channel attribution for {monthLabel}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {props.report.load_error ? (
            <LoadErrorBanner
              message={`Unable to load the monthly ads report: ${props.report.load_error}`}
            />
          ) : props.report.skuSummaries.length === 0 ? (
            <EmptyState message="No reportable SKU activity was found for this month." />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                  label="Target Units"
                  value={formatNumber(props.report.totals.total_target_units)}
                />
                <MetricCard
                  label="Actual Units"
                  value={formatNumber(props.report.totals.total_actual_units)}
                />
                <MetricCard
                  label="Ads Spend"
                  value={formatCurrency(props.report.totals.total_ads_spent)}
                />
                <MetricCard
                  label="Profit After Ads"
                  value={formatCurrency(props.report.totals.profit_after_ads)}
                />
                <MetricCard
                  label="Target Achievement"
                  value={`${props.report.totals.target_achievement_percent.toFixed(1)}%`}
                />
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Ads Units</TableHead>
                      <TableHead className="text-right">Organic Units</TableHead>
                      <TableHead className="text-right">Ads Spend</TableHead>
                      <TableHead className="text-right">Budget Cap</TableHead>
                      <TableHead className="text-right">Profit After Ads</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {props.report.skuSummaries.map((summary) => (
                      <TableRow key={summary.sku}>
                        <TableCell>
                          <div className="font-medium">{renderProductLabel(productBySku, summary.sku)}</div>
                          <div className="text-xs text-muted-foreground">{summary.sku}</div>
                        </TableCell>
                        <TableCell className="text-right">{formatNumber(summary.target_units)}</TableCell>
                        <TableCell className="text-right">{formatNumber(summary.actual_units)}</TableCell>
                        <TableCell className="text-right">
                          {formatNumber(summary.ads_active_channel_units)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(summary.organic_channel_units)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(summary.total_ads_spent)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(summary.total_budget_cap)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold ${
                            summary.profit_after_ads >= 0 ? "text-success" : "text-destructive"
                          }`}
                        >
                          {formatCurrency(summary.profit_after_ads)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Classification</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Ads Spend</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Profit After Ads</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {props.report.channelBreakdown.map((row) => (
                      <TableRow key={`${row.sku}-${row.channel}`}>
                        <TableCell>
                          <div className="font-medium">{renderProductLabel(productBySku, row.sku)}</div>
                          <div className="text-xs text-muted-foreground">{row.sku}</div>
                        </TableCell>
                        <TableCell>{channelLabels[row.channel]}</TableCell>
                        <TableCell>
                          <Badge variant={row.classification === "ads-active" ? "success" : "secondary"}>
                            {row.classification}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatNumber(row.units)}</TableCell>
                        <TableCell className="text-right">
                          {row.actual_spend_missing
                            ? "Missing"
                            : row.uses_shared_budget
                              ? "Shared at SKU level"
                              : formatCurrency(row.ads_spent)}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                        <TableCell
                          className={`text-right font-semibold ${
                            row.profit_after_ads >= 0 ? "text-success" : "text-destructive"
                          }`}
                        >
                          {row.actual_spend_missing
                            ? "Missing"
                            : row.uses_shared_budget
                              ? "Shared at SKU level"
                              : formatCurrency(row.profit_after_ads)}
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
    </section>
  )
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {props.label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{props.value}</div>
    </div>
  )
}

function LoadErrorBanner(props: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
      {props.message}
    </div>
  )
}

function EmptyState(props: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      {props.message}
    </div>
  )
}

function renderProductLabel(
  productBySku: Map<string, Product>,
  sku: string,
) {
  const product = productBySku.get(sku)

  if (!product) {
    return sku
  }

  return product.variant ? `${product.name} · ${product.variant}` : product.name
}

function getScopeChannels(input: {
  channels?: Channel[] | null
  channel?: Channel | null
}) {
  if (Array.isArray(input.channels) && input.channels.length > 0) {
    return input.channels
  }

  return input.channel ? [input.channel] : []
}

function formatChannelScope(channels: readonly Channel[]) {
  return channels.map((channel) => channelLabels[channel]).join(" + ")
}

function formatDateRange(startDate: string, endDate: string | null) {
  return `${formatDateLabel(startDate)} - ${endDate ? formatDateLabel(endDate) : "Ongoing"}`
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`))
}

function formatMonthLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`))
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value)
}

function filterMonthScopedSetups(setups: SkuAdSetup[], selectedMonth: string) {
  return setups.filter((setup) =>
    isDateRangeOverlappingMonth(selectedMonth, setup.start_date, setup.end_date),
  )
}

function filterMonthScopedTargets(targets: SkuSalesTarget[], selectedMonth: string) {
  return targets.filter((target) =>
    isDateRangeOverlappingMonth(
      selectedMonth,
      target.effective_from,
      target.effective_to,
    ),
  )
}

function isDateRangeOverlappingMonth(
  selectedMonth: string,
  startDate: string,
  endDate: string | null,
) {
  const monthStart = `${selectedMonth.slice(0, 7)}-01`
  const monthEnd = getMonthEnd(monthStart)
  const normalizedEndDate = endDate ?? "9999-12-31"

  return startDate <= monthEnd && normalizedEndDate >= monthStart
}

function getMonthEnd(monthStart: string) {
  const date = new Date(`${monthStart}T00:00:00Z`)
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  )
    .toISOString()
    .slice(0, 10)
}
