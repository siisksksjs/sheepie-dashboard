"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"

import {
  deleteMonthlyAdSpend,
  deleteSkuAdSetup,
  deleteSkuSalesTarget,
  endSkuAdSetup,
  pauseSkuAdSetup,
} from "@/lib/actions/ad-campaigns"
import { Button } from "@/components/ui/button"
import type {
  Channel,
  MonthlyAdSpend,
  SkuAdSetup,
  SkuSalesTarget,
} from "@/lib/types/database.types"

type ActionResult = {
  success: boolean
  error?: string
}

function useWorkspaceActionRunner() {
  const router = useRouter()
  const actionLockRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const runAction = (
    actionLabel: string,
    confirmMessage: string,
    action: () => Promise<ActionResult>,
  ) => {
    if (actionLockRef.current) {
      return
    }

    if (!window.confirm(confirmMessage)) {
      return
    }

    actionLockRef.current = true
    setError(null)
    setPendingAction(actionLabel)
    startTransition(() => {
      void (async () => {
        try {
          const result = await action()

          if (!result.success) {
            setError(result.error || "Unable to complete this action.")
            return
          }

          router.refresh()
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "Unable to complete this action.",
          )
        } finally {
          actionLockRef.current = false
          setPendingAction(null)
        }
      })()
    })
  }

  const navigateTo = (href: string) => {
    if (actionLockRef.current || isPending) {
      return
    }

    router.push(href)
  }

  return {
    error,
    isPending,
    pendingAction,
    runAction,
    navigateTo,
  }
}

export function SetupRowActions(props: { setup: SkuAdSetup }) {
  const { error, isPending, pendingAction, runAction, navigateTo } =
    useWorkspaceActionRunner()

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => navigateTo(`/ad-campaigns/setup/${props.setup.id}/edit`)}
        >
          Edit
        </Button>
        {props.setup.status === "active" ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() =>
              runAction(
                "pause",
                `Pause ads setup for ${props.setup.sku} on ${formatChannelScope(getScopeChannels(props.setup))}?`,
                () => pauseSkuAdSetup(props.setup.id),
              )
            }
          >
            {pendingAction === "pause" ? "Pausing..." : "Pause"}
          </Button>
        ) : null}
        {props.setup.status !== "ended" ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() =>
              runAction(
                "end",
                `End ads setup for ${props.setup.sku} on ${formatChannelScope(getScopeChannels(props.setup))}?`,
                () => endSkuAdSetup(props.setup.id),
              )
            }
          >
            {pendingAction === "end" ? "Ending..." : "End"}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() =>
            runAction(
              "delete",
              `Delete ads setup for ${props.setup.sku} on ${formatChannelScope(getScopeChannels(props.setup))}? This cannot be undone.`,
              () => deleteSkuAdSetup(props.setup.id),
            )
          }
        >
          {pendingAction === "delete" ? "Deleting..." : "Delete"}
        </Button>
      </div>
      {error ? (
        <p role="alert" aria-live="polite" className="text-right text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function SpendRowActions(props: { row: MonthlyAdSpend }) {
  const { error, isPending, pendingAction, runAction, navigateTo } =
    useWorkspaceActionRunner()

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => navigateTo(`/ad-campaigns/spend/${props.row.id}/edit`)}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() =>
            runAction(
              "delete",
              `Delete monthly spend row for ${props.row.sku} on ${formatChannelScope(getScopeChannels(props.row))}? This cannot be undone.`,
              () => deleteMonthlyAdSpend(props.row.id),
            )
          }
        >
          {pendingAction === "delete" ? "Deleting..." : "Delete"}
        </Button>
      </div>
      {error ? (
        <p role="alert" aria-live="polite" className="text-right text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function getScopeChannels(input: {
  channels?: Channel[] | null
  channel?: Channel | null
}) {
  if (Array.isArray(input.channels) && input.channels.length > 0) {
    return input.channels
  }

  return input.channel ? [input.channel] : []
}

function formatChannelScope(channels: readonly Channel[]) {
  return channels.join(" + ")
}

export function TargetRowActions(props: { target: SkuSalesTarget }) {
  const { error, isPending, pendingAction, runAction, navigateTo } =
    useWorkspaceActionRunner()

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => navigateTo(`/ad-campaigns/targets/${props.target.id}/edit`)}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() =>
            runAction(
              "delete",
              `Delete sales target for ${props.target.sku}? This cannot be undone.`,
              () => deleteSkuSalesTarget(props.target.id),
            )
          }
        >
          {pendingAction === "delete" ? "Deleting..." : "Delete"}
        </Button>
      </div>
      {error ? (
        <p role="alert" aria-live="polite" className="text-right text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
