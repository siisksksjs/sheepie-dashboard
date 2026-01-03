"use server"

import { createClient } from "@/lib/supabase/server"
import { createProduct } from "./products"
import { createOrder } from "./orders"
import { createLedgerEntry } from "./inventory"

// CSV parsing utility
function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split('\n')
  if (lines.length === 0) return []

  const headers = lines[0].split(',').map(h => h.trim())
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    const row: Record<string, string> = {}

    headers.forEach((header, index) => {
      row[header] = values[index] || ''
    })

    rows.push(row)
  }

  return rows
}

/**
 * Import products from CSV
 * CSV Format:
 * sku,name,variant,cost_per_unit,reorder_point,is_bundle,status
 */
export async function importProducts(csvText: string) {
  const rows = parseCSV(csvText)
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  }

  for (const row of rows) {
    try {
      const result = await createProduct({
        sku: row.sku,
        name: row.name,
        variant: row.variant || null,
        cost_per_unit: parseFloat(row.cost_per_unit),
        reorder_point: parseInt(row.reorder_point) || 0,
        is_bundle: row.is_bundle === 'true' || row.is_bundle === '1',
        status: (row.status as 'active' | 'discontinued') || 'active',
      })

      if (result.success) {
        results.success++
      } else {
        results.failed++
        results.errors.push(`${row.sku}: ${result.error}`)
      }
    } catch (error: any) {
      results.failed++
      results.errors.push(`${row.sku}: ${error.message}`)
    }
  }

  return results
}

/**
 * Import initial stock levels
 * CSV Format:
 * sku,quantity,reference,entry_date (optional)
 */
export async function importInitialStock(csvText: string) {
  const rows = parseCSV(csvText)
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  }

  for (const row of rows) {
    try {
      const quantity = parseInt(row.quantity)

      if (quantity > 0) {
        const result = await createLedgerEntry({
          sku: row.sku,
          movement_type: 'IN_PURCHASE',
          quantity: quantity,
          reference: row.reference || 'Initial stock import from Notion',
          entry_date: row.entry_date || null,
        })

        if (result.success) {
          results.success++
        } else {
          results.failed++
          results.errors.push(`${row.sku}: ${result.error}`)
        }
      }
    } catch (error: any) {
      results.failed++
      results.errors.push(`${row.sku}: ${error.message}`)
    }
  }

  return results
}

/**
 * Import historical orders
 * CSV Format:
 * order_id,channel,order_date,sku,quantity,selling_price,channel_fees,notes,status
 */
export async function importOrders(csvText: string) {
  const rows = parseCSV(csvText)
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  }

  // Group rows by order_id to handle multi-line orders
  const orderGroups = new Map<string, typeof rows>()

  for (const row of rows) {
    const orderId = row.order_id
    if (!orderGroups.has(orderId)) {
      orderGroups.set(orderId, [])
    }
    orderGroups.get(orderId)!.push(row)
  }

  // Create orders
  for (const [orderId, orderRows] of orderGroups) {
    try {
      const firstRow = orderRows[0]

      // Build line items
      const line_items = orderRows.map(row => ({
        sku: row.sku,
        quantity: parseInt(row.quantity),
        selling_price: parseFloat(row.selling_price),
      }))

      const result = await createOrder({
        order_id: orderId,
        channel: firstRow.channel as any,
        order_date: firstRow.order_date,
        status: (firstRow.status as any) || 'paid',
        channel_fees: firstRow.channel_fees ? parseFloat(firstRow.channel_fees) : null,
        notes: firstRow.notes || null,
        line_items,
      })

      if (result.success) {
        results.success++
      } else {
        results.failed++
        results.errors.push(`${orderId}: ${result.error}`)
      }
    } catch (error: any) {
      results.failed++
      results.errors.push(`${orderId}: ${error.message}`)
    }
  }

  return results
}

/**
 * Generate CSV templates
 */
