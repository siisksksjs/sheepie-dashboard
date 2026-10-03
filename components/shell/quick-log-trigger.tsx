"use client"

import { useSyncExternalStore, type ReactNode } from "react"
import { QuickLogSheet } from "./quick-log-sheet"

const subscribe = () => () => {}

/**
 * Renders the plain trigger on the server and the real drawer once in the browser,
 * so Radix's generated ids never differ between the two renders.
 */
export function QuickLogTrigger({ trigger }: { trigger: ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false)
  return mounted ? <QuickLogSheet trigger={trigger} /> : <>{trigger}</>
}
