import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function FinancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold mb-2">Finance</h1>
        <p className="text-muted-foreground">
          Finance has been archived from the active dashboard workflow.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Phase 1 Archive</CardTitle>
          <CardDescription>
            The finance UI is intentionally hidden while the underlying tables and historical data stay intact.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Ad spend, restock, and settlement data remain in the database.</p>
          <p>
            After the remaining product and reporting flows are stable without finance-screen dependencies,
            the dead code can be removed in a second cleanup pass.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
