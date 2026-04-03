import type { MessageRole } from '@shared/types'

// ── IPC Output Shapes ──
// Mirror the validated output shapes from IpcOutputMap for use in components.

export interface PlanOutput {
  id: number
  project_id: number
  name: string
  description: string
  status: string
  created_at: string
  updated_at: string
}

export interface TaskOutput {
  id: number
  plan_id: number
  name: string
  description: string
  status: string
  order_index: number
  created_at: string
  updated_at: string
}

export interface TaskRunOutput {
  id: number
  task_id: number
  status: 'running' | 'success' | 'failed' | 'cancelled'
  error_code: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

export interface MessageOutput {
  id: number
  task_run_id: number
  correlation_id: string
  role: MessageRole
  content: string
  created_at: string
  updated_at: string
}

export interface PaginatedMessages {
  items: MessageOutput[]
  total: number
  page: number
  page_size: number
}

// ── Computed Stats ──

export interface ExecutionStats {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  runningTask: TaskOutput | null
  pendingTasks: number
  blockedTasks: number
  skippedTasks: number
  progressPercent: number
}

// ── Think Form ──

export type ThinkTriggerType = 'failure' | 'user_force' | 'interval'
export type ThinkDecisionType = 'continue_next' | 'retry_current' | 'reorder' | 'stop_plan'

export interface ThinkFormInput {
  task_run_id: number
  trigger_type: ThinkTriggerType
  decision: ThinkDecisionType
  reason: string
}

export interface ThinkValidationError {
  field: 'task_run_id' | 'decision' | 'reason'
  message: string
}

// ── Timeline Event ──
// Combined view of run messages and think decisions for the timeline.

export type TimelineEventType = 'message' | 'think_decision'

export interface TimelineEvent {
  id: string
  type: TimelineEventType
  timestamp: string
  role?: MessageRole
  content: string
  metadata?: string
}
