export const PACK_SIZE_OPTIONS = [
  { value: "single", label: "Single", multiplier: 1 },
  { value: "bundle_2", label: "Bundle of 2", multiplier: 2 },
  { value: "bundle_3", label: "Bundle of 3", multiplier: 3 },
  { value: "bundle_4", label: "Bundle of 4", multiplier: 4 },
] as const

export type PackSize = (typeof PACK_SIZE_OPTIONS)[number]["value"]

export const DEFAULT_PACK_SIZE: PackSize = "single"

export function isValidPackSize(value: string): value is PackSize {
  return PACK_SIZE_OPTIONS.some((item) => item.value === value)
}

export function getPackMultiplier(packSize: PackSize): number {
  return PACK_SIZE_OPTIONS.find((item) => item.value === packSize)?.multiplier ?? 1
}

export function getPackSizeLabel(packSize: PackSize): string {
  return PACK_SIZE_OPTIONS.find((item) => item.value === packSize)?.label ?? "Single"
}
