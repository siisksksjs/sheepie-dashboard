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
  createSkuAdSetup,
  updateSkuAdSetup,
} from "@/lib/actions/ad-campaigns"
import type { Channel, Product, SkuAdSetup } from "@/lib/types/database.types"

type SetupFormProps = {
  mode: "create" | "edit"
  products: Product[]
  initialRecord?: SkuAdSetup | null
}

type SetupField =
  | "sku"
  | "channels"
  | "objective"
  | "daily_budget_cap"
  | "start_date"
  | "end_date"

const channelOptions: { value: Channel; label: string }[] = [
  { value: "shopee", label: "Shopee" },
  { value: "tokopedia", label: "Tokopedia" },
  { value: "tiktok", label: "TikTok" },
  { value: "offline", label: "Offline" },
]
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

function productOptionLabel(product: Product) {
  return product.variant
    ? `${product.sku} - ${product.name} (${product.variant})`
    : `${product.sku} - ${product.name}`
}

export function SetupForm({ mode, products, initialRecord }: SetupFormProps) {
  const router = useRouter()
  const submitLockRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SetupField, string>>>({})
  const [sku, setSku] = useState(initialRecord?.sku ?? "")
  const [channels, setChannels] = useState<Channel[]>(
    initialRecord?.channels ?? (initialRecord?.channel ? [initialRecord.channel] : []),
  )
  const [objective, setObjective] = useState(initialRecord?.objective ?? "")
  const [dailyBudgetCap, setDailyBudgetCap] = useState(
    initialRecord ? String(initialRecord.daily_budget_cap) : "",
  )
  const [startDate, setStartDate] = useState(initialRecord?.start_date ?? "")
  const [endDate, setEndDate] = useState(initialRecord?.end_date ?? "")
  const [notes, setNotes] = useState(initialRecord?.notes ?? "")

  const clearFieldError = (field: SetupField) => {
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
      const nextFieldErrors: Partial<Record<SetupField, string>> = {}

      if (!sku.trim()) {
        nextFieldErrors.sku = "SKU is required."
      }

      if (channels.length === 0) {
        nextFieldErrors.channels = "At least one channel is required."
      }

      if (!objective.trim()) {
        nextFieldErrors.objective = "Objective is required."
      }

      const parsedDailyBudgetCap = Number(dailyBudgetCap)
      if (!dailyBudgetCap.trim()) {
        nextFieldErrors.daily_budget_cap = "Daily budget cap is required."
      } else if (!Number.isFinite(parsedDailyBudgetCap)) {
        nextFieldErrors.daily_budget_cap = "Daily budget cap must be a valid number."
      } else if (parsedDailyBudgetCap < 0) {
        nextFieldErrors.daily_budget_cap = "Daily budget cap cannot be negative."
      }

      if (!startDate) {
        nextFieldErrors.start_date = "Start date is required."
      } else if (!isValidDateInput(startDate)) {
        nextFieldErrors.start_date = "Start date must be in YYYY-MM-DD format."
      }

      if (endDate && !isValidDateInput(endDate)) {
        nextFieldErrors.end_date = "End date must be in YYYY-MM-DD format."
      } else if (startDate && endDate && endDate < startDate) {
        nextFieldErrors.end_date = "End date cannot be earlier than start date."
      }

      if (Object.keys(nextFieldErrors).length > 0) {
        setFieldErrors(nextFieldErrors)
        return
      }

      if (mode === "edit" && !initialRecord) {
        setFormError("Setup record not found.")
        return
      }

      const editRecord = initialRecord

      const payload = {
        sku: sku.trim(),
        channels,
        objective: objective.trim(),
        daily_budget_cap: parsedDailyBudgetCap,
        start_date: startDate,
        end_date: endDate || null,
        notes,
      }

      const result =
        mode === "create"
          ? await createSkuAdSetup(payload)
          : await updateSkuAdSetup(editRecord!.id, payload)

      if (!result.success) {
        setFormError(result.error || "Failed to save SKU ad setup.")
        return
      }

      router.push("/ad-campaigns")
      router.refresh()
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to save SKU ad setup.",
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
            {mode === "create" ? "New SKU Ad Setup" : "Edit SKU Ad Setup"}
          </CardTitle>
          <CardDescription>
            Set the SKU, channel, and budget guardrails used by the ads workspace.
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
                <Label>
                  Channels <span className="text-destructive">*</span>
                </Label>
                <div
                  aria-invalid={fieldErrors.channels ? "true" : undefined}
                  aria-describedby={
                    fieldErrors.channels ? "channel-error" : undefined
                  }
                  className="grid gap-3 rounded-lg border p-4"
                >
                  {channelOptions.map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`setup-channel-${option.value}`}
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
                        htmlFor={`setup-channel-${option.value}`}
                        className="cursor-pointer font-normal"
                      >
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </div>
                {fieldErrors.channels ? (
                  <p id="channel-error" className="text-sm text-destructive">
                    {fieldErrors.channels}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Select every sales channel covered by this shared ads setup.
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="objective">
                  Objective <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="objective"
                  name="objective"
                  value={objective}
                  onChange={(event) => {
                    setObjective(event.target.value)
                    clearFieldError("objective")
                  }}
                  placeholder="GMV Max, SKU launch, clearance"
                  aria-invalid={fieldErrors.objective ? "true" : undefined}
                  aria-describedby={
                    fieldErrors.objective ? "objective-error" : undefined
                  }
                  required
                />
                {fieldErrors.objective ? (
                  <p id="objective-error" className="text-sm text-destructive">
                    {fieldErrors.objective}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="daily_budget_cap">
                  Daily Budget Cap <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="daily_budget_cap"
                  name="daily_budget_cap"
                  type="number"
                  min="0"
                  step="0.01"
                  value={dailyBudgetCap}
                  onChange={(event) => {
                    setDailyBudgetCap(event.target.value)
                    clearFieldError("daily_budget_cap")
                  }}
                  placeholder="250000"
                  aria-invalid={fieldErrors.daily_budget_cap ? "true" : undefined}
                  aria-describedby={
                    fieldErrors.daily_budget_cap
                      ? "daily-budget-cap-error"
                      : undefined
                  }
                  required
                />
                {fieldErrors.daily_budget_cap ? (
                  <p
                    id="daily-budget-cap-error"
                    className="text-sm text-destructive"
                  >
                    {fieldErrors.daily_budget_cap}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start_date">
                  Start Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="start_date"
                  name="start_date"
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value)
                    clearFieldError("start_date")
                    clearFieldError("end_date")
                  }}
                  aria-invalid={fieldErrors.start_date ? "true" : undefined}
                  aria-describedby={
                    fieldErrors.start_date ? "start-date-error" : undefined
                  }
                  required
                />
                {fieldErrors.start_date ? (
                  <p id="start-date-error" className="text-sm text-destructive">
                    {fieldErrors.start_date}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  name="end_date"
                  type="date"
                  value={endDate}
                  onChange={(event) => {
                    setEndDate(event.target.value)
                    clearFieldError("end_date")
                  }}
                  aria-invalid={fieldErrors.end_date ? "true" : undefined}
                  aria-describedby={fieldErrors.end_date ? "end-date-error" : undefined}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank for an open-ended setup.
                </p>
                {fieldErrors.end_date ? (
                  <p id="end-date-error" className="text-sm text-destructive">
                    {fieldErrors.end_date}
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
                placeholder="Anything the next update should know about this setup"
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
                    ? "Create Setup"
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
