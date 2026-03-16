import Link from "next/link"
import { FilePenLine, Plus } from "lucide-react"
import { getChangelogEntries } from "@/lib/actions/changelog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChangelogTimeline } from "@/components/changelog/changelog-timeline"

export default async function ChangelogPage() {
  const entries = await getChangelogEntries({ limit: 100 })

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link href="/changelog/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Entry
          </Button>
        </Link>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <FilePenLine className="mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="text-xl font-semibold">No changelog entries yet</h2>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Automatic logs will appear when people use the dashboard. You can also add manual entries for changes made outside this app.
            </p>
            <Link href="/changelog/new" className="mt-6">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create First Entry
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ChangelogTimeline entries={entries} />
      )}
    </div>
  )
}
