import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { Product } from "@/lib/types/database.types"

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

vi.mock("next/link", async () => {
  const React = await vi.importActual<typeof import("react")>("react")

  return {
    __esModule: true,
    default: ({
      href,
      children,
      ...props
    }: {
      href: string
      children: React.ReactNode
    }) => React.createElement("a", { href, ...props }, children),
  }
})

vi.mock("@/lib/actions/products", () => ({
  updateProduct: vi.fn(),
  updateProductPackSettings: vi.fn(),
  updateProductChannelPrices: vi.fn(),
}))

describe("EditProductForm", () => {
  it("shows pack pricing and COGS history controls for bundle products", async () => {
    const { EditProductForm } = await import("@/components/products/edit-product-form")
    const product: Product = {
      id: "product-1",
      sku: "Bundle-Calmi",
      name: "Calmi Bundle",
      variant: null,
      cost_per_unit: 50000,
      reorder_point: 0,
      is_bundle: true,
      status: "active",
      created_at: "2026-04-27T00:00:00.000Z",
      updated_at: "2026-04-27T00:00:00.000Z",
    }

    const html = renderToStaticMarkup(
      createElement(EditProductForm, {
        product,
        initialPackSizes: [],
        channelPrices: [],
        cogsHistory: [],
      }),
    )

    expect(html).toContain("Pack Sizes")
    expect(html).toContain("Channel Price Matrix")
    expect(html).toContain("COGS History")
    expect(html).not.toContain("Bundle-only Product")
  })
})
