import type { BaseEntity, TaskRunId, ThinkDecisionId } from './common'
import type { CorrelationId } from './correlation'

// ── Trigger Type (what caused the think decision) ──

export const TriggerType = {
  FAILURE: 'failure',
  USER_FORCE: 'user_force',
  INTERVAL: 'interval'
} as const

export type TriggerType = (typeof TriggerType)[keyof typeof TriggerType]

// ── Think Decision Type (what action to take) ──

export const ThinkDecisionType = {
  CONTINUE_NEXT: 'continue_next',
  RETRY_CURRENT: 'retry_current',
  REORDER: 'reorder',
  STOP_PLAN: 'stop_plan'
} as const

export type ThinkDecisionType = (typeof ThinkDecisionType)[keyof typeof ThinkDecisionType]

// ── ThinkDecision Entity ──

export interface ThinkDecision extends BaseEntity {
  id: ThinkDecisionId
  task_run_id: TaskRunId
  correlation_id: CorrelationId
  trigger_type: TriggerType
  decision: ThinkDecisionType
  reason: string
}
