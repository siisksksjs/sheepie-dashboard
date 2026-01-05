"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createCampaign } from "@/lib/actions/ad-campaigns"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import type { Channel, AdPlatform } from "@/lib/types/database.types"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

const platformOptions: { value: AdPlatform; label: string }[] = [
  { value: "tiktok_ads", label: "TikTok Ads" },
  { value: "shopee_ads", label: "Shopee Ads" },
  { value: "facebook_ads", label: "Facebook Ads" },
  { value: "google_ads", label: "Google Ads" },
]

const channelOptions: { value: Channel; label: string }[] = [
  { value: "tiktok", label: "TikTok" },
  { value: "tokopedia", label: "Tokopedia" },
  { value: "shopee", label: "Shopee" },
  { value: "offline", label: "Offline" },
]

const platformChannelDefaults: Record<AdPlatform, Channel[]> = {
  tiktok_ads: ["tiktok", "tokopedia"],
  shopee_ads: ["shopee"],
  facebook_ads: ["tiktok", "tokopedia", "shopee"],
  google_ads: ["tiktok", "tokopedia", "shopee"],
}

export default function NewCampaignPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [campaignName, setCampaignName] = useState("")
  const [platform, setPlatform] = useState<AdPlatform>("tiktok_ads")
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState("")
  const [targetChannels, setTargetChannels] = useState<Channel[]>(["tiktok", "tokopedia"])
  const [initialSpend, setInitialSpend] = useState("")
  const [notes, setNotes] = useState("")

  const handlePlatformChange = (newPlatform: AdPlatform) => {
    setPlatform(newPlatform)
    // Auto-select default channels for this platform
    setTargetChannels(platformChannelDefaults[newPlatform])
  }

  const handleChannelToggle = (channel: Channel) => {
    setTargetChannels(prev =>
      prev.includes(channel)
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (targetChannels.length === 0) {
      setError("Please select at least one target channel")
      setLoading(false)
      return
    }

    const result = await createCampaign({
      campaign_name: campaignName,
      platform,
      start_date: startDate,
      end_date: endDate || null,
      target_channels: targetChannels,
      notes: notes || null,
      initial_spend: initialSpend ? parseFloat(initialSpend) : undefined,
    })

    setLoading(false)

    if (result.success) {
      router.push("/ad-campaigns")
    } else {
      setError(result.error || "Failed to create campaign")
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/ad-campaigns">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Campaigns
          </Button>
        </Link>
        <h1 className="text-3xl font-display font-bold mb-2">Create Campaign</h1>
        <p className="text-muted-foreground">
          Set up a new ad campaign to track spend and ROAS
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Campaign Details</CardTitle>
            <CardDescription>
              Enter campaign information and select target channels
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="campaign_name">
                Campaign Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="campaign_name"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g., Feb 2025 TikTok Campaign"
                required
              />
              <p className="text-xs text-muted-foreground">
                Choose a descriptive name to identify this campaign
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="platform">
                Ad Platform <span className="text-destructive">*</span>
              </Label>
              <Select value={platform} onValueChange={handlePlatformChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {platformOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The advertising platform where you're spending money
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">
                  Start Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="start_date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_date">
                  End Date (Optional)
                </Label>
                <Input
                  id="end_date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty for ongoing campaigns
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                Target Channels <span className="text-destructive">*</span>
              </Label>
              <p className="text-xs text-muted-foreground mb-3">
                Select which sales channels this campaign drives orders to
              </p>
              <div className="space-y-3">
                {channelOptions.map((channel) => (
                  <div key={channel.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={channel.value}
                      checked={targetChannels.includes(channel.value)}
                      onCheckedChange={() => handleChannelToggle(channel.value)}
                    />
                    <Label htmlFor={channel.value} className="cursor-pointer">
                      {channel.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="initial_spend">
                Initial Spend (Optional)
              </Label>
              <Input
                id="initial_spend"
                type="number"
                step="0.01"
                min="0"
                value={initialSpend}
                onChange={(e) => setInitialSpend(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                If you're adding initial budget, enter the amount. You can add more later.
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
                placeholder="Campaign objectives, target audience, etc."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 mt-6">
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? "Creating..." : "Create Campaign"}
          </Button>
          <Link href="/ad-campaigns">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
