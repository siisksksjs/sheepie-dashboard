"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { saveListingMapping, type ShopeeListingMapping, type ShopeeSettings } from "@/lib/actions/shopee"
import { PACK_SIZE_OPTIONS } from "@/lib/products/pack-sizes"
import type { UnmappedItem } from "@/lib/shopee/settings-actions"
import type { PackSize } from "@/lib/types/database.types"

type Product = ShopeeSettings["products"][number]

type Props = {
  unmappedItems: UnmappedItem[]
  mappings: ShopeeListingMapping[]
  products: Product[]
}

function productLabel(product: Product) {
  const name = product.variant ? `${product.name} · ${product.variant}` : product.name
  return product.status === "discontinued" ? `${name} (discontinued)` : name
}

function MappingRow({
  item,
  initial,
  products,
  note,
}: {
  item: { item_id: number; model_id: number; item_name: string; model_name: string }
  initial?: { sku: string; pack_size: PackSize }
  products: Product[]
  note?: string
}) {
  const [sku, setSku] = useState(initial?.sku ?? "")
  const [packSize, setPackSize] = useState<PackSize>(initial?.pack_size ?? "single")
  const [saving, startSaving] = useTransition()
  const unchanged = initial !== undefined && initial.sku === sku && initial.pack_size === packSize

  function save() {
    startSaving(async () => {
      const result = await saveListingMapping({ ...item, sku, pack_size: packSize })
      if (result.success) toast.success(result.message ?? "Saved.")
      else toast.error(result.error)
    })
  }

  const label = `${item.item_name || "Unnamed item"}${item.model_name ? ` · ${item.model_name}` : ""}`

  return (
    <li className="px-5 py-4">
      <p className="font-semibold leading-snug">{label}</p>
      <p className="num mt-0.5 text-[12px] text-muted-foreground">
        Item {item.item_id} / model {item.model_id}
        {note ? ` · ${note}` : ""}
      </p>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_130px_auto]">
        <Select value={sku} onValueChange={setSku}>
          <SelectTrigger aria-label={`SKU for ${label}`} className="col-span-2 sm:col-span-1">
            <SelectValue placeholder="Choose a SKU" />
          </SelectTrigger>
          <SelectContent>
            {products.map((product) => (
              <SelectItem key={product.sku} value={product.sku}>
                {productLabel(product)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={packSize} onValueChange={(value) => setPackSize(value as PackSize)}>
          <SelectTrigger aria-label={`Pack size for ${label}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PACK_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={save} disabled={saving || !sku || unchanged} className="h-11">
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </li>
  )
}

export function ListingMapEditor({ unmappedItems, mappings, products }: Props) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-display text-[19px] font-semibold">Products to map</h2>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          {unmappedItems.length > 0
            ? `${unmappedItems.length} Shopee product${unmappedItems.length === 1 ? " has" : "s have"} no SKU yet. Once mapped, the waiting orders sync on the next run.`
            : "Every Shopee product seen so far is mapped to a SKU."}
        </p>
        {unmappedItems.length > 0 && (
          <ul className="glass mt-3 divide-y divide-primary/[0.07] overflow-hidden rounded-[22px]">
            {unmappedItems.map((item) => (
              <MappingRow
                key={`${item.item_id}:${item.model_id}`}
                item={item}
                products={products}
                note={`${item.orderCount} order${item.orderCount === 1 ? "" : "s"} waiting`}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-[19px] font-semibold">Mapped products</h2>
        {mappings.length > 0 ? (
          <ul className="glass mt-3 divide-y divide-primary/[0.07] overflow-hidden rounded-[22px]">
            {mappings.map((mapping) => (
              <MappingRow
                key={`${mapping.item_id}:${mapping.model_id}`}
                item={mapping}
                initial={{ sku: mapping.sku, pack_size: mapping.pack_size }}
                products={products}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[13.5px] text-muted-foreground">No products mapped yet.</p>
        )}
      </section>
    </div>
  )
}
