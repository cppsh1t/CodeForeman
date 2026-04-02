import type { BaseEntity, PlanId, TaskId } from './common'

// ── Task Status ──
// State machine: pending → running → (success | failed | blocked | skipped)

export const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  BLOCKED: 'blocked',
  SKIPPED: 'skipped'
} as const

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus]

// ── Task Entity ──

export interface Task extends BaseEntity {
  id: TaskId
  plan_id: PlanId
  name: string
  description: string
  status: TaskStatus
  order_index: number
}
