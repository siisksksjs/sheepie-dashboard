import { createHash, timingSafeEqual } from "node:crypto"

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest()
}

/**
 * Constant-time check of a provided secret (header, OAuth state) against the
 * expected one. Hashing first keeps the comparison length-independent. An empty
 * expected secret never matches.
 */
export function secretsMatch(provided: string | null | undefined, expected: string): boolean {
  if (!expected || !provided) return false
  return timingSafeEqual(digest(provided), digest(expected))
}
