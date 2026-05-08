import type { ShippingMode } from "@/lib/restock/config"

export type RestockAlertRoute = {
  sku: string
  mode: ShippingMode
}

export type ReorderThresholdInput = {
  reorderMin: number
  reorderMax: number
}

export type ReorderCrossingInput = {
  previousStock: number
  currentStock: number
  threshold: number
}

export const RESTOCK_ALERT_ROUTES: RestockAlertRoute[] = [
  { sku: "Cervi-001", mode: "sea" },
  { sku: "Lumi-001", mode: "air" },
  { sku: "Lumi-001", mode: "sea" },
  { sku: "Calmi-001", mode: "air" },
  { sku: "Calmi-001", mode: "sea" },
]

export function buildRestockAlertRouteKey(sku: string, mode: ShippingMode) {
  return `${sku}:${mode}`
}

export function getRestockAlertRoutesForSku(sku: string) {
  return RESTOCK_ALERT_ROUTES.filter((route) => route.sku === sku)
}

export function getConservativeReorderThreshold(input: ReorderThresholdInput) {
  return input.reorderMax
}

export function didCrossReorderThreshold(input: ReorderCrossingInput) {
  return input.previousStock > input.threshold && input.currentStock <= input.threshold
}
