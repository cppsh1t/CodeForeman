import type { ExecutionStats } from './types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { planStatusLabel } from './utils'

interface ExecutionSummaryProps {
  stats: ExecutionStats
  planStatus: string | undefined
  planName: string | undefined
  loading: boolean
}

export function ExecutionSummary({
  stats,
  planStatus,
  planName,
  loading
}: ExecutionSummaryProps): React.JSX.Element {
  if (loading) {
    return (
      <Card size="sm">
        <CardContent className="py-4">
          <div className="flex items-center justify-center">
            <span className="text-xs text-muted-foreground">Loading execution data...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Execution Summary</CardTitle>
          {planStatus && (
            <Badge
              variant={
                planStatus === 'running'
                  ? 'destructive'
                  : planStatus === 'completed'
                    ? 'secondary'
                    : 'outline'
              }
            >
              {planStatusLabel(planStatus)}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {planName && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Plan:</span>
            <span className="text-xs font-medium">{planName}</span>
          </div>
        )}

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium tabular-nums">{stats.progressPercent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${stats.progressPercent}%` }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-5 gap-2">
          <StatItem label="Total" value={stats.totalTasks} variant="outline" />
          <StatItem label="Done" value={stats.completedTasks} variant="secondary" />
          <StatItem label="Running" value={stats.runningTask ? 1 : 0} variant="default" />
          <StatItem label="Failed" value={stats.failedTasks} variant="destructive" />
          <StatItem
            label="Pending"
            value={stats.pendingTasks + stats.blockedTasks}
            variant="outline"
          />
        </div>

        {/* Current task highlight */}
        {stats.runningTask && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              <span className="text-xs font-medium">{stats.runningTask.name}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatItem({
  label,
  value,
  variant
}: {
  label: string
  value: number
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-border/50 bg-muted/30 px-2 py-2">
      <Badge variant={variant} className="text-sm tabular-nums">
        {value}
      </Badge>
      <span className="text-[0.625rem] text-muted-foreground">{label}</span>
    </div>
  )
}
