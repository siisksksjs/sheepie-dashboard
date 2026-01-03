import { getLedgerEntries } from "@/lib/actions/inventory"
import { getProducts } from "@/lib/actions/products"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/utils"
import { Plus, FileText } from "lucide-react"
import Link from "next/link"

const movementTypeLabels: Record<string, { label: string; variant: "default" | "destructive" | "success" | "outline" }> = {
  IN_PURCHASE: { label: "Purchase In", variant: "success" },
  OUT_SALE: { label: "Sale Out", variant: "default" },
  OUT_PROMO: { label: "Promo Out", variant: "outline" },
  OUT_DAMAGE: { label: "Damage Out", variant: "destructive" },
  RETURN: { label: "Return", variant: "success" },
  ADJUSTMENT: { label: "Adjustment", variant: "outline" },
}

export default async function LedgerPage() {
  const entries = await getLedgerEntries({ limit: 100 })
  const products = await getProducts()

  // Create product map for name lookup
  const productMap = new Map(products.map(p => [p.sku, p]))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">Inventory Ledger</h1>
          <p className="text-muted-foreground">
            Append-only record of all inventory movements
          </p>
        </div>
        <Link href="/ledger/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Entry
          </Button>
        </Link>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center border rounded-lg p-12 bg-card">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No ledger entries yet</h3>
          <p className="text-muted-foreground mb-4 text-center">
            Start tracking inventory by adding your first ledger entry.
          </p>
          <Link href="/ledger/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add First Entry
            </Button>
          </Link>
        </div>
      ) : (
        <div className="border rounded-lg bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Movement Type</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const product = productMap.get(entry.sku)
                const movementInfo = movementTypeLabels[entry.movement_type]
                const isInbound = entry.quantity > 0

                return (
                  <TableRow key={entry.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(entry.entry_date)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {entry.sku}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{product?.name || "Unknown"}</div>
                        {product?.variant && (
                          <div className="text-sm text-muted-foreground">
                            {product.variant}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={movementInfo?.variant || "outline"}>
                        {movementInfo?.label || entry.movement_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          isInbound
                            ? "font-semibold text-success"
                            : "font-semibold text-destructive"
                        }
                      >
                        {isInbound ? "+" : ""}{entry.quantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">
                      {entry.reference || "-"}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="mt-4 p-4 bg-muted/50 rounded-lg border">
        <p className="text-sm text-muted-foreground">
          <strong>Note:</strong> Ledger entries are immutable. To correct a mistake, create an ADJUSTMENT entry with the opposite quantity.
        </p>
      </div>
    </div>
  )
}
