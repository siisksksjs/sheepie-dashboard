"use client"

import { useMemo, useState } from "react"

import { updateProductPackSettings } from "@/lib/actions/products"
import type { ProductPackSize } from "@/lib/types/database.types"
import { PACK_SIZE_OPTIONS, type PackSize } from "@/lib/products/pack-sizes"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

type Props = {
  sku: string
  packSizes: ProductPackSize[]
  onSaved: (packSizes: ProductPackSize[]) => void
}

export function ProductPackSettings({ sku, packSizes, onSaved }: Props) {
  const initialSelection = useMemo(() => {
    return PACK_SIZE_OPTIONS.reduce<Record<PackSize, boolean>>((acc, pack) => {
      acc[pack.value] = packSizes.some(
        (item) => item.pack_size === pack.value && item.is_enabled,
      )
      return acc
    }, {} as Record<PackSize, boolean>)
  }, [packSizes])

  const [selection, setSelection] = useState<Record<PackSize, boolean>>(initialSelection)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const togglePackSize = (packSize: PackSize, checked: boolean) => {
    setSelection((current) => ({
      ...current,
      [packSize]: checked,
    }))
    setMessage(null)
    setError(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    setError(null)

    const enabledPackSizes = PACK_SIZE_OPTIONS
      .filter((pack) => selection[pack.value])
      .map((pack) => pack.value)

    const result = await updateProductPackSettings(sku, enabledPackSizes)

    if (!result.success) {
      setError(result.error || "Failed to save pack settings")
      setSaving(false)
      return
    }

    const nextPackSizes = PACK_SIZE_OPTIONS.map((pack) => {
      const existing = packSizes.find((item) => item.pack_size === pack.value)

      return {
        id: existing?.id || `${sku}-${pack.value}`,
        sku,
        pack_size: pack.value,
        is_enabled: selection[pack.value],
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    })

    onSaved(nextPackSizes)
    setMessage("Pack settings updated.")
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pack Sizes</CardTitle>
        <CardDescription>
          Control which pack variants can be used for this SKU in order entry.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-lg border p-4">
          {PACK_SIZE_OPTIONS.map((pack) => (
            <div key={pack.value} className="flex items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id={`${sku}-${pack.value}`}
                  checked={selection[pack.value]}
                  onCheckedChange={(checked) => togglePackSize(pack.value, checked === true)}
                />
                <Label htmlFor={`${sku}-${pack.value}`} className="cursor-pointer font-normal">
                  {pack.label}
                </Label>
              </div>
              <span className="text-xs text-muted-foreground">
                Consumes {pack.multiplier} unit{pack.multiplier > 1 ? "s" : ""} per order quantity
              </span>
            </div>
          ))}
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-success-foreground">
            {message}
          </div>
        ) : null}

        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Pack Sizes"}
        </Button>
      </CardContent>
    </Card>
  )
}
