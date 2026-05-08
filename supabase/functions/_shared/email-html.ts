// @ts-nocheck
type ShippingMode = "air" | "sea"

type RestockEmailEvent = {
  sku: string
  productName: string
  shippingMode: ShippingMode
  threshold: number
  previousStock: number
  currentStock: number
  leadTimeLabel: string
}

type SalesReportSkuRow = {
  sku: string
  name: string
  unitsSold: number
  revenue: number
  profit: number
}

type SalesReportChannelRow = {
  channel: string
  orders: number
  revenue: number
  profit: number
}

type LowStockRow = {
  sku: string
  productName: string
  shippingMode: ShippingMode
  threshold: number
  currentStock: number
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value).replace(/\s/g, "")
}

function formatMode(mode: ShippingMode) {
  return mode === "air" ? "Air" : "Sea"
}

function pageShell(title: string, body: string) {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f6f7f9;color:#111827;font-family:Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:20px;">
      ${body}
      <p style="margin:24px 0 0;color:#6b7280;font-size:12px;">Sent by Sheepie Dashboard.</p>
    </div>
  </body>
</html>`
}

export function renderRestockAlertEmailHtml(input: {
  title: string
  events: RestockEmailEvent[]
}) {
  const rows = input.events.map((event) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${escapeHtml(event.productName)}</strong><br /><span style="color:#6b7280;">${escapeHtml(event.sku)}</span></td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${formatMode(event.shippingMode)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${event.currentStock}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${event.threshold}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(event.leadTimeLabel)}</td>
    </tr>
  `).join("")

  return pageShell(input.title, `
    <h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;">${escapeHtml(input.title)}</h1>
    <p style="margin:0 0 18px;color:#4b5563;">The following SKU shipment routes crossed their reorder threshold.</p>
    <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;">
      <thead>
        <tr>
          <th align="left" style="padding:10px;border-bottom:1px solid #e5e7eb;">SKU</th>
          <th align="left" style="padding:10px;border-bottom:1px solid #e5e7eb;">Mode</th>
          <th align="right" style="padding:10px;border-bottom:1px solid #e5e7eb;">Stock</th>
          <th align="right" style="padding:10px;border-bottom:1px solid #e5e7eb;">Reorder</th>
          <th align="left" style="padding:10px;border-bottom:1px solid #e5e7eb;">Lead time</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `)
}

export function renderSalesReportEmailHtml(input: {
  title: string
  periodLabel: string
  totals: {
    orders: number
    unitsSold: number
    revenue: number
    cost: number
    profit: number
    returnedUnits: number
  }
  bySku: SalesReportSkuRow[]
  byChannel: SalesReportChannelRow[]
  lowStock: LowStockRow[]
}) {
  const skuRows = input.bySku.map((row) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${escapeHtml(row.name)}</strong><br /><span style="color:#6b7280;">${escapeHtml(row.sku)}</span></td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${row.unitsSold}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(row.revenue)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(row.profit)}</td>
    </tr>
  `).join("")
  const channelRows = input.byChannel.map((row) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(row.channel)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${row.orders}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(row.revenue)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(row.profit)}</td>
    </tr>
  `).join("")
  const lowStockRows = input.lowStock.map((row) => `
    <li>${escapeHtml(row.productName)} (${escapeHtml(row.sku)}) ${formatMode(row.shippingMode)}: ${row.currentStock} on hand, reorder at ${row.threshold}</li>
  `).join("")

  return pageShell(input.title, `
    <h1 style="margin:0 0 4px;font-size:24px;line-height:1.25;">${escapeHtml(input.title)}</h1>
    <p style="margin:0 0 18px;color:#4b5563;">${escapeHtml(input.periodLabel)}</p>
    <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;margin-bottom:18px;">
      <tbody>
        <tr><td style="padding:10px;">Orders</td><td style="padding:10px;text-align:right;"><strong>${input.totals.orders}</strong></td></tr>
        <tr><td style="padding:10px;">Units sold</td><td style="padding:10px;text-align:right;"><strong>${input.totals.unitsSold}</strong></td></tr>
        <tr><td style="padding:10px;">Revenue</td><td style="padding:10px;text-align:right;"><strong>${formatCurrency(input.totals.revenue)}</strong></td></tr>
        <tr><td style="padding:10px;">COGS</td><td style="padding:10px;text-align:right;"><strong>${formatCurrency(input.totals.cost)}</strong></td></tr>
        <tr><td style="padding:10px;">Profit</td><td style="padding:10px;text-align:right;"><strong>${formatCurrency(input.totals.profit)}</strong></td></tr>
        <tr><td style="padding:10px;">Returned units</td><td style="padding:10px;text-align:right;"><strong>${input.totals.returnedUnits}</strong></td></tr>
      </tbody>
    </table>
    <h2 style="font-size:18px;">Sales by SKU</h2>
    <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;margin-bottom:18px;"><tbody>${skuRows}</tbody></table>
    <h2 style="font-size:18px;">Sales by channel</h2>
    <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;margin-bottom:18px;"><tbody>${channelRows}</tbody></table>
    <h2 style="font-size:18px;">Low stock</h2>
    <ul style="background:#ffffff;border:1px solid #e5e7eb;margin:0;padding:14px 14px 14px 32px;">${lowStockRows || "<li>No monitored SKU routes are below threshold.</li>"}</ul>
  `)
}
