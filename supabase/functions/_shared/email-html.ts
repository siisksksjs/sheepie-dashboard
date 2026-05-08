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

type RestockEmailSkuGroup = {
  sku: string
  productName: string
  events: RestockEmailEvent[]
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

function groupRestockEventsBySku(events: RestockEmailEvent[]): RestockEmailSkuGroup[] {
  const groups = new Map<string, RestockEmailSkuGroup>()

  for (const event of events) {
    const existing = groups.get(event.sku)

    if (existing) {
      existing.events.push(event)
      continue
    }

    groups.set(event.sku, {
      sku: event.sku,
      productName: event.productName,
      events: [event],
    })
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    events: group.events.sort((a, b) => a.shippingMode.localeCompare(b.shippingMode)),
  }))
}

function pageShell(title: string, body: string) {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f4f8fb;color:#213368;font-family:Arial,sans-serif;">
    <div style="max-width:720px;margin:0 auto;padding:20px;">
      <div style="padding:18px 20px;background:#213368;border-radius:16px 16px 0 0;color:#ffffff;">
        <div style="font-size:24px;font-weight:700;letter-spacing:0;">Sheepie.</div>
      </div>
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 16px 16px;padding:20px;">
      ${body}
      <p style="margin:24px 0 0;color:#64748b;font-size:12px;">Sent by Sheepie Dashboard.</p>
      </div>
    </div>
  </body>
</html>`
}

export function renderRestockAlertEmailHtml(input: {
  title: string
  events: RestockEmailEvent[]
}) {
  const rows = groupRestockEventsBySku(input.events).map((group) => {
    const routeRows = group.events.map((event) => `
      <div style="margin:0 0 8px;padding:10px 12px;background:#f4f8fb;border:1px solid #dbe8f5;border-radius:12px;">
        <div style="margin:0 0 5px;">
          <span style="display:inline-block;padding:3px 8px;border-radius:999px;background:#a2c1e0;color:#213368;font-size:12px;font-weight:700;">${formatMode(event.shippingMode)}</span>
        </div>
        <div style="font-size:14px;line-height:1.5;color:#213368;">
          <strong>Stock:</strong> ${event.currentStock} &nbsp; <strong>Reorder:</strong> ${event.threshold}
        </div>
        <div style="font-size:12px;line-height:1.4;color:#64748b;">${escapeHtml(event.leadTimeLabel)}</div>
      </div>
    `).join("")

    return `
    <tr>
      <td style="padding:14px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><strong style="color:#213368;">${escapeHtml(group.productName)}</strong><br /><span style="color:#64748b;">${escapeHtml(group.sku)}</span></td>
      <td style="padding:14px;border-bottom:1px solid #e2e8f0;vertical-align:top;">${routeRows}</td>
    </tr>
  `
  }).join("")

  return pageShell(input.title, `
    <h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;color:#213368;">${escapeHtml(input.title)}</h1>
    <p style="margin:0 0 18px;color:#64748b;">The following SKUs crossed their reorder threshold.</p>
    <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <thead>
        <tr>
          <th align="left" style="padding:12px 14px;border-bottom:1px solid #dbe8f5;background:#f4f8fb;color:#213368;">SKU</th>
          <th align="left" style="padding:12px 14px;border-bottom:1px solid #dbe8f5;background:#f4f8fb;color:#213368;">Shipment methods</th>
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
    <h1 style="margin:0 0 4px;font-size:24px;line-height:1.25;color:#213368;">${escapeHtml(input.title)}</h1>
    <p style="margin:0 0 18px;color:#64748b;">${escapeHtml(input.periodLabel)}</p>
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
