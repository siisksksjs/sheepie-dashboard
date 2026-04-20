"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import type { Product } from "@/lib/types/database.types"
import type { ProductCogsHistoryEntry } from "@/lib/products/cogs-history"

type Props = {
  product: Pick<Product, "cost_per_unit">
  history: ProductCogsHistoryEntry[]
}

function formatDate(date: string) {
  const parsed = new Date(date)

  if (Number.isNaN(parsed.getTime())) {
    return date
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function formatCost(value: number | null) {
  return value === null ? "—" : formatCurrency(value)
}

function getSourceLabel(source: ProductCogsHistoryEntry["source"]) {
  switch (source) {
    case "product_edit":
      return "Direct edit"
    case "restock_batch":
      return "Restock"
    case "catalog_snapshot":
      return "Snapshot"
    default:
      return source
  }
}

export function ProductCogsHistory({ product, history }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>COGS History</CardTitle>
        <CardDescription>
          Track direct COGS edits and restock batch costs for this product.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="text-sm text-muted-foreground">Current catalog COGS</div>
          <div className="mt-1 text-2xl font-semibold">{formatCurrency(product.cost_per_unit)}</div>
        </div>

        {history.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No COGS history is available for this product yet.
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => (
              <div key={entry.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{entry.title}</span>
                      <Badge variant="outline">{getSourceLabel(entry.source)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{entry.summary}</p>
                    {entry.notes ? (
                      <p className="text-sm text-muted-foreground">{entry.notes}</p>
                    ) : null}
                  </div>
                  <div className="text-sm text-muted-foreground">{formatDate(entry.occurred_at)}</div>
                </div>

                <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                  <div>
                    <div className="text-muted-foreground">Previous cost</div>
                    <div className="font-medium">{formatCost(entry.previous_cost)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">New / batch cost</div>
                    <div className="font-medium">
                      {formatCost(entry.next_cost ?? entry.unit_cost)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Quantity</div>
                    <div className="font-medium">{entry.quantity ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Vendor</div>
                    <div className="font-medium">{entry.vendor || "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Shipping mode</div>
                    <div className="font-medium">{entry.shipping_mode || "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Batch total</div>
                    <div className="font-medium">{formatCost(entry.total_cost)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
