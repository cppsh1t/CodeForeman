import type { TaskOutput, TaskRunOutput } from './types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { taskStatusLabel, taskStatusBadgeVariant, formatDuration } from './utils'

interface TaskProgressProps {
  tasks: TaskOutput[]
  taskRuns: TaskRunOutput[]
  loading: boolean
  error: string | null
}

export function TaskProgress({
  tasks,
  taskRuns,
  loading,
  error
}: TaskProgressProps): React.JSX.Element {
  const sortedTasks = [...tasks].sort((a, b) => a.order_index - b.order_index)

  // Build a map from task_id to its latest run
  const runByTaskId = new Map<number, TaskRunOutput>()
  for (const run of taskRuns) {
    const existing = runByTaskId.get(run.task_id)
    if (!existing || run.created_at >= existing.created_at) {
      runByTaskId.set(run.task_id, run)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Task Progress</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : sortedTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No tasks yet. Generate tasks in the Planning page.
          </p>
        ) : (
          <ScrollArea className="max-h-64">
            <div className="space-y-1">
              {sortedTasks.map((task) => {
                const run = runByTaskId.get(task.id)
                const displayStatus = run ? run.status : task.status
                const isActive = displayStatus === 'running'

                return (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors ${
                      isActive ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[0.625rem] text-muted-foreground tabular-nums shrink-0">
                        #{task.order_index + 1}
                      </span>
                      <span
                        className={`text-xs truncate ${
                          isActive ? 'font-medium text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {task.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {run?.started_at && (
                        <span className="text-[0.625rem] text-muted-foreground tabular-nums">
                          {formatDuration(run.started_at, run.finished_at)}
                        </span>
                      )}
                      <Badge variant={taskStatusBadgeVariant(displayStatus)}>
                        {taskStatusLabel(displayStatus)}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
