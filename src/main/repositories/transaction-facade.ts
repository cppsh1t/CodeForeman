// ── Transaction Facade ──
//
// Single atomic entrypoint for cross-table writes.
// Every method wraps its operations in a database transaction so that
// partial writes are never persisted.
//
// Key operations:
// - startPlanExecution: plan → running, first task → running, create TaskRun
// - completeTaskRun: finish a TaskRun + advance task status
// - persistRunMessages: batch-insert messages under a single transaction
// - submitThinkDecision: record decision + optionally update TaskRun
//
// Design decisions:
// - Receives a DatabaseInstance (may be the singleton or a tx-scoped one).
// - Internally calls withTransaction() for its own atomic boundary.
// - Throws on failure so the caller knows the operation did not persist.

import type { DatabaseInstance } from '@main/db/client'
import { withTransaction } from '@main/db'
import { PlanRepository, type PlanRow } from './plan'
import { TaskRepository, type TaskRow } from './task'
import { TaskRunRepository, type TaskRunRow } from './task-run'
import { RunMessageRepository, type RunMessageRow } from './run-message'
import { ThinkDecisionRepository, type ThinkDecisionRow } from './think-decision'

// ── Facade Result Types ──

export interface StartPlanExecutionResult {
  plan: PlanRow
  task: TaskRow
  taskRun: TaskRunRow
}

export interface CompleteTaskRunResult {
  task: TaskRow
  taskRun: TaskRunRow
}

// ── Transaction Facade ──

export class TransactionFacade {
  constructor(private readonly db: DatabaseInstance) {}

  // ── Plan Start ──

  /**
   * Atomically start plan execution:
   * 1. Set plan status to 'running'
   * 2. Set the first pending task to 'running'
   * 3. Create a TaskRun for that task
   *
   * Returns all three updated/created entities.
   * Throws if the plan or first task is not found.
   */
  startPlanExecution(planId: number, correlationId: string): StartPlanExecutionResult {
    return withTransaction(this.db, (txDb) => {
      const txPlanRepo = new PlanRepository(txDb)
      const txTaskRepo = new TaskRepository(txDb)
      const txTaskRunRepo = new TaskRunRepository(txDb)

      const now = new Date().toISOString()

      // 1. Set plan to running
      const plan = txPlanRepo.updatePlan(planId, { status: 'running', updated_at: now })
      if (!plan) {
        throw new Error(`Plan not found: id=${planId}`)
      }

      // 2. Find first pending task ordered by order_index
      const pendingTasks = txTaskRepo.findByPlanId(planId).filter((t) => t.status === 'pending')
      if (pendingTasks.length === 0) {
        throw new Error(`No pending tasks found for plan: id=${planId}`)
      }

      const task = pendingTasks[0]

      // 3. Set task to running
      const updatedTask = txTaskRepo.updateTask(task.id, {
        status: 'running',
        updated_at: now
      })
      if (!updatedTask) {
        throw new Error(`Failed to update task: id=${task.id}`)
      }

      // 4. Create TaskRun
      const taskRun = txTaskRunRepo.insert({
        task_id: updatedTask.id,
        status: 'running',
        correlation_id: correlationId,
        started_at: now,
        created_at: now,
        updated_at: now
      })

      return { plan, task: updatedTask, taskRun }
    })
  }

  // ── Task Status Progression ──

  /**
   * Atomically complete a TaskRun and update task status.
   *
   * @param taskRunId - The running TaskRun to complete
   * @param status - Final status ('success' or 'failed')
   * @param errorCode - Optional error code for failed runs
   */
  completeTaskRun(
    taskRunId: number,
    status: 'success' | 'failed',
    errorCode?: string
  ): CompleteTaskRunResult {
    return withTransaction(this.db, (txDb) => {
      const txTaskRunRepo = new TaskRunRepository(txDb)
      const txTaskRepo = new TaskRepository(txDb)

      const now = new Date().toISOString()

      // 1. Update TaskRun
      const taskRun = txTaskRunRepo.updateTaskRun(taskRunId, {
        status,
        error_code: errorCode ?? null,
        finished_at: now,
        updated_at: now
      })
      if (!taskRun) {
        throw new Error(`TaskRun not found: id=${taskRunId}`)
      }

      // 2. Map run status to task status
      const taskStatus = status === 'success' ? 'success' : 'failed'

      // 3. Update parent task
      const task = txTaskRepo.updateTask(taskRun.task_id, {
        status: taskStatus,
        updated_at: now
      })
      if (!task) {
        throw new Error(`Task not found: id=${taskRun.task_id}`)
      }

      return { task, taskRun }
    })
  }

  // ── Run Message Persistence ──

  /**
   * Atomically persist multiple run messages.
   * All messages are inserted or none are.
   *
   * @param taskRunId - The TaskRun to attach messages to
   * @param messages - Array of message data (role, content, correlation_id)
   * @returns The inserted messages
   */
  persistRunMessages(
    taskRunId: number,
    messages: Array<{ correlation_id: string; role: string; content: string }>
  ): RunMessageRow[] {
    return withTransaction(this.db, (txDb) => {
      const txMessageRepo = new RunMessageRepository(txDb)
      const now = new Date().toISOString()

      if (messages.length === 0) return []

      const rows = messages.map((msg) => ({
        task_run_id: taskRunId,
        correlation_id: msg.correlation_id,
        role: msg.role,
        content: msg.content,
        created_at: now,
        updated_at: now
      }))

      return txMessageRepo.insertMany(rows) as RunMessageRow[]
    })
  }

  // ── Think Decision Submission ──

  /**
   * Atomically record a think decision.
   *
   * @param taskRunId - The TaskRun this decision belongs to
   * @param data - Decision fields (correlation_id, trigger_type, decision, reason)
   * @returns The created ThinkDecision
   */
  submitThinkDecision(
    taskRunId: number,
    data: {
      correlation_id: string
      trigger_type: string
      decision: string
      reason: string
    }
  ): ThinkDecisionRow {
    return withTransaction(this.db, (txDb) => {
      const txThinkRepo = new ThinkDecisionRepository(txDb)
      const now = new Date().toISOString()

      return txThinkRepo.insert({
        task_run_id: taskRunId,
        correlation_id: data.correlation_id,
        trigger_type: data.trigger_type,
        decision: data.decision,
        reason: data.reason,
        created_at: now,
        updated_at: now
      }) as ThinkDecisionRow
    })
  }
}
