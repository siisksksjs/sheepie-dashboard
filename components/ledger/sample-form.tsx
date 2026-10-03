"use client"

import { useState, useTransition, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Gift, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ListingThumb } from "@/components/listing-thumb"
import { PageHeader } from "@/components/ui/page"
import { recordSample } from "@/lib/actions/samples"
import {
  SAMPLE_REASONS,
  SAMPLE_PLATFORMS,
  type SampleInput
} from "@/lib/inventory/samples"
import { getJakartaToday } from "@/lib/utils"
import type { Product, StockOnHand } from "@/lib/types/database.types"

export function SampleForm({
  products,
  images,
  stock
}: {
  products: Product[]
  images: Record<string, string>
  stock: StockOnHand[]
}) {
  const router = useRouter()
  const [input, setInput] = useState<SampleInput>({
    sku: "",
    quantity: 1,
    sentDate: getJakartaToday(),
    recipient: "",
    handle: "",
    platform: "TikTok",
    reason: "Influencer seeding",
    notes: ""
  })
  const [review, setReview] = useState(false)
  const [error, setError] = useState("")
  const [pending, start] = useTransition()
  const [search, setSearch] = useState("")
  const product = products.find((p) => p.sku === input.sku)
  const onHand = stock.find((s) => s.sku === input.sku)?.current_stock
  const set = (field: keyof SampleInput, value: string | number) => {
    setReview(false)
    setInput((i) => ({ ...i, [field]: value }))
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!product) {
      setError("Choose a product first.")
      return
    }
    setError("")
    setReview(true)
  }
  function save() {
    start(async () => {
      try {
        const result = await recordSample(input)
        if (!result.success) {
          setError(result.error || "Could not record this sample.")
          return
        }
        router.push("/ledger?view=samples")
        router.refresh()
      } catch {
        setError("Could not save. Check your connection before trying again.")
      }
    })
  }
  return (
    <div>
      <Link
        href="/ledger"
        className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground"
      >
        <ArrowLeft className="size-4" /> Back to inventory
      </Link>
      <PageHeader
        title="Send a sample"
        description="A proper record of what you sent, who received it, and why."
      />
      <form
        onSubmit={submit}
        className="grid items-start gap-5 xl:grid-cols-[1.2fr_0.8fr]"
      >
        <section className="glass rounded-[24px] p-5 sm:p-6">
          <p className="workspace-eyebrow">01 / Choose the product</p>
          <h2 className="mt-2 text-xl">What are you sending?</h2>
          <Input
            aria-label="Find a sample product"
            placeholder="Find a product or colour…"
            className="my-4"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="grid max-h-[480px] gap-2 overflow-y-auto sm:grid-cols-2">
            {products
              .filter((p) =>
                `${p.name} ${p.variant ?? ""} ${p.sku}`
                  .toLowerCase()
                  .includes(search.toLowerCase())
              )
              .map((p) => (
                <button
                  type="button"
                  key={p.sku}
                  aria-pressed={input.sku === p.sku}
                  onClick={() => {
                    set("sku", p.sku)
                    setError("")
                  }}
                  className={`flex items-center gap-3 rounded-2xl border p-3 text-left ${input.sku === p.sku ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-primary/10 bg-white/50 hover:bg-white"}`}
                >
                  <ListingThumb
                    src={images[`${p.sku}:single`]}
                    name={p.name}
                    sku={p.sku}
                    size={48}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold">
                      {p.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {p.variant ?? p.sku}
                      {p.is_bundle ? " · Kit" : ""}
                    </span>
                  </span>
                  {input.sku === p.sku && (
                    <Check className="size-4 flex-none" />
                  )}
                </button>
              ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sample-quantity">Quantity</Label>
              <Input
                id="sample-quantity"
                type="number"
                min={1}
                max={10000}
                step={1}
                required
                value={input.quantity}
                onChange={(e) => set("quantity", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sample-date">Sent date · WIB</Label>
              <Input
                id="sample-date"
                type="date"
                required
                value={input.sentDate}
                onChange={(e) => set("sentDate", e.target.value)}
              />
            </div>
          </div>
          {product && (
            <p className="mt-3 text-sm text-muted-foreground">
              {product.is_bundle
                ? "The kit’s component stock will be deducted automatically."
                : `${onHand ?? "—"} on hand · ${onHand !== undefined ? onHand - input.quantity : "—"} after sending`}
            </p>
          )}
          {onHand !== undefined &&
            onHand < input.quantity &&
            !product?.is_bundle && (
              <p className="mt-2 text-sm font-semibold text-[#9c4c18]">
                This exceeds recorded stock. Check the product and quantity
                before confirming.
              </p>
            )}
        </section>
        <section className="glass rounded-[24px] p-5 sm:p-6">
          <p className="workspace-eyebrow">02 / Recipient & purpose</p>
          <h2 className="mb-5 mt-2 text-xl">Who is it for?</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sample-recipient">Recipient / KOL name</Label>
              <Input
                id="sample-recipient"
                autoComplete="off"
                required
                maxLength={120}
                placeholder="e.g. holla.iiz"
                value={input.recipient}
                onChange={(e) => set("recipient", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sample-handle">
                Account handle or profile link
              </Label>
              <Input
                id="sample-handle"
                maxLength={200}
                placeholder="@handle or profile URL"
                value={input.handle}
                onChange={(e) => set("handle", e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sample-platform">Creator platform</Label>
                <select
                  id="sample-platform"
                  className="workspace-select"
                  value={input.platform}
                  onChange={(e) => set("platform", e.target.value)}
                >
                  {SAMPLE_PLATFORMS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sample-reason">Purpose</Label>
                <select
                  id="sample-reason"
                  className="workspace-select"
                  value={input.reason}
                  onChange={(e) => set("reason", e.target.value)}
                >
                  {SAMPLE_REASONS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sample-notes">Notes</Label>
              <Textarea
                id="sample-notes"
                maxLength={500}
                placeholder="Campaign, delivery reference, or context"
                value={input.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          )}
          {review && product ? (
            <div className="mt-5 rounded-2xl border border-primary/15 bg-white/65 p-4">
              <p className="flex items-center gap-2 font-bold">
                <Gift className="size-4" /> Confirm sample shipment
              </p>
              <p className="mt-2 text-sm">
                {input.quantity} × {product.name} to{" "}
                <strong>{input.recipient}</strong> · {input.platform}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                This records a promotional stock deduction dated{" "}
                {input.sentDate}. It will not count as a sale. Corrections use a
                new inventory adjustment.
              </p>
              <div className="mt-4 flex gap-2">
                <Button type="button" disabled={pending} onClick={save}>
                  {pending ? "Recording…" : "Confirm & record"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setReview(false)}
                >
                  Go back
                </Button>
              </div>
            </div>
          ) : (
            <Button className="mt-5 w-full" type="submit">
              Review sample <ArrowRight className="ml-2 size-4" />
            </Button>
          )}
        </section>
      </form>
    </div>
  )
}
