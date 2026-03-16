import { Card, CardContent, CardHeader } from "@/components/ui/card"

function LoadingBlock({ className = "h-5 w-32" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />
}

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <LoadingBlock className="h-10 w-56" />
        <LoadingBlock className="h-4 w-80" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index}>
            <CardHeader className="space-y-3">
              <LoadingBlock className="h-4 w-24" />
              <LoadingBlock className="h-8 w-20" />
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <LoadingBlock className="h-5 w-40" />
          <LoadingBlock className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <LoadingBlock key={index} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
