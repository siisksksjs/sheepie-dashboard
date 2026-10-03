"use client"

import { useRef, useState, useTransition } from "react"
import { ImageUp } from "lucide-react"
import { toast } from "sonner"
import { uploadListingImage } from "@/lib/actions/listing-images"
import { ListingThumb } from "@/components/listing-thumb"
import { getPackSizeLabel, type PackSize } from "@/lib/products/pack-sizes"

type Listing = { packSize: PackSize; imageUrl: string | null }

/** One photo per enabled pack size — these are what you see when logging and scanning orders. */
export function ListingPhotos({ sku, name, listings }: { sku: string; name: string; listings: Listing[] }) {
  const [items, setItems] = useState(listings)
  return (
    <section className="glass rounded-[22px] p-5 sm:p-6">
      <h2 className="font-display text-[19px] font-semibold">Listing photos</h2>
      <p className="mt-0.5 text-[13.5px] text-muted-foreground">Shown in Log an order, the order list and stock. Square images under 2 MB.</p>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((l) => (
          <PhotoSlot
            key={l.packSize}
            sku={sku}
            name={name}
            listing={l}
            onUploaded={(url) => setItems((xs) => xs.map((x) => (x.packSize === l.packSize ? { ...x, imageUrl: url } : x)))}
          />
        ))}
      </ul>
    </section>
  )
}

function PhotoSlot({ sku, name, listing, onUploaded }: { sku: string; name: string; listing: Listing; onUploaded: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  return (
    <li className="glass-inset rounded-[18px] p-2.5">
      <ListingThumb src={listing.imageUrl} name={name} sku={sku} size={300} className="!h-auto !w-full aspect-square" />
      <div className="mt-2 flex items-center justify-between gap-2 px-1">
        <span className="text-[13px] font-semibold">{getPackSizeLabel(listing.packSize)}</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => input.current?.click()}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold text-primary/70 hover:bg-white/80 hover:text-primary disabled:opacity-50"
        >
          <ImageUp className="size-3.5" /> {pending ? "Uploading…" : listing.imageUrl ? "Replace" : "Add"}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          const form = new FormData()
          form.set("sku", sku)
          form.set("pack_size", listing.packSize)
          form.set("file", file)
          start(async () => {
            const r = await uploadListingImage(form)
            if (r.success) {
              onUploaded(r.url)
              toast(`${getPackSizeLabel(listing.packSize)} photo updated`)
            } else toast.error(r.error)
          })
          e.target.value = ""
        }}
      />
    </li>
  )
}
