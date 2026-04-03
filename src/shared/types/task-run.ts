import type { BaseEntity, TaskId, TaskRunId, Timestamp } from './common'
import type { CorrelationId } from './correlation'

// ── TaskRun Status ──

export const TaskRunStatus = {
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
} as const

export type TaskRunStatus = (typeof TaskRunStatus)[keyof typeof TaskRunStatus]

// ── Error Code ──

export const ErrorCode = {
  // General
  UNKNOWN: 'UNKNOWN',
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',

  // Task execution
  TASK_EXECUTION_FAILED: 'TASK_EXECUTION_FAILED',
  TASK_TIMEOUT: 'TASK_TIMEOUT',

  // IPC
  IPC_CHANNEL_ERROR: 'IPC_CHANNEL_ERROR',
  IPC_TIMEOUT: 'IPC_TIMEOUT',

  // Database
  DB_ERROR: 'DB_ERROR',
  DB_CONSTRAINT: 'DB_CONSTRAINT',

  // AI / OpenCode
  AI_API_ERROR: 'AI_API_ERROR',
  AI_RATE_LIMITED: 'AI_RATE_LIMITED',
  AI_CONTEXT_TOO_LONG: 'AI_CONTEXT_TOO_LONG'

  // Auth errors mapped to AI_API_ERROR (no separate auth error codes)
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

// ── TaskRun Entity ──

export interface TaskRun extends BaseEntity {
  id: TaskRunId
  task_id: TaskId
  status: TaskRunStatus
  correlation_id: CorrelationId
  error_code: ErrorCode | null
  started_at: Timestamp | null
  finished_at: Timestamp | null
}
