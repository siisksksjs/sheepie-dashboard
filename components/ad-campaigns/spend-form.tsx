"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import {
  updateMonthlyAdSpend,
  upsertMonthlyAdSpend,
} from "@/lib/actions/ad-campaigns"
import type { Channel, MonthlyAdSpend, Product } from "@/lib/types/database.types"

type SpendFormProps = {
  mode: "create" | "edit"
  products: Product[]
  initialRecord?: MonthlyAdSpend | null
}

type SpendField = "month" | "sku" | "channels" | "actual_spend"

const channelOptions: { value: Channel; label: string }[] = [
  { value: "shopee", label: "Shopee" },
  { value: "tokopedia", label: "Tokopedia" },
  { value: "tiktok", label: "TikTok" },
  { value: "offline", label: "Offline" },
]
const MONTH_PATTERN = /^\d{4}-\d{2}$/

export function isValidMonthInput(value: string) {
  if (!MONTH_PATTERN.test(value)) {
    return false
  }

  const [, month] = value.split("-").map(Number)
  return month >= 1 && month <= 12
}

function monthInputValue(value?: string | null) {
  if (!value) {
    return ""
  }

  return value.slice(0, 7)
}

function normalizeMonthInput(value: string) {
  if (/^\d{4}-\d{2}$/.test(value)) {
    return `${value}-01`
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value.slice(0, 7)}-01`
  }

  return value
}

function productOptionLabel(product: Product) {
  return product.variant
    ? `${product.sku} - ${product.name} (${product.variant})`
    : `${product.sku} - ${product.name}`
}

export function SpendForm({ mode, products, initialRecord }: SpendFormProps) {
  const router = useRouter()
  const submitLockRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SpendField, string>>>({})
  const [month, setMonth] = useState(monthInputValue(initialRecord?.month))
  const [sku, setSku] = useState(initialRecord?.sku ?? "")
  const [channels, setChannels] = useState<Channel[]>(initialRecord?.channels ?? [])
  const [actualSpend, setActualSpend] = useState(
    initialRecord ? String(initialRecord.actual_spend) : "",
  )
  const [notes, setNotes] = useState(initialRecord?.notes ?? "")

  const clearFieldError = (field: SpendField) => {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current
      }

      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitLockRef.current) {
      return
    }

    submitLockRef.current = true
    setSaving(true)
    setFormError(null)
    try {
      const nextFieldErrors: Partial<Record<SpendField, string>> = {}

      if (!month) {
        nextFieldErrors.month = "Month is required."
      } else if (!isValidMonthInput(month)) {
        nextFieldErrors.month = "Month must be in YYYY-MM format."
      }

      if (!sku.trim()) {
        nextFieldErrors.sku = "SKU is required."
      }

      if (channels.length === 0) {
        nextFieldErrors.channels = "At least one channel is required."
      }

      const parsedActualSpend = Number(actualSpend)
      if (!actualSpend.trim()) {
        nextFieldErrors.actual_spend = "Actual spend is required."
      } else if (!Number.isFinite(parsedActualSpend)) {
        nextFieldErrors.actual_spend = "Actual spend must be a valid number."
      } else if (parsedActualSpend < 0) {
        nextFieldErrors.actual_spend = "Actual spend cannot be negative."
      }

      if (Object.keys(nextFieldErrors).length > 0) {
        setFieldErrors(nextFieldErrors)
        return
      }

      if (mode === "edit" && !initialRecord) {
        setFormError("Spend record not found.")
        return
      }

      const editRecord = initialRecord

      const payload = {
        month: normalizeMonthInput(month),
        sku: sku.trim(),
        channels,
        actual_spend: parsedActualSpend,
        notes,
      }

      const result =
        mode === "create"
          ? await upsertMonthlyAdSpend(payload)
          : await updateMonthlyAdSpend(editRecord!.id, payload)

      if (!result.success) {
        setFormError(result.error || "Failed to save monthly spend.")
        return
      }

      router.push("/ad-campaigns")
      router.refresh()
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to save monthly spend.",
      )
    } finally {
      submitLockRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Button asChild variant="ghost" className="px-0">
        <Link href="/ad-campaigns">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Ad Campaigns
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "create" ? "New Monthly Spend" : "Edit Monthly Spend"}
          </CardTitle>
          <CardDescription>
            Capture the reconciled spend row for a SKU-channel month bucket.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="month">
                  Month <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="month"
                  name="month"
                  type="month"
                  value={month}
                  onChange={(event) => {
                    setMonth(event.target.value)
                    clearFieldError("month")
                  }}
                  aria-invalid={fieldErrors.month ? "true" : undefined}
                  aria-describedby={fieldErrors.month ? "month-error" : undefined}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Stored as the first day of the month for reporting.
                </p>
                {fieldErrors.month ? (
                  <p id="month-error" className="text-sm text-destructive">
                    {fieldErrors.month}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="actual_spend">
                  Actual Spend <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="actual_spend"
                  name="actual_spend"
                  type="number"
                  min="0"
                  step="0.01"
                  value={actualSpend}
                  onChange={(event) => {
                    setActualSpend(event.target.value)
                    clearFieldError("actual_spend")
                  }}
                  placeholder="410000"
                  aria-invalid={fieldErrors.actual_spend ? "true" : undefined}
                  aria-describedby={
                    fieldErrors.actual_spend ? "actual-spend-error" : undefined
                  }
                  required
                />
                {fieldErrors.actual_spend ? (
                  <p id="actual-spend-error" className="text-sm text-destructive">
                    {fieldErrors.actual_spend}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sku">
                  SKU <span className="text-destructive">*</span>
                </Label>
                <Select
                  name="sku"
                  value={sku}
                  onValueChange={(value) => {
                    setSku(value)
                    clearFieldError("sku")
                  }}
                  required
                >
                  <SelectTrigger
                    id="sku"
                    aria-invalid={fieldErrors.sku ? "true" : undefined}
                    aria-describedby={fieldErrors.sku ? "sku-error" : undefined}
                  >
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.sku}>
                        {productOptionLabel(product)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.sku ? (
                  <p id="sku-error" className="text-sm text-destructive">
                    {fieldErrors.sku}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>
                  Channels <span className="text-destructive">*</span>
                </Label>
                <div
                  aria-invalid={fieldErrors.channels ? "true" : undefined}
                  aria-describedby={
                    fieldErrors.channels ? "spend-channels-error" : undefined
                  }
                  className="grid gap-3 rounded-lg border p-4"
                >
                  {channelOptions.map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`spend-channel-${option.value}`}
                        checked={channels.includes(option.value)}
                        onCheckedChange={(checked) => {
                          setChannels((current) =>
                            checked
                              ? current.includes(option.value)
                                ? current
                                : [...current, option.value]
                              : current.filter((channel) => channel !== option.value),
                          )
                          clearFieldError("channels")
                        }}
                      />
                      <Label
                        htmlFor={`spend-channel-${option.value}`}
                        className="cursor-pointer font-normal"
                      >
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </div>
                {fieldErrors.channels ? (
                  <p id="spend-channels-error" className="text-sm text-destructive">
                    {fieldErrors.channels}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Select every sales channel covered by this shared monthly spend row.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Reconciliation notes, invoice references, anomalies"
                rows={4}
              />
            </div>

            {formError ? (
              <div
                role="alert"
                aria-live="polite"
                className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {formError}
              </div>
            ) : null}

            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving
                  ? mode === "create"
                    ? "Creating..."
                    : "Saving..."
                  : mode === "create"
                    ? "Create Spend Row"
                    : "Save Changes"}
              </Button>
              <Button asChild type="button" variant="outline">
                <Link href="/ad-campaigns">
                  Cancel
                </Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
