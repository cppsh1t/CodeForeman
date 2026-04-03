import type {
  TaskOutput,
  TaskRunOutput,
  ExecutionStats,
  ThinkValidationError,
  TimelineEvent,
  MessageOutput
} from './types'
import { MAX_STRING_LENGTH } from '@shared/ipc'

// ── Execution Stats ──

/**
 * Compute execution statistics from persisted task + task-run data.
 * Stats reflect the authoritative state from the database, not in-memory state.
 */
export function computeExecutionStats(
  tasks: TaskOutput[],
  taskRuns: TaskRunOutput[]
): ExecutionStats {
  const totalTasks = tasks.length
  if (totalTasks === 0) {
    return {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      runningTask: null,
      pendingTasks: 0,
      blockedTasks: 0,
      skippedTasks: 0,
      progressPercent: 0
    }
  }

  // Build a map from task_id to its latest run
  const runByTaskId = new Map<number, TaskRunOutput>()
  for (const run of taskRuns) {
    const existing = runByTaskId.get(run.task_id)
    if (!existing || run.created_at >= existing.created_at) {
      runByTaskId.set(run.task_id, run)
    }
  }

  let completedTasks = 0
  let failedTasks = 0
  let runningTask: TaskOutput | null = null
  let pendingTasks = 0
  let blockedTasks = 0
  let skippedTasks = 0

  for (const task of tasks) {
    const run = runByTaskId.get(task.id)
    if (run) {
      switch (run.status) {
        case 'success':
          completedTasks++
          break
        case 'failed':
          failedTasks++
          break
        case 'running':
          runningTask = task
          break
        case 'cancelled':
          // Cancelled runs don't change task progress
          if (task.status === 'pending') pendingTasks++
          else if (task.status === 'blocked') blockedTasks++
          break
      }
    } else {
      // No run yet — go by task status
      switch (task.status) {
        case 'success':
          completedTasks++
          break
        case 'failed':
          failedTasks++
          break
        case 'running':
          runningTask = task
          break
        case 'pending':
          pendingTasks++
          break
        case 'blocked':
          blockedTasks++
          break
        case 'skipped':
          skippedTasks++
          break
      }
    }
  }

  const progressPercent =
    totalTasks > 0 ? Math.round(((completedTasks + skippedTasks) / totalTasks) * 100) : 0

  return {
    totalTasks,
    completedTasks,
    failedTasks,
    runningTask,
    pendingTasks,
    blockedTasks,
    skippedTasks,
    progressPercent
  }
}

// ── Task status label ──

export function taskStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'running':
      return 'Running'
    case 'success':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'blocked':
      return 'Blocked'
    case 'skipped':
      return 'Skipped'
    default:
      return status
  }
}

export function taskStatusBadgeVariant(
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'pending':
      return 'outline'
    case 'running':
      return 'default'
    case 'success':
      return 'secondary'
    case 'failed':
      return 'destructive'
    case 'blocked':
      return 'destructive'
    case 'skipped':
      return 'outline'
    default:
      return 'outline'
  }
}

// ── Plan status label ──

export function planStatusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft'
    case 'ready':
      return 'Ready'
    case 'running':
      return 'Running'
    case 'paused':
      return 'Paused'
    case 'completed':
      return 'Completed'
    case 'blocked':
      return 'Blocked'
    case 'stopped':
      return 'Stopped'
    default:
      return status
  }
}

// ── Force-Think Validation ──

/**
 * Validate force-think form input before IPC submission.
 * Returns an array of errors (empty = valid).
 */
export function validateThinkInput(input: {
  task_run_id: number | null
  decision: string | null
  reason: string
}): ThinkValidationError[] {
  const errors: ThinkValidationError[] = []

  if (input.task_run_id == null || input.task_run_id <= 0) {
    errors.push({ field: 'task_run_id', message: 'Select a task run' })
  }

  if (!input.decision) {
    errors.push({ field: 'decision', message: 'Select a decision type' })
  }

  if (!input.reason.trim()) {
    errors.push({ field: 'reason', message: 'Reason is required' })
  } else if (input.reason.trim().length > MAX_STRING_LENGTH) {
    errors.push({
      field: 'reason',
      message: `Reason must be at most ${MAX_STRING_LENGTH.toLocaleString()} characters`
    })
  }

  return errors
}

// ── Timeline ──

/**
 * Build timeline events from run messages.
 * Messages are sorted newest-first for display.
 */
export function buildTimelineFromMessages(messages: MessageOutput[], limit = 50): TimelineEvent[] {
  const events: TimelineEvent[] = messages.slice(-limit).map((msg) => ({
    id: `msg-${msg.id}`,
    type: 'message' as const,
    timestamp: msg.created_at,
    role: msg.role,
    content: msg.content,
    metadata: msg.correlation_id
  }))

  // Newest first
  events.reverse()
  return events
}

// ── Timestamp Formatting ──

export function formatTimelineTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch {
    return isoString
  }
}

/**
 * Format duration between two ISO timestamps. Returns human-readable string.
 */
export function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return '—'

  const start = new Date(startedAt).getTime()
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now()
  const diffMs = Math.max(0, end - start)

  if (diffMs < 1000) return '<1s'
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s`
  if (diffMs < 3_600_000) {
    const mins = Math.floor(diffMs / 60_000)
    const secs = Math.floor((diffMs % 60_000) / 1000)
    return `${mins}m ${secs}s`
  }
  const hours = Math.floor(diffMs / 3_600_000)
  const mins = Math.floor((diffMs % 3_600_000) / 60_000)
  return `${hours}h ${mins}m`
}

// ── Decision label ──

export function thinkDecisionLabel(decision: string): string {
  switch (decision) {
    case 'continue_next':
      return 'Continue Next'
    case 'retry_current':
      return 'Retry Current'
    case 'reorder':
      return 'Reorder Tasks'
    case 'stop_plan':
      return 'Stop Plan'
    default:
      return decision
  }
}

export function triggerTypeLabel(trigger: string): string {
  switch (trigger) {
    case 'failure':
      return 'Failure'
    case 'user_force':
      return 'User Forced'
    case 'interval':
      return 'Interval'
    default:
      return trigger
  }
}
