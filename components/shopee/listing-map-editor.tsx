"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { saveListingMapping, type ShopeeListingMapping, type ShopeeSettings } from "@/lib/actions/shopee"
import { PACK_SIZE_OPTIONS } from "@/lib/products/pack-sizes"
import type { UnmappedItem } from "@/lib/shopee/settings-actions"
import type { PackSize } from "@/lib/types/database.types"

const PACK_SIZE_LABELS: Record<PackSize, string> = {
  single: "单件",
  bundle_2: "2 件装",
  bundle_3: "3 件装",
  bundle_4: "4 件装",
}

type Product = ShopeeSettings["products"][number]

type Props = {
  unmappedItems: UnmappedItem[]
  mappings: ShopeeListingMapping[]
  products: Product[]
}

function productLabel(product: Product) {
  const name = product.variant ? `${product.name} · ${product.variant}` : product.name
  return product.status === "discontinued" ? `${name}（已停售）` : name
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
      if (result.success) toast.success(result.message ?? "已保存")
      else toast.error(result.error)
    })
  }

  const label = `${item.item_name || "未命名商品"}${item.model_name ? ` · ${item.model_name}` : ""}`

  return (
    <li className="px-5 py-4">
      <p className="font-semibold leading-snug">{label}</p>
      <p className="num mt-0.5 text-[12px] text-muted-foreground">
        商品 {item.item_id} / 款式 {item.model_id}
        {note ? ` · ${note}` : ""}
      </p>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_130px_auto]">
        <Select value={sku} onValueChange={setSku}>
          <SelectTrigger aria-label={`${label} 的 SKU`} className="col-span-2 sm:col-span-1">
            <SelectValue placeholder="选择 SKU" />
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
          <SelectTrigger aria-label={`${label} 的包装数量`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PACK_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {PACK_SIZE_LABELS[option.value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={save} disabled={saving || !sku || unchanged} className="h-11">
          {saving ? "保存中…" : "保存"}
        </Button>
      </div>
    </li>
  )
}

export function ListingMapEditor({ unmappedItems, mappings, products }: Props) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-display text-[19px] font-semibold">需要对应的商品</h2>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          {unmappedItems.length > 0
            ? `${unmappedItems.length} 个 Shopee 商品还没对应 SKU。配好之后，下次同步会自动补上这些订单。`
            : "所有同步到的 Shopee 商品都已经对应好了。"}
        </p>
        {unmappedItems.length > 0 && (
          <ul className="glass mt-3 divide-y divide-primary/[0.07] overflow-hidden rounded-[22px]">
            {unmappedItems.map((item) => (
              <MappingRow
                key={`${item.item_id}:${item.model_id}`}
                item={item}
                products={products}
                note={`${item.orderCount} 张订单在等`}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-[19px] font-semibold">已经对应好的商品</h2>
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
          <p className="mt-1 text-[13.5px] text-muted-foreground">还没有对应好的商品。</p>
        )}
      </section>
    </div>
  )
}
