import type { ChangelogItemInput } from "@/lib/actions/changelog"

function formatPrimitive(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : null
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No"
  }

  if (Array.isArray(value)) {
    const flattened = value
      .map((entry) => formatPrimitive(entry))
      .filter((entry): entry is string => Boolean(entry))
    return flattened.length > 0 ? flattened.join(", ") : null
  }

  return JSON.stringify(value)
}

export function buildChangeItem(
  fieldName: string,
  oldValue: unknown,
  newValue: unknown
): ChangelogItemInput | null {
  const oldFormatted = formatPrimitive(oldValue)
  const newFormatted = formatPrimitive(newValue)

  if (oldFormatted === newFormatted) {
    return null
  }

  return {
    field_name: fieldName,
    old_value: oldFormatted,
    new_value: newFormatted,
  }
}

export function summarizeLineItems(
  lineItems: Array<{ sku: string; quantity: number; selling_price?: number }>
) {
  return lineItems
    .map((item) => {
      const priceSuffix =
        typeof item.selling_price === "number" ? ` @ ${item.selling_price}` : ""
      return `${item.sku} x${item.quantity}${priceSuffix}`
    })
    .join("; ")
}