export async function getImportTemplates() {
  return {
    products: [
      'sku,name,variant,cost_per_unit,reorder_point,is_bundle,status',
      'CERVI-PILLOW,CerviCloud Pillow,,192000,10,false,active',
      'CERVI-CASE,CerviCloud Pillow Case,,40000,20,false,active',
    ].join('\n'),

    stock: [
      'sku,quantity,reference,entry_date',
      'CERVI-PILLOW,100,Initial stock from warehouse count,2024-01-01',
      'CERVI-CASE,200,Initial stock from warehouse count,2024-01-01',
    ].join('\n'),

    orders: [
      'order_id,channel,order_date,sku,quantity,selling_price,channel_fees,notes,status',
      'ORD-001,tokopedia,2025-01-01,CERVI-PILLOW,1,198000,5000,,paid',
      'ORD-002,shopee,2025-01-02,CERVI-CASE,2,45000,3000,,paid',
    ].join('\n'),
  }
}

/**
 * Get mapping guide from Notion to CSV
 */
export async function getNotionMappingGuide() {
  return {
    products: {
      description: 'Map from "Modal Product" table in Notion',
      mapping: {
        sku: 'Create SKU (e.g., CERVI-PILLOW, LUMI-MASK, CALM-EARPLUG)',
        name: 'Items/Products column (e.g., CerviCloud)',
        variant: 'Leave blank or specify variant',
        cost_per_unit: 'COGS value (e.g., 192000 for CerviCloud)',
        reorder_point: 'Set based on your needs (e.g., 10)',
        is_bundle: 'false (for single products)',
        status: 'active',
      },
      example_rows: [
        'CERVI-PILLOW,CerviCloud Pillow,,192000,10,false,active',
        'CERVI-CASE,CerviCloud Pillow Case,,40000,20,false,active',
        'LUMI-MASK,LumiCloud EyeMask,,4000,30,false,active',
        'CALM-EARPLUG,CalmCloud EarPlug,,4000,30,false,active',
      ],
    },
    orders: {
      description: 'Map from product tables (CerviCloud Pillow, etc.)',
      mapping: {
        order_id: 'Create unique ID: {Channel}-{Date}-{Sequence} (e.g., TOKO-20250101-001)',
        channel: 'Account column → lowercase (tokopedia, shopee, offline, tiktok)',
        order_date: 'Date column → YYYY-MM-DD format',
        sku: 'Match to product SKU you created',
        quantity: 'Quantity column',
        selling_price: 'Price column',
        channel_fees: 'Calculate from your channel fee % or leave blank',
        notes: 'Notes column if any',
        status: 'paid (for historical completed orders)',
      },
      example_rows: [
        'TOKO-20260101-001,tokopedia,2026-01-01,CERVI-PILLOW,1,198000,5000,,paid',
        'SHOPEE-20251225-001,shopee,2025-12-25,CERVI-CASE,1,45000,3000,,paid',
      ],
    },
  }
}

/**
 * Clear all ledger and order data
 * WARNING: This is destructive! Use only for testing/development
 */
export async function clearLedgerAndOrders() {
  const supabase = await createClient()

  try {
    // Delete in correct order due to foreign key constraints
    // 1. Delete order line items first
    const { error: lineItemsError } = await supabase
      .from('order_line_items')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all rows

    if (lineItemsError) {
      return {
        success: false,
        error: `Failed to delete order line items: ${lineItemsError.message}`,
      }
    }

    // 2. Delete orders
    const { error: ordersError } = await supabase
      .from('orders')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all rows

    if (ordersError) {
      return {
        success: false,
        error: `Failed to delete orders: ${ordersError.message}`,
      }
    }

    // 3. Delete ledger entries using TRUNCATE to bypass the delete trigger
    const { error: ledgerError } = await supabase.rpc('clear_ledger')

    if (ledgerError) {
      // Fallback: Try direct SQL if RPC doesn't exist
      const { error: directError } = await supabase
        .from('inventory_ledger')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      if (directError) {
        return {
          success: false,
          error: `Failed to delete ledger: ${directError.message}. You may need to run: TRUNCATE inventory_ledger CASCADE;`,
        }
      }
    }

    return {
      success: true,
      message: 'All ledger and order data cleared successfully',
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    }
  }
}
