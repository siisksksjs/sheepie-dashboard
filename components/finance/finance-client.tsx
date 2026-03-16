"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Landmark,
  PackagePlus,
  Plus,
  Wallet,
} from "lucide-react"
import {
  createFinanceAccount,
  createFinanceEntry,
  createFinanceTransfer,
  createInventoryPurchase,
  saveMarketplaceAccountMappings,
} from "@/lib/actions/finance"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type {
  Channel,
  FinanceAccount,
  FinanceCategory,
  FinanceEntryDirection,
  Product,
} from "@/lib/types/database.types"

type EntryRow = Awaited<ReturnType<typeof import("@/lib/actions/finance").getFinanceEntries>>[number]
type TransferRow = Awaited<ReturnType<typeof import("@/lib/actions/finance").getFinanceTransfers>>[number]
type PurchaseRow = Awaited<ReturnType<typeof import("@/lib/actions/finance").getInventoryPurchaseBatches>>[number]
type Overview = Awaited<ReturnType<typeof import("@/lib/actions/finance").getFinanceOverview>>
type MarketplaceMappingRow = Awaited<ReturnType<typeof import("@/lib/actions/finance").getMarketplaceAccountMappings>>[number]

type PurchaseItemForm = {
  id: string
  sku: string
  quantity: number
  unit_cost: number
}

type Props = {
  selectedYear: number
  selectedMonth: number | undefined
  overview: Overview
  entries: EntryRow[]
  transfers: TransferRow[]
  purchases: PurchaseRow[]
  accounts: FinanceAccount[]
  categories: FinanceCategory[]
  marketplaceMappings: MarketplaceMappingRow[]
  products: Product[]
}

const marketplaceChannels: Channel[] = ["shopee", "tokopedia", "tiktok"]

const channelLabels: Record<Channel, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  tiktok: "TikTok Shop",
  offline: "Offline",
}

function buildFilterUrl(year: number, month?: number) {
  const params = new URLSearchParams()
  params.set("year", year.toString())
  if (month) params.set("month", month.toString())
  return `/finance?${params.toString()}`
}

