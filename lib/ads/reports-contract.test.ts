import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.useRealTimers()
})

const baseReportsBundle = {
  overview: {
    byChannel: [],
    byProduct: [],
  },
  monthly: {
    byMonth: [],
    byDay: [],
    byProduct: [],
  },
  channelProduct: {
    data: [],
  },
  returns: {
    returnedUnits: 0,
    returnedRevenue: 0,
    returnedCogs: 0,
    returnedOrders: 0,
    bySku: [],
  },
  calendar: {
    byDate: {},
  },
}

const baseAdPerformance = {
  campaigns_metrics: [],
  total_ad_spend: 0,
  total_revenue: 0,
  overall_roas: 0,
  avg_cost_per_order: 0,
  total_orders: 0,
  active_campaigns_count: 0,
}

async function renderReportsPage(input: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-04-01T12:00:00Z"))

  const getReportsBundle = vi.fn().mockResolvedValue(baseReportsBundle)
  const getAdPerformanceSummary = vi.fn().mockResolvedValue(baseAdPerformance)
  const reportsClientSpy = vi.fn()

  vi.doMock("@/lib/actions/orders", () => ({
    getReportsBundle,
  }))
  vi.doMock("@/lib/actions/ad-campaigns", () => ({
    getAdPerformanceSummary,
  }))
  vi.doMock("../../app/(dashboard)/reports/reports-client", () => ({
    ReportsClient: (props: Record<string, unknown>) => {
      reportsClientSpy(props)
      return React.createElement("div", { "data-testid": "reports-client" }, "Reports client")
    },
  }))

  const { default: ReportsPage } = await import("../../app/(dashboard)/reports/page")
  const html = renderToStaticMarkup(await ReportsPage(input))

  return {
    html,
    getReportsBundle,
    reportsClientSpy,
  }
}

async function loadReportsClient() {
  vi.resetModules()
  vi.doUnmock("../../app/(dashboard)/reports/reports-client")
  vi.doMock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
  }))
  vi.doMock("next/link", () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) =>
      React.createElement("a", { href }, children),
  }))
  vi.doMock("@/components/ui/badge", () => ({
    Badge: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", null, children),
  }))
  vi.doMock("@/components/ui/button", () => ({
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement("button", props, children),
  }))
  vi.doMock("@/components/ui/card", () => ({
    Card: ({ children }: { children: React.ReactNode }) =>
      React.createElement("section", null, children),
    CardHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement("header", null, children),
    CardTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement("h2", null, children),
    CardDescription: ({ children }: { children: React.ReactNode }) =>
      React.createElement("p", null, children),
    CardContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
  }))
  vi.doMock("@/components/ui/dialog", () => ({
    Dialog: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    DialogContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    DialogDescription: ({ children }: { children: React.ReactNode }) =>
      React.createElement("p", null, children),
    DialogHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    DialogTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement("h3", null, children),
  }))
  vi.doMock("@/components/ui/info-tooltip", () => ({
    InfoTooltip: () => React.createElement("span", null, "info"),
  }))
  vi.doMock("@/components/ui/label", () => ({
    Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) =>
      React.createElement("label", { htmlFor }, children),
  }))
  vi.doMock("@/components/ui/select", () => ({
    Select: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
    SelectContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) =>
      React.createElement("div", { "data-value": value }, children),
    SelectTrigger: ({ children, id }: { children: React.ReactNode; id?: string }) =>
      React.createElement("button", { id, type: "button" }, children),
    SelectValue: ({ placeholder }: { placeholder?: string }) =>
      React.createElement("span", null, placeholder || "value"),
  }))
  vi.doMock("@/components/ui/table", () => ({
    Table: ({ children }: { children: React.ReactNode }) =>
      React.createElement("table", null, children),
    TableHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement("thead", null, children),
    TableBody: ({ children }: { children: React.ReactNode }) =>
      React.createElement("tbody", null, children),
    TableRow: ({ children }: { children: React.ReactNode }) =>
      React.createElement("tr", null, children),
    TableHead: ({ children }: { children: React.ReactNode }) =>
      React.createElement("th", null, children),
    TableCell: ({ children }: { children: React.ReactNode }) =>
      React.createElement("td", null, children),
  }))
  vi.doMock("@/components/ui/tabs", () => ({
    Tabs: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
    TabsList: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
    TabsTrigger: ({ children }: { children: React.ReactNode }) =>
      React.createElement("button", { type: "button" }, children),
    TabsContent: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  }))
  vi.doMock("@/lib/utils", () => ({
    formatCurrency: (value: number) => `Rp${value}`,
  }))
  vi.doMock("lucide-react", () => {
    const Icon = () => React.createElement("svg")
    return {
      ChevronDown: Icon,
      ChevronRight: Icon,
      TrendingUp: Icon,
      DollarSign: Icon,
      Package: Icon,
      ShoppingBag: Icon,
      Target: Icon,
    }
  })
  vi.doMock("recharts", () => {
    const Passthrough = ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children)

    return {
      LineChart: Passthrough,
      Line: Passthrough,
      BarChart: Passthrough,
      Bar: Passthrough,
      PieChart: Passthrough,
      Pie: Passthrough,
      Cell: Passthrough,
      XAxis: Passthrough,
      YAxis: Passthrough,
      CartesianGrid: Passthrough,
      Tooltip: Passthrough,
      Legend: Passthrough,
      ResponsiveContainer: Passthrough,
    }
  })

  return (await import("../../app/(dashboard)/reports/reports-client")).ReportsClient
}

