"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  createManualChangelogEntry,
  updateChangelogEntry,
  type ChangelogItemInput,
} from "@/lib/actions/changelog"
import type { ChangelogEntryWithItems, ChangelogSource } from "@/lib/types/database.types"
import Link from "next/link"

type FormItem = {
  id: string
  field_name: string
  old_value: string
  new_value: string
}

type ChangelogFormProps = {
  mode: "create" | "edit"
  initialEntry?: ChangelogEntryWithItems | null
}

function createEmptyItem(): FormItem {
  return {
    id: crypto.randomUUID(),
    field_name: "",
    old_value: "",
    new_value: "",
  }
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value)
  const pad = (part: number) => part.toString().padStart(2, "0")

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function ChangelogForm({ mode, initialEntry }: ChangelogFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loggedAt, setLoggedAt] = useState(
    toDateTimeLocalValue(initialEntry?.logged_at || new Date().toISOString())
  )
  const [source, setSource] = useState<ChangelogSource>(initialEntry?.source || "manual")
  const [area, setArea] = useState(initialEntry?.area || "")
  const [actionSummary, setActionSummary] = useState(initialEntry?.action_summary || "")
  const [entityType, setEntityType] = useState(initialEntry?.entity_type || "")
  const [entityId, setEntityId] = useState(initialEntry?.entity_id || "")
  const [entityLabel, setEntityLabel] = useState(initialEntry?.entity_label || "")
  const [notes, setNotes] = useState(initialEntry?.notes || "")
  const [items, setItems] = useState<FormItem[]>(
    initialEntry?.changelog_items?.length
      ? initialEntry.changelog_items.map((item) => ({
          id: item.id,
          field_name: item.field_name,
          old_value: item.old_value || "",
          new_value: item.new_value || "",
        }))
      : [createEmptyItem()]
  )

  const setItemValue = (id: string, field: keyof Omit<FormItem, "id">, value: string) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    )
  }

  const addItem = () => {
    setItems((current) => [...current, createEmptyItem()])
  }

  const removeItem = (id: string) => {
    setItems((current) => {
      if (current.length === 1) {
        return [createEmptyItem()]
      }
      return current.filter((item) => item.id !== id)
    })
  }

  const normalizeItems = (): ChangelogItemInput[] => {
    const preparedItems = items
      .map((item) => ({
        field_name: item.field_name.trim(),
        old_value: item.old_value.trim() || null,
        new_value: item.new_value.trim() || null,
      }))
      .filter((item) => item.field_name || item.old_value || item.new_value)

    if (preparedItems.some((item) => !item.field_name)) {
      throw new Error("Each change item needs a field name.")
    }

    if (preparedItems.length === 0) {
      throw new Error("Add at least one change item.")
    }

    return preparedItems
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const preparedItems = normalizeItems()
      const payload = {
        logged_at: new Date(loggedAt).toISOString(),
        source,
        area,
        action_summary: actionSummary,
        entity_type: entityType,
        entity_id: entityId || null,
        entity_label: entityLabel,
        notes: notes || null,
        items: preparedItems,
      }

      const result =
        mode === "create"
          ? await createManualChangelogEntry(payload)
          : await updateChangelogEntry(initialEntry!.id, payload)

      if (!result.success) {
        setError(result.error || "Failed to save changelog entry.")
        setLoading(false)
        return
      }

      router.push("/changelog")
      router.refresh()
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Failed to save changelog entry."
      )
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/changelog">
        <Button variant="ghost" className="px-0">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Changelog
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "create" ? "New Changelog Entry" : "Edit Changelog Entry"}
          </CardTitle>
          <CardDescription>
            Capture external manual changes and adjust any auto-generated log when the wording needs cleanup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="logged_at">
                  Date & Time <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="logged_at"
                  type="datetime-local"
                  value={loggedAt}
                  onChange={(event) => setLoggedAt(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="source">
                  Source <span className="text-destructive">*</span>
                </Label>
                <Select value={source} onValueChange={(value) => setSource(value as ChangelogSource)}>
                  <SelectTrigger id="source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="automatic">Automatic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="area">
                  Area <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="area"
                  value={area}
                  onChange={(event) => setArea(event.target.value)}
                  placeholder="ads, inventory, orders, products"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="action_summary">
                  Action Summary <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="action_summary"
                  value={actionSummary}
                  onChange={(event) => setActionSummary(event.target.value)}
                  placeholder="Updated Shopee Calmicloud settings"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="entity_type">
                  Entity Type <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="entity_type"
                  value={entityType}
                  onChange={(event) => setEntityType(event.target.value)}
                  placeholder="store, campaign, order, product"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="entity_id">Entity ID</Label>
                <Input
                  id="entity_id"
                  value={entityId}
                  onChange={(event) => setEntityId(event.target.value)}
                  placeholder="Optional internal ID"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="entity_label">
                  Entity Label <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="entity_label"
                  value={entityLabel}
                  onChange={(event) => setEntityLabel(event.target.value)}
                  placeholder="Shopee Calmicloud"
                  required
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Change Items</h2>
                  <p className="text-sm text-muted-foreground">
                    Add one or more before/after values under the same operational event.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={addItem}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Change
                </Button>
              </div>

              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={item.id} className="rounded-2xl border bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold">Change #{index + 1}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove change ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Field</Label>
                        <Input
                          value={item.field_name}
                          onChange={(event) => setItemValue(item.id, "field_name", event.target.value)}
                          placeholder="Target ROAS"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Old Value</Label>
                        <Input
                          value={item.old_value}
                          onChange={(event) => setItemValue(item.id, "old_value", event.target.value)}
                          placeholder="6"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>New Value</Label>
                        <Input
                          value={item.new_value}
                          onChange={(event) => setItemValue(item.id, "new_value", event.target.value)}
                          placeholder="8"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                placeholder="Optional context, reason for change, or follow-up."
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={loading}>
                {loading
                  ? mode === "create"
                    ? "Saving..."
                    : "Updating..."
                  : mode === "create"
                    ? "Create Entry"
                    : "Save Changes"}
              </Button>
              <Link href="/changelog">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
