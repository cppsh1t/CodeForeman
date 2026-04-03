import type { TaskRunOutput } from './types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface RunSelectorProps {
  taskRuns: TaskRunOutput[]
  selectedRunId: number | null
  selectRun: (runId: number) => void
  isLoadingRuns: boolean
  runsError: string | null
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  running: 'default',
  success: 'secondary',
  failed: 'destructive',
  cancelled: 'outline'
}

function RunSelector({
  taskRuns,
  selectedRunId,
  selectRun,
  isLoadingRuns,
  runsError
}: RunSelectorProps): React.JSX.Element {
  if (isLoadingRuns) {
    return <Skeleton className="h-7 w-64" />
  }

  if (runsError) {
    return <div className="text-xs text-destructive">Failed to load runs: {runsError}</div>
  }

  if (taskRuns.length === 0) {
    return <div className="text-xs text-muted-foreground">No task runs found for this plan</div>
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Run:</label>
      <Select
        value={selectedRunId !== null ? String(selectedRunId) : undefined}
        onValueChange={(val) => selectRun(Number(val))}
      >
        <SelectTrigger className="w-72">
          <SelectValue placeholder="Select a run..." />
        </SelectTrigger>
        <SelectContent>
          {taskRuns.map((run, index) => (
            <SelectItem key={run.id} value={String(run.id)}>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">#{index + 1}</span>
                <span>Task {run.task_id}</span>
                <Badge variant={STATUS_VARIANT[run.status] ?? 'outline'} className="ml-auto">
                  {run.status}
                </Badge>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedRunId !== null && (
        <span className="text-xs text-muted-foreground">ID: {selectedRunId}</span>
      )}
    </div>
  )
}

export { RunSelector }
