"use client"

import { useMemo, useState } from "react"

import { updateProductChannelPrices } from "@/lib/actions/products"
import type { Channel, ProductChannelPackPrice, ProductPackSize } from "@/lib/types/database.types"
import { PACK_SIZE_OPTIONS, type PackSize } from "@/lib/products/pack-sizes"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

const CHANNEL_OPTIONS: Array<{ value: Channel; label: string }> = [
  { value: "shopee", label: "Shopee" },
  { value: "tokopedia", label: "Tokopedia" },
  { value: "tiktok", label: "TikTok" },
  { value: "offline", label: "Offline" },
]

type Props = {
  sku: string
  packSizes: ProductPackSize[]
  channelPrices: ProductChannelPackPrice[]
}

function buildPriceKey(packSize: PackSize, channel: Channel) {
  return `${packSize}:${channel}`
}

export function ProductChannelPricing({ sku, packSizes, channelPrices }: Props) {
  const enabledPackSizes = useMemo(() => {
    return new Set(
      packSizes.filter((item) => item.is_enabled).map((item) => item.pack_size),
    )
  }, [packSizes])

  const initialValues = useMemo(() => {
    return PACK_SIZE_OPTIONS.reduce<Record<string, string>>((acc, pack) => {
      for (const channel of CHANNEL_OPTIONS) {
        const match = channelPrices.find(
          (row) => row.pack_size === pack.value && row.channel === channel.value,
        )
        acc[buildPriceKey(pack.value, channel.value)] = match
          ? String(match.default_selling_price)
          : "0"
      }

      return acc
    }, {})
  }, [channelPrices])

  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setPrice = (packSize: PackSize, channel: Channel, value: string) => {
    setValues((current) => ({
      ...current,
      [buildPriceKey(packSize, channel)]: value,
    }))
    setMessage(null)
    setError(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    setError(null)

    const payload = PACK_SIZE_OPTIONS.flatMap((pack) =>
      CHANNEL_OPTIONS.map((channel) => ({
        pack_size: pack.value,
        channel: channel.value,
        default_selling_price: Number(values[buildPriceKey(pack.value, channel.value)] || 0),
      })),
    )

    const result = await updateProductChannelPrices(sku, payload)

    if (!result.success) {
      setError(result.error || "Failed to save channel prices")
      setSaving(false)
      return
    }

    setMessage("Channel pricing updated.")
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Channel Price Matrix</CardTitle>
        <CardDescription>
          Set the default selling price by pack size and sales channel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pack Size</TableHead>
                {CHANNEL_OPTIONS.map((channel) => (
                  <TableHead key={channel.value}>{channel.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PACK_SIZE_OPTIONS.map((pack) => {
                const isEnabled = enabledPackSizes.has(pack.value)

                return (
                  <TableRow key={pack.value} className={!isEnabled ? "opacity-70" : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{pack.label}</span>
                        <Badge variant={isEnabled ? "success" : "outline"}>
                          {isEnabled ? "Enabled" : "Hidden"}
                        </Badge>
                      </div>
                    </TableCell>
                    {CHANNEL_OPTIONS.map((channel) => (
                      <TableCell key={channel.value}>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={values[buildPriceKey(pack.value, channel.value)] || "0"}
                          onChange={(event) => setPrice(pack.value, channel.value, event.target.value)}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
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
          {saving ? "Saving..." : "Save Channel Prices"}
        </Button>
      </CardContent>
    </Card>
  )
}
