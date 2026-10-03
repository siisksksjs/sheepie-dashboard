export const SAMPLE_REASONS = [
  "Influencer seeding",
  "PR",
  "Giveaway",
  "Other"
] as const
export const SAMPLE_PLATFORMS = [
  "TikTok",
  "Instagram",
  "YouTube",
  "Other"
] as const
export type SampleDetails = {
  recipient: string
  handle: string
  platform: string
  reason: string
  notes: string
}
export type SampleInput = SampleDetails & {
  sku: string
  quantity: number
  sentDate: string
}
const PREFIX = "Sample · "

export function prepareSample(value: unknown) {
  if (!value || typeof value !== "object")
    return { error: "Check the sample details and try again." } as const
  const fields = value as Record<string, unknown>
  if (
    [
      "sku",
      "sentDate",
      "recipient",
      "handle",
      "platform",
      "reason",
      "notes"
    ].some((key) => typeof fields[key] !== "string")
  )
    return { error: "Check the sample details and try again." } as const
  const input = value as SampleInput
  const details: SampleDetails = {
    recipient: input.recipient.trim(),
    handle: input.handle.trim(),
    platform: input.platform,
    reason: input.reason,
    notes: input.notes.trim()
  }
  if (!input.sku.trim() || input.sku.length > 128)
    return { error: "Choose a product." } as const
  if (!details.recipient || details.recipient.length > 120)
    return { error: "Enter a recipient name (up to 120 characters)." } as const
  if (
    !Number.isSafeInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 10000
  )
    return {
      error: "Enter a whole number of units between 1 and 10,000."
    } as const
  const date = new Date(`${input.sentDate}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.sentDate) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== input.sentDate
  )
    return { error: "Choose a valid sent date." } as const
  if (
    !(SAMPLE_PLATFORMS as readonly string[]).includes(details.platform) ||
    !(SAMPLE_REASONS as readonly string[]).includes(details.reason)
  )
    return { error: "Choose a platform and purpose." } as const
  if (details.handle.length > 200 || details.notes.length > 500)
    return {
      error: "Keep the account under 200 characters and notes under 500."
    } as const
  return {
    details,
    entry: {
      sku: input.sku.trim(),
      movement_type: "OUT_PROMO" as const,
      quantity: -input.quantity,
      entry_date: input.sentDate,
      reference: PREFIX + JSON.stringify(details)
    }
  } as const
}

/** Existing free-text promo references remain readable. Bundle expansion may append a suffix. */
export function parseSample(reference: string | null): SampleDetails | null {
  if (!reference?.startsWith(PREFIX)) return null
  try {
    const text = reference
      .slice(PREFIX.length)
      .replace(/ \(Bundle: [^\n]*\)$/, "")
    const value = JSON.parse(text)
    if (
      typeof value.recipient !== "string" ||
      typeof value.handle !== "string" ||
      typeof value.platform !== "string" ||
      typeof value.reason !== "string" ||
      typeof value.notes !== "string"
    )
      return null
    return value as SampleDetails
  } catch {
    return null
  }
}
