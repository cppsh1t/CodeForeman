import type { BaseEntity, PlanId, ProjectId } from './common'

// ── Plan Status ──
// State machine: draft → ready → running → (paused | blocked | completed | stopped)

export const PlanStatus = {
  DRAFT: 'draft',
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
  STOPPED: 'stopped'
} as const

export type PlanStatus = (typeof PlanStatus)[keyof typeof PlanStatus]

// ── Plan Entity ──

export interface Plan extends BaseEntity {
  id: PlanId
  project_id: ProjectId
  name: string
  description: string
  status: PlanStatus
}
