// ── Unified Domain Contract Barrel ──
//
// Single source of truth for all domain types, status enums, error codes.
// Importable from main / preload / renderer.

// Common
export type {
  Timestamp,
  ProjectId,
  PlanId,
  TaskId,
  TaskRunId,
  ThinkDecisionId,
  MaterialId,
  MessageId,
  BaseEntity
} from './common'

// Correlation
export { isCorrelationId, generateCorrelationId } from './correlation'
export type { CorrelationId } from './correlation'

// Project
export { ProjectStatus } from './project'
export type { Project, ProjectStatus as ProjectStatusType } from './project'

// Plan
export { PlanStatus } from './plan'
export type { Plan, PlanStatus as PlanStatusType } from './plan'

// PlanMaterial
export { MaterialType, MaterialSource } from './plan-material'
export type {
  PlanMaterial,
  MaterialType as MaterialTypeType,
  MaterialSource as MaterialSourceType
} from './plan-material'

// Task
export { TaskStatus } from './task'
export type { Task, TaskStatus as TaskStatusType } from './task'

// TaskRun + ErrorCode
export { TaskRunStatus, ErrorCode } from './task-run'
export type {
  TaskRun,
  TaskRunStatus as TaskRunStatusType,
  ErrorCode as ErrorCodeType
} from './task-run'

// RunMessage
export { MessageRole } from './run-message'
export type { RunMessage, MessageRole as MessageRoleType } from './run-message'

// ThinkDecision
export { TriggerType, ThinkDecisionType } from './think-decision'
export type {
  ThinkDecision,
  TriggerType as TriggerTypeType,
  ThinkDecisionType as ThinkDecisionTypeType
} from './think-decision'
