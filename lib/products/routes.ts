export function encodeProductSkuPathSegment(sku: string) {
  return encodeURIComponent(sku)
}

export function decodeProductSkuParam(sku: string) {
  try {
    return decodeURIComponent(sku)
  } catch {
    return sku
  }
}

export function getProductEditHref(sku: string) {
  return `/products/${encodeProductSkuPathSegment(sku)}/edit`
}

export function getBundleCompositionHref(sku: string) {
  return `/products/${encodeProductSkuPathSegment(sku)}/bundles`
}
