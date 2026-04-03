import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ExecutionControlsProps {
  planStatus: string | undefined
  loading: boolean
  error: string | null
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
}

export function ExecutionControls({
  planStatus,
  loading,
  error,
  onStart,
  onPause,
  onResume,
  onStop
}: ExecutionControlsProps): React.JSX.Element {
  const isRunning = planStatus === 'running'
  const isPaused = planStatus === 'paused'
  const isBlocked = planStatus === 'blocked'
  const isTerminal = planStatus === 'completed' || planStatus === 'stopped'
  const canStart = planStatus === 'ready' || planStatus === 'blocked'

  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">Execution Controls</p>
        <div className="flex flex-wrap items-center gap-2">
          {canStart && (
            <Button onClick={onStart} disabled={loading} variant="default" size="sm">
              {loading ? 'Starting...' : 'Start'}
            </Button>
          )}

          {isRunning && (
            <Button onClick={onPause} disabled={loading} variant="outline" size="sm">
              {loading ? 'Pausing...' : 'Pause'}
            </Button>
          )}

          {isPaused && (
            <Button onClick={onResume} disabled={loading} variant="default" size="sm">
              {loading ? 'Resuming...' : 'Resume'}
            </Button>
          )}

          {(isRunning || isPaused || isBlocked) && (
            <Button onClick={onStop} disabled={loading} variant="destructive" size="sm">
              {loading ? 'Stopping...' : 'Stop'}
            </Button>
          )}

          {isTerminal && (
            <span className="text-xs text-muted-foreground">Execution finished ({planStatus})</span>
          )}

          {!planStatus && (
            <span className="text-xs text-muted-foreground">
              Select a plan to control execution
            </span>
          )}
        </div>

        {error && <p className="text-[0.625rem] text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