export function FinanceClient({
  selectedYear,
  selectedMonth,
  overview,
  entries,
  transfers,
  purchases,
  accounts,
  categories,
  marketplaceMappings,
  products,
}: Props) {
  const router = useRouter()
  const [accountError, setAccountError] = useState<string | null>(null)
  const [entryError, setEntryError] = useState<string | null>(null)
  const [transferError, setTransferError] = useState<string | null>(null)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const [mappingError, setMappingError] = useState<string | null>(null)
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemForm[]>([
    { id: crypto.randomUUID(), sku: "", quantity: 1, unit_cost: 0 },
  ])
  const [entryCategoryId, setEntryCategoryId] = useState("")
  const [entryDirection, setEntryDirection] = useState<FinanceEntryDirection>("out")
  const [channelAccountMappings, setChannelAccountMappings] = useState<Record<Channel, string>>(() => ({
    shopee: marketplaceMappings.find((mapping) => mapping.channel === "shopee")?.finance_account_id || "unmapped",
    tokopedia: marketplaceMappings.find((mapping) => mapping.channel === "tokopedia")?.finance_account_id || "unmapped",
    tiktok: marketplaceMappings.find((mapping) => mapping.channel === "tiktok")?.finance_account_id || "unmapped",
    offline: "unmapped",
  }))

  const yearOptions = Array.from({ length: 5 }, (_, index) => selectedYear - 2 + index)
  const entryCategories = categories.filter((category) =>
    category.kind !== "inventory_purchase"
    && category.kind !== "transfer"
    && category.kind !== "marketplace_settlement"
  )
  const selectedEntryCategory = entryCategories.find((category) => category.id === entryCategoryId)

  const handleYearChange = (value: string) => {
    router.replace(buildFilterUrl(parseInt(value, 10), selectedMonth))
  }

  const handleMonthChange = (value: string) => {
    const month = value === "all" ? undefined : parseInt(value, 10)
    router.replace(buildFilterUrl(selectedYear, month))
  }

  const handleAccountSubmit = async (formData: FormData) => {
    setAccountError(null)
    const result = await createFinanceAccount({
      name: formData.get("name") as string,
      type: formData.get("type") as "bank" | "cash" | "ewallet",
      opening_balance: formData.get("opening_balance")
        ? parseFloat(formData.get("opening_balance") as string)
        : 0,
      notes: (formData.get("notes") as string) || null,
    })

    if (!result.success) {
      setAccountError(result.error || "Failed to create account")
      return
    }

    router.refresh()
  }

  const handleEntryCategoryChange = (value: string) => {
    setEntryCategoryId(value)
    const category = entryCategories.find((item) => item.id === value)
    if (!category) return

    if (category.kind === "other_income") {
      setEntryDirection("in")
    } else if (category.kind === "adjustment") {
      setEntryDirection("in")
    } else {
      setEntryDirection("out")
    }
  }

  const handleEntrySubmit = async (formData: FormData) => {
    setEntryError(null)
    const result = await createFinanceEntry({
      entry_date: formData.get("entry_date") as string,
      account_id: formData.get("account_id") as string,
      category_id: formData.get("category_id") as string,
      direction: (selectedEntryCategory?.kind === "adjustment"
        ? formData.get("direction")
        : entryDirection) as FinanceEntryDirection,
      amount: parseFloat(formData.get("amount") as string),
      vendor: (formData.get("vendor") as string) || null,
      notes: (formData.get("notes") as string) || null,
    })

    if (!result.success) {
      setEntryError(result.error || "Failed to create finance entry")
      return
    }

    router.refresh()
  }

  const handleTransferSubmit = async (formData: FormData) => {
    setTransferError(null)
    const result = await createFinanceTransfer({
      entry_date: formData.get("entry_date") as string,
      from_account_id: formData.get("from_account_id") as string,
      to_account_id: formData.get("to_account_id") as string,
      amount: parseFloat(formData.get("amount") as string),
      notes: (formData.get("notes") as string) || null,
    })

    if (!result.success) {
      setTransferError(result.error || "Failed to create transfer")
      return
    }

    router.refresh()
  }

  const updatePurchaseItem = (id: string, field: keyof PurchaseItemForm, value: string | number) => {
    setPurchaseItems((current) =>
      current.map((item) => item.id === id ? { ...item, [field]: value } : item)
    )
  }

  const addPurchaseItem = () => {
    setPurchaseItems((current) => [
      ...current,
      { id: crypto.randomUUID(), sku: "", quantity: 1, unit_cost: 0 },
    ])
  }

  const removePurchaseItem = (id: string) => {
    setPurchaseItems((current) => current.filter((item) => item.id !== id))
  }

  const handlePurchaseSubmit = async (formData: FormData) => {
    setPurchaseError(null)
    const result = await createInventoryPurchase({
      entry_date: formData.get("entry_date") as string,
      account_id: formData.get("account_id") as string,
      vendor: (formData.get("vendor") as string) || null,
      notes: (formData.get("notes") as string) || null,
      items: purchaseItems.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
      })),
    })

    if (!result.success) {
      setPurchaseError(result.error || "Failed to create inventory purchase")
      return
    }

    router.refresh()
  }

  const handleMarketplaceMappingSave = async () => {
    setMappingError(null)
    const result = await saveMarketplaceAccountMappings({
      shopee: channelAccountMappings.shopee === "unmapped" ? null : channelAccountMappings.shopee,
      tokopedia: channelAccountMappings.tokopedia === "unmapped" ? null : channelAccountMappings.tokopedia,
      tiktok: channelAccountMappings.tiktok === "unmapped" ? null : channelAccountMappings.tiktok,
    })

    if (!result.success) {
      setMappingError(result.error || "Failed to save marketplace mappings")
      return
    }

    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">Finance</h1>
          <p className="text-muted-foreground">
            Track operating P&amp;L, cash flow, bank balances, and inventory purchases.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Year</Label>
            <Select value={selectedYear.toString()} onValueChange={handleYearChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Month</Label>
            <Select value={selectedMonth ? selectedMonth.toString() : "all"} onValueChange={handleMonthChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                  <SelectItem key={month} value={month.toString()}>
                    {new Date(selectedYear, month - 1).toLocaleString("default", { month: "long" })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pnl">P&amp;L</TabsTrigger>
          <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="inventory-purchases">Inventory Purchases</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Total Cash Balance</CardDescription>
                <CardTitle className="text-2xl">{formatCurrency(overview.total_cash_balance)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Net Profit</CardDescription>
                <CardTitle className={overview.pnl.net_profit >= 0 ? "text-2xl text-success" : "text-2xl text-destructive"}>
                  {formatCurrency(overview.pnl.net_profit)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Operating Expenses</CardDescription>
                <CardTitle className="text-2xl">{formatCurrency(overview.pnl.operating_expenses + overview.pnl.ad_spend)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Inventory Purchased</CardDescription>
                <CardTitle className="text-2xl">{formatCurrency(overview.inventory_purchase_total)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle>Account Balances</CardTitle>
                <CardDescription>Current balance by account</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Opening</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.account_balances.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.name}</TableCell>
                        <TableCell className="capitalize">{account.type}</TableCell>
                        <TableCell className="text-right">{formatCurrency(account.opening_balance)}</TableCell>
                        <TableCell className={`text-right font-semibold ${account.current_balance >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatCurrency(account.current_balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Expense Breakdown</CardTitle>
                <CardDescription>Operating expenses by category</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview.pnl.expenses_by_category.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No operating expenses recorded in this period.</p>
                ) : (
                  overview.pnl.expenses_by_category.map((item) => (
                    <div key={item.category} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                      <span className="text-sm text-muted-foreground">{item.category}</span>
                      <span className="font-medium">{formatCurrency(item.amount)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pnl">
          <Card>
            <CardHeader>
              <CardTitle>Profit &amp; Loss Statement</CardTitle>
              <CardDescription>Operational profitability for the selected period</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                ["Gross Revenue", overview.pnl.gross_revenue],
                ["Channel Fees", -overview.pnl.channel_fees],
                ["Net Sales", overview.pnl.net_sales],
                ["COGS", -overview.pnl.cogs],
                ["Gross Profit", overview.pnl.gross_profit],
                ["Ad Spend", -overview.pnl.ad_spend],
                ["Operating Expenses", -overview.pnl.operating_expenses],
                ["Operating Profit", overview.pnl.operating_profit],
                ["Other Income", overview.pnl.other_income],
                ["Adjustments", overview.pnl.adjustments],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="font-medium">{formatCurrency(Number(value))}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-4 text-lg font-bold">
                <span>Net Profit</span>
                <span className={overview.pnl.net_profit >= 0 ? "text-success" : "text-destructive"}>
                  {formatCurrency(overview.pnl.net_profit)}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cash-flow" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Opening Cash</CardDescription>
                <CardTitle className="text-2xl">{formatCurrency(overview.cash_flow.opening_cash)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Cash In</CardDescription>
                <CardTitle className="text-2xl text-success">{formatCurrency(overview.cash_flow.cash_in)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Cash Out</CardDescription>
                <CardTitle className="text-2xl text-destructive">{formatCurrency(overview.cash_flow.cash_out)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Closing Cash</CardDescription>
                <CardTitle className="text-2xl">{formatCurrency(overview.cash_flow.closing_cash)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Create Transfer</CardTitle>
                <CardDescription>Move balance between internal accounts</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={handleTransferSubmit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input name="entry_date" type="date" defaultValue={new Date().toISOString().split("T")[0]} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input name="amount" type="number" step="0.01" min="0.01" required />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>From Account</Label>
                      <Select name="from_account_id" required>
                        <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                        <SelectContent>
                          {accounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>To Account</Label>
                      <Select name="to_account_id" required>
                        <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                        <SelectContent>
                          {accounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea name="notes" placeholder="Optional transfer notes" />
                  </div>
                  {transferError && <p className="text-sm text-destructive">{transferError}</p>}
                  <Button type="submit"><ArrowRightLeft className="mr-2 h-4 w-4" />Create Transfer</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Transfers</CardTitle>
                <CardDescription>Latest internal account movements</CardDescription>
              </CardHeader>
              <CardContent>
                {transfers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transfers yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transfers.map((transfer) => (
                        <TableRow key={transfer.id}>
                          <TableCell>{formatDate(transfer.entry_date)}</TableCell>
                          <TableCell>{transfer.from_account_name}</TableCell>
                          <TableCell>{transfer.to_account_name}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(transfer.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Create Finance Entry</CardTitle>
                <CardDescription>Add operating expense, other income, or adjustment</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={handleEntrySubmit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input name="entry_date" type="date" defaultValue={new Date().toISOString().split("T")[0]} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input name="amount" type="number" step="0.01" min="0.01" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Account</Label>
                    <Select name="account_id" required>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select name="category_id" value={entryCategoryId} onValueChange={handleEntryCategoryChange} required>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {entryCategories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedEntryCategory?.kind === "adjustment" && (
                    <div className="space-y-2">
                      <Label>Direction</Label>
                      <Select name="direction" value={entryDirection} onValueChange={(value) => setEntryDirection(value as FinanceEntryDirection)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="in">Money In</SelectItem>
                          <SelectItem value="out">Money Out</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Vendor / Source</Label>
                    <Input name="vendor" placeholder="Optional vendor or source" />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea name="notes" placeholder="Optional notes" />
                  </div>
                  {entryError && <p className="text-sm text-destructive">{entryError}</p>}
                  <Button type="submit"><Plus className="mr-2 h-4 w-4" />Create Entry</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Finance Entries</CardTitle>
                <CardDescription>Latest cash in and out records</CardDescription>
              </CardHeader>
              <CardContent>
                {entries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No finance entries yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>{formatDate(entry.entry_date)}</TableCell>
                          <TableCell>{entry.category_name}</TableCell>
                          <TableCell>{entry.account_name}</TableCell>
                          <TableCell>{entry.vendor || "-"}</TableCell>
                          <TableCell className={`text-right font-medium ${entry.direction === "in" ? "text-success" : "text-destructive"}`}>
                            {entry.direction === "in" ? <ArrowDownLeft className="inline mr-1 h-4 w-4" /> : <ArrowUpRight className="inline mr-1 h-4 w-4" />}
                            {formatCurrency(entry.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="accounts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Marketplace Settlement Accounts</CardTitle>
              <CardDescription>
                Paid and shipped marketplace orders credit these balances automatically. Tokopedia and TikTok can use the same account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                {marketplaceChannels.map((channel) => (
                  <div key={channel} className="space-y-2">
                    <Label>{channelLabels[channel]}</Label>
                    <Select
                      value={channelAccountMappings[channel]}
                      onValueChange={(value) =>
                        setChannelAccountMappings((current) => ({ ...current, [channel]: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unmapped">Unmapped</SelectItem>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {mappingError && <p className="text-sm text-destructive">{mappingError}</p>}
              <Button type="button" onClick={handleMarketplaceMappingSave}>
                <Wallet className="mr-2 h-4 w-4" />
                Save Marketplace Mappings
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Create Account</CardTitle>
                <CardDescription>Add a bank, cash, or e-wallet account</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={handleAccountSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input name="name" placeholder="BCA Operational" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select name="type" defaultValue="bank" required>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="ewallet">E-Wallet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Opening Balance</Label>
                    <Input name="opening_balance" type="number" step="0.01" min="0" defaultValue="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea name="notes" placeholder="Optional notes" />
                  </div>
                  {accountError && <p className="text-sm text-destructive">{accountError}</p>}
                  <Button type="submit"><Landmark className="mr-2 h-4 w-4" />Create Account</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Accounts</CardTitle>
                <CardDescription>Current tracked cash and bank balances</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Opening</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.account_balances.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.name}</TableCell>
                        <TableCell className="capitalize">{account.type}</TableCell>
                        <TableCell className="text-right">{formatCurrency(account.opening_balance)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(account.current_balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="inventory-purchases" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle>Record Inventory Purchase</CardTitle>
                <CardDescription>Create stock purchase and cash-out together</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={handlePurchaseSubmit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input name="entry_date" type="date" defaultValue={new Date().toISOString().split("T")[0]} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Account</Label>
                      <Select name="account_id" required>
                        <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                        <SelectContent>
                          {accounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Vendor</Label>
                    <Input name="vendor" placeholder="Supplier name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea name="notes" placeholder="Optional notes" />
                  </div>

                  <div className="space-y-3 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <Label>Purchased Items</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addPurchaseItem}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Item
                      </Button>
                    </div>
                    {purchaseItems.map((item) => (
                      <div key={item.id} className="grid gap-3 md:grid-cols-[1.6fr_0.7fr_0.9fr_auto] items-end">
                        <div className="space-y-2">
                          <Label>Product</Label>
                          <Select value={item.sku} onValueChange={(value) => updatePurchaseItem(item.id, "sku", value)}>
                            <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                            <SelectContent>
                              {products.map((product) => (
                                <SelectItem key={product.id} value={product.sku}>
                                  {product.sku} - {product.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Qty</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updatePurchaseItem(item.id, "quantity", parseInt(e.target.value, 10) || 0)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Unit Cost</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_cost}
                            onChange={(e) => updatePurchaseItem(item.id, "unit_cost", parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <Button type="button" variant="ghost" onClick={() => removePurchaseItem(item.id)}>
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>

                  {purchaseError && <p className="text-sm text-destructive">{purchaseError}</p>}
                  <Button type="submit"><PackagePlus className="mr-2 h-4 w-4" />Record Purchase</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Inventory Purchases</CardTitle>
                <CardDescription>Latest procurement batches</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {purchases.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No inventory purchases yet.</p>
                ) : (
                  purchases.map((purchase) => (
                    <div key={purchase.id} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold">{purchase.vendor || "Inventory Purchase"}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(purchase.entry_date)} • {purchase.account_name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(purchase.total_amount)}</p>
                          <p className="text-xs text-muted-foreground">{purchase.items.length} items</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {purchase.items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>{item.product_name} ({item.sku}) x{item.quantity}</span>
                            <span>{formatCurrency(item.total_cost)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