describe("reports monthly ads contract", () => {
  it("sanitizes invalid report filters and keeps All Years reachable", async () => {
    const invalidResult = await renderReportsPage({
      searchParams: Promise.resolve({ year: "nope", month: "13" }),
    })

    expect(invalidResult.html).toContain("Reports client")
    expect(invalidResult.getReportsBundle).toHaveBeenCalledWith(undefined, undefined)
    expect(invalidResult.reportsClientSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedYear: undefined,
        selectedMonth: undefined,
      }),
    )

    const allYearsResult = await renderReportsPage({
      searchParams: Promise.resolve({}),
    })

    expect(allYearsResult.getReportsBundle).toHaveBeenCalledWith(undefined, undefined)
    expect(allYearsResult.reportsClientSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedYear: undefined,
        selectedMonth: undefined,
      }),
    )
  })

  it("wires a valid month-scoped bundle through to the reports client", async () => {
    const result = await renderReportsPage({
      searchParams: Promise.resolve({ year: "2025", month: "2" }),
    })

    expect(result.getReportsBundle).toHaveBeenCalledWith(2025, 2)
    expect(result.reportsClientSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedYear: 2025,
        selectedMonth: 2,
      }),
    )
  })

  it("hides the monthly ads section and keeps keyboard-accessible heatmap cells", async () => {
    const ReportsClient = await loadReportsClient()

    const html = renderToStaticMarkup(
      React.createElement(ReportsClient, {
        initialOverview: baseReportsBundle.overview,
        initialMonthly: {
          ...baseReportsBundle.monthly,
          byDay: [
            {
              month: "2026-04-01",
              orders: 2,
              units_sold: 3,
              revenue: 400,
              cost: 100,
              profit: 300,
            },
          ],
        },
        initialChannelProduct: baseReportsBundle.channelProduct,
        initialAdPerformance: baseAdPerformance,
        initialReturnSummary: baseReportsBundle.returns,
        initialCalendarDetails: {
          byDate: {
            "2026-04-01": {
              orders: 2,
              units: 3,
              revenue: 400,
              items: [],
            },
          },
        },
        selectedYear: 2026,
        selectedMonth: 4,
      }),
    )

    expect(html).not.toContain("Monthly Ads Profitability")
    expect(html).toContain('label for="year"')
    expect(html).toContain('button id="year"')
    expect(html).toContain('label for="month"')
    expect(html).toContain('button id="month"')
    expect(html).toContain('aria-label="Open details for 2026-04-01: 2 orders, 3 units, Rp400 revenue"')
    expect(html).toContain(">1<")
  })
})
