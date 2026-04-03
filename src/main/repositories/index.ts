// ── Repository Layer Barrel Export ──
//
// Single entry point for all repository classes.
// Import from '@main/repositories' to access data access layer.

export { BaseRepository, type PaginationParams, type PaginatedResult } from './base'
export { ProjectRepository, type ProjectRow } from './project'
export { PlanRepository, type PlanRow } from './plan'
export { PlanMaterialRepository, type PlanMaterialRow } from './plan-material'
export { TaskRepository, type TaskRow } from './task'
export { TaskRunRepository, type TaskRunRow } from './task-run'
export { RunMessageRepository, type RunMessageRow } from './run-message'
export { ThinkDecisionRepository, type ThinkDecisionRow } from './think-decision'
export {
  TransactionFacade,
  type StartPlanExecutionResult,
  type CompleteTaskRunResult
} from './transaction-facade'
