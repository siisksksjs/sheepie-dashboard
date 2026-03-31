export type ShippingMode = "air" | "sea"

export type RestockGuidanceConfig = {
  sku: string
  name: string
  mode: ShippingMode
  fallbackLeadMin: number
  fallbackLeadMax: number
  bufferDays: number
}

export const RESTOCK_GUIDANCE_CONFIG: RestockGuidanceConfig[] = [
  {
    sku: "Cervi-001",
    name: "CerviCloud Pillow",
    mode: "sea",
    fallbackLeadMin: 28,
    fallbackLeadMax: 42,
    bufferDays: 14,
  },
  {
    sku: "Lumi-001",
    name: "LumiCloud Eye Mask",
    mode: "air",
    fallbackLeadMin: 7,
    fallbackLeadMax: 10,
    bufferDays: 7,
  },
  {
    sku: "Calmi-001",
    name: "CalmiCloud Ear Plug",
    mode: "air",
    fallbackLeadMin: 7,
    fallbackLeadMax: 10,
    bufferDays: 7,
  },
  {
    sku: "Calmi-001",
    name: "CalmiCloud Ear Plug",
    mode: "sea",
    fallbackLeadMin: 28,
    fallbackLeadMax: 42,
    bufferDays: 14,
  },
]
