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
import { Textarea } from "@/components/ui/textarea"
import {
  createSkuSalesTarget,
  updateSkuSalesTarget,
} from "@/lib/actions/ad-campaigns"
import type { Product, SkuSalesTarget } from "@/lib/types/database.types"

type TargetFormProps = {
  mode: "create" | "edit"
  products: Product[]
  initialRecord?: SkuSalesTarget | null
}

type TargetField =
  | "sku"
  | "daily_target_units"
  | "effective_from"
  | "effective_to"

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isValidDateInput(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false
  }

  const [year, month, day] = value.split("-").map(Number)
  const parsedDate = new Date(Date.UTC(year, month - 1, day))

  return (
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day
  )
}

export function isWholeUnitValue(value: number) {
  return Number.isInteger(value)
}

function productOptionLabel(product: Product) {
  return product.variant
    ? `${product.sku} - ${product.name} (${product.variant})`
    : `${product.sku} - ${product.name}`
}

export function TargetForm({ mode, products, initialRecord }: TargetFormProps) {
  const router = useRouter()
  const submitLockRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<TargetField, string>>>({})
  const [sku, setSku] = useState(initialRecord?.sku ?? "")
  const [dailyTargetUnits, setDailyTargetUnits] = useState(
    initialRecord ? String(initialRecord.daily_target_units) : "",
  )
  const [effectiveFrom, setEffectiveFrom] = useState(initialRecord?.effective_from ?? "")
  const [effectiveTo, setEffectiveTo] = useState(initialRecord?.effective_to ?? "")
  const [notes, setNotes] = useState(initialRecord?.notes ?? "")

  const clearFieldError = (field: TargetField) => {
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
      const nextFieldErrors: Partial<Record<TargetField, string>> = {}

      if (!sku.trim()) {
        nextFieldErrors.sku = "SKU is required."
      }

      const parsedDailyTargetUnits = Number(dailyTargetUnits)
      if (!dailyTargetUnits.trim()) {
        nextFieldErrors.daily_target_units = "Daily target units is required."
      } else if (!Number.isFinite(parsedDailyTargetUnits)) {
        nextFieldErrors.daily_target_units = "Daily target units must be a valid number."
      } else if (!isWholeUnitValue(parsedDailyTargetUnits)) {
        nextFieldErrors.daily_target_units = "Daily target units must be a whole number."
      } else if (parsedDailyTargetUnits < 0) {
        nextFieldErrors.daily_target_units = "Daily target units cannot be negative."
      }

      if (!effectiveFrom) {
        nextFieldErrors.effective_from = "Effective from is required."
      } else if (!isValidDateInput(effectiveFrom)) {
        nextFieldErrors.effective_from = "Effective from must be in YYYY-MM-DD format."
      }

      if (effectiveTo && !isValidDateInput(effectiveTo)) {
        nextFieldErrors.effective_to = "Effective to must be in YYYY-MM-DD format."
      } else if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
        nextFieldErrors.effective_to =
          "Effective to cannot be earlier than effective from."
      }

      if (Object.keys(nextFieldErrors).length > 0) {
        setFieldErrors(nextFieldErrors)
        return
      }

      if (mode === "edit" && !initialRecord) {
        setFormError("Target record not found.")
        return
      }

      const editRecord = initialRecord

      const payload = {
        sku: sku.trim(),
        daily_target_units: parsedDailyTargetUnits,
        effective_from: effectiveFrom,
        effective_to: effectiveTo || null,
        notes,
      }

      const result =
        mode === "create"
          ? await createSkuSalesTarget(payload)
          : await updateSkuSalesTarget(editRecord!.id, payload)

      if (!result.success) {
        setFormError(result.error || "Failed to save sales target.")
        return
      }

      router.push("/ad-campaigns")
      router.refresh()
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to save sales target.",
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
            {mode === "create" ? "New SKU Sales Target" : "Edit SKU Sales Target"}
          </CardTitle>
          <CardDescription>
            Define the daily unit target and the date window it applies to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
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
                <Label htmlFor="daily_target_units">
                  Daily Target Units <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="daily_target_units"
                  name="daily_target_units"
                  type="number"
                  min="0"
                  step="1"
                  value={dailyTargetUnits}
                  onChange={(event) => {
                    setDailyTargetUnits(event.target.value)
                    clearFieldError("daily_target_units")
                  }}
                  placeholder="12"
                  aria-invalid={fieldErrors.daily_target_units ? "true" : undefined}
                  aria-describedby={
                    fieldErrors.daily_target_units
                      ? "daily-target-units-error"
                      : undefined
                  }
                  required
                />
                {fieldErrors.daily_target_units ? (
                  <p
                    id="daily-target-units-error"
                    className="text-sm text-destructive"
                  >
                    {fieldErrors.daily_target_units}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="effective_from">
                  Effective From <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="effective_from"
                  name="effective_from"
                  type="date"
                  value={effectiveFrom}
                  onChange={(event) => {
                    setEffectiveFrom(event.target.value)
                    clearFieldError("effective_from")
                    clearFieldError("effective_to")
                  }}
                  aria-invalid={fieldErrors.effective_from ? "true" : undefined}
                  aria-describedby={
                    fieldErrors.effective_from
                      ? "effective-from-error"
                      : undefined
                  }
                  required
                />
                {fieldErrors.effective_from ? (
                  <p id="effective-from-error" className="text-sm text-destructive">
                    {fieldErrors.effective_from}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="effective_to">Effective To</Label>
                <Input
                  id="effective_to"
                  name="effective_to"
                  type="date"
                  value={effectiveTo}
                  onChange={(event) => {
                    setEffectiveTo(event.target.value)
                    clearFieldError("effective_to")
                  }}
                  aria-invalid={fieldErrors.effective_to ? "true" : undefined}
                  aria-describedby={
                    fieldErrors.effective_to ? "effective-to-error" : undefined
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to keep this target active until replaced.
                </p>
                {fieldErrors.effective_to ? (
                  <p id="effective-to-error" className="text-sm text-destructive">
                    {fieldErrors.effective_to}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notes for promotions, seasonality, or target assumptions"
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
                    ? "Create Target"
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
