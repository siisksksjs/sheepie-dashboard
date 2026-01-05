"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { addSpendEntry } from "@/lib/actions/ad-campaigns"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus } from "lucide-react"

type AddSpendModalProps = {
  campaignId: string
}

export function AddSpendModal({ campaignId }: AddSpendModalProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0])
  const [amount, setAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [notes, setNotes] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount")
      setLoading(false)
      return
    }

    const result = await addSpendEntry({
      campaign_id: campaignId,
      entry_date: entryDate,
      amount: parseFloat(amount),
      payment_method: paymentMethod || null,
      notes: notes || null,
    })

    setLoading(false)

    if (result.success) {
      // Reset form
      setEntryDate(new Date().toISOString().split('T')[0])
      setAmount("")
      setPaymentMethod("")
      setNotes("")
      setOpen(false)
      router.refresh()
    } else {
      setError(result.error || "Failed to add spend entry")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Entry
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Spend Entry</DialogTitle>
            <DialogDescription>
              Record a new ad spend topup for this campaign
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="entry_date">
                Entry Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="entry_date"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Date when you topped up the ad account
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">
                Amount <span className="text-destructive">*</span>
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                required
              />
              <p className="text-xs text-muted-foreground">
                How much did you spend on this topup?
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_method">
                Payment Method (Optional)
              </Label>
              <Input
                id="payment_method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                placeholder="e.g., Credit Card, Bank Transfer"
              />
              <p className="text-xs text-muted-foreground">
                How did you pay for this topup?
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">
                Notes (Optional)
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Receipt number, invoice reference, etc."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
