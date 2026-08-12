import type { MovementType } from "@/lib/types/database.types"

const EXPANDABLE_OUTBOUND_MOVEMENTS = new Set<MovementType>([
  "OUT_SALE",
  "OUT_PROMO",
  "OUT_DAMAGE",
])

type LedgerEntryInput = {
  sku: string
  movement_type: MovementType
  quantity: number
  reference: string | null
  entry_date?: string | null
}

type BundleCompositionInput = {
  component_sku: string
  quantity: number
}

export type InventoryLedgerInsertRow = {
  sku: string
  movement_type: MovementType
  quantity: number
  reference: string | null
  entry_date?: string
  created_by: string | null
}

type BuildInventoryLedgerRowsInput = {
  formData: LedgerEntryInput
  createdBy: string | null
  isBundle: boolean
  compositions: BundleCompositionInput[]
}

function withOptionalEntryDate(
  row: Omit<InventoryLedgerInsertRow, "entry_date">,
  entryDate?: string | null,
): InventoryLedgerInsertRow {
  return entryDate ? { ...row, entry_date: entryDate } : row
}

export function buildInventoryLedgerRows(input: BuildInventoryLedgerRowsInput): {
  rows: InventoryLedgerInsertRow[]
  error: string | null
} {
  const { formData } = input
  const shouldExpand = input.isBundle
    && EXPANDABLE_OUTBOUND_MOVEMENTS.has(formData.movement_type)

  if (!shouldExpand) {
    return {
      rows: [withOptionalEntryDate({
        sku: formData.sku,
        movement_type: formData.movement_type,
        quantity: formData.quantity,
        reference: formData.reference,
        created_by: input.createdBy,
      }, formData.entry_date)],
      error: null,
    }
  }

  if (input.compositions.length === 0) {
    return {
      rows: [],
      error: `Bundle ${formData.sku} has no component composition`,
    }
  }

  const bundleReference = formData.reference
    ? `${formData.reference} (Bundle: ${formData.sku})`
    : `Bundle: ${formData.sku}`

  return {
    rows: input.compositions.map((composition) => withOptionalEntryDate({
      sku: composition.component_sku,
      movement_type: formData.movement_type,
      quantity: formData.quantity * composition.quantity,
      reference: bundleReference,
      created_by: input.createdBy,
    }, formData.entry_date)),
    error: null,
  }
}
