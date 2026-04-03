// ── Orchestrator Service — Single-Executor State Machine ──
//
// Manages plan/task/run lifecycle transitions with strict serial semantics.
// One active run at most per plan. Tasks progress strictly by order_index.
//
// Operations: start / pause / resume / stop / tick
//
// Design decisions:
// - Transition matrix encodes all legal plan status transitions.
// - Illegal transitions fail fast with OrchestratorTransitionError.
// - Duplicate start is idempotent (plan already running → return success).
// - All multi-table mutations go through withTransaction for atomicity.
// - Composes TransactionFacade for start/complete; adds own atomic ops for pause/resume/stop/tick.
// - tick completes current run and advances to next task (or marks plan completed).

import type { DatabaseInstance } from '@main/db/client'
import { withTransaction } from '@main/db'
import { TransactionFacade } from '@main/repositories'
import { PlanRepository } from '@main/repositories/plan'
import type { PlanRow } from '@main/repositories/plan'
import { TaskRepository } from '@main/repositories/task'
import { TaskRunRepository } from '@main/repositories/task-run'
import { PlanStatus } from '@shared/types/plan'
import { ErrorCode } from '@shared/types/task-run'
import { generateCorrelationId } from '@shared/types/correlation'

// ── Error Class ──

export class OrchestratorTransitionError extends Error {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'OrchestratorTransitionError'
  }
}

// ── Transition Matrix ──
//
// Maps each plan status to the set of statuses it can legally transition to.
// Any transition not in this matrix is rejected with INVALID_INPUT.

const ALLOWED_TRANSITIONS: Record<PlanStatus, readonly PlanStatus[]> = {
  [PlanStatus.DRAFT]: [],
  [PlanStatus.READY]: [PlanStatus.RUNNING],
  [PlanStatus.RUNNING]: [PlanStatus.PAUSED, PlanStatus.STOPPED, PlanStatus.COMPLETED],
  [PlanStatus.PAUSED]: [PlanStatus.RUNNING, PlanStatus.STOPPED],
  [PlanStatus.COMPLETED]: [],
  [PlanStatus.BLOCKED]: [],
  [PlanStatus.STOPPED]: []
}

// ── Helper: timestamp ──

function now(): string {
  return new Date().toISOString()
}

// ── Orchestrator Service ──

export class OrchestratorService {
  constructor(
    private readonly db: DatabaseInstance,
    private readonly facade: TransactionFacade
  ) {}

  // ── Transition Guard ──

  /**
   * Check if a transition from `current` to `requested` is legal.
   * Throws OrchestratorTransitionError if not.
   */
  private guardTransition(current: string, requested: PlanStatus, planId: number): void {
    const allowed = ALLOWED_TRANSITIONS[current as PlanStatus] ?? []
    if (!allowed.includes(requested)) {
      throw new OrchestratorTransitionError(
        ErrorCode.INVALID_INPUT,
        `Illegal transition: plan ${planId} is "${current}", cannot transition to "${requested}"`
      )
    }
  }

  // ── Plan Lookup ──

  private getPlan(planId: number): PlanRow {
    const repo = new PlanRepository(this.db)
    const plan = repo.findById(planId)
    if (!plan) {
      throw new OrchestratorTransitionError(ErrorCode.NOT_FOUND, `Plan not found: id=${planId}`)
    }
    return plan as PlanRow
  }

  // ── Start Execution ──

  /**
   * Start plan execution: plan ready → running, first pending task → running, create TaskRun.
   * Duplicate start (plan already running) is idempotent — returns success.
   *
   * @throws OrchestratorTransitionError if plan is in a non-startable state.
   */
  start(planId: number): { plan_id: number } {
    const plan = this.getPlan(planId)

    // Idempotent: if already running, return success without side effects
    if (plan.status === PlanStatus.RUNNING) {
      return { plan_id: planId }
    }

    this.guardTransition(plan.status, PlanStatus.RUNNING, planId)

    // Delegate atomic start to TransactionFacade
    const correlationId = generateCorrelationId()
    const result = this.facade.startPlanExecution(planId, correlationId)
    return { plan_id: result.plan.id }
  }

  // ── Pause Execution ──

  /**
   * Pause a running plan: running → paused.
   * Cancels the active TaskRun and resets the running task back to pending.
   *
   * @throws OrchestratorTransitionError if plan is not running.
   */
  pause(planId: number): { plan_id: number } {
    const plan = this.getPlan(planId)

    // Idempotent: if already paused, return success
    if (plan.status === PlanStatus.PAUSED) {
      return { plan_id: planId }
    }

    this.guardTransition(plan.status, PlanStatus.PAUSED, planId)

    return withTransaction(this.db, (txDb) => {
      const txPlanRepo = new PlanRepository(txDb)
      const txTaskRepo = new TaskRepository(txDb)
      const txTaskRunRepo = new TaskRunRepository(txDb)
      const timestamp = now()

      // Find the currently running task (there should be at most one)
      const tasks = txTaskRepo.findByPlanId(planId)
      const runningTask = tasks.find((t) => t.status === 'running')

      if (runningTask) {
        // Find and cancel the running TaskRun for this task
        const runs = txTaskRunRepo.findByTaskId(runningTask.id)
        const activeRun = runs.find((r) => r.status === 'running')

        if (activeRun) {
          txTaskRunRepo.updateTaskRun(activeRun.id, {
            status: 'cancelled',
            finished_at: timestamp,
            updated_at: timestamp
          })
        }

        // Reset task to pending so it can be re-run on resume
        txTaskRepo.updateTask(runningTask.id, {
          status: 'pending',
          updated_at: timestamp
        })
      }

      // Set plan to paused
      const updatedPlan = txPlanRepo.updatePlan(planId, {
        status: 'paused',
        updated_at: timestamp
      })

      if (!updatedPlan) {
        throw new Error(`Failed to pause plan: id=${planId}`)
      }

      return { plan_id: planId }
    })
  }

  // ── Resume Execution ──

  /**
   * Resume a paused plan: paused → running.
   * Finds the next pending task by order_index and starts execution.
   *
   * @throws OrchestratorTransitionError if plan is not paused.
   */
  resume(planId: number): { plan_id: number } {
    const plan = this.getPlan(planId)

    // Idempotent: if already running, return success
    if (plan.status === PlanStatus.RUNNING) {
      return { plan_id: planId }
    }

    this.guardTransition(plan.status, PlanStatus.RUNNING, planId)

    return withTransaction(this.db, (txDb) => {
      const txPlanRepo = new PlanRepository(txDb)
      const txTaskRepo = new TaskRepository(txDb)
      const txTaskRunRepo = new TaskRunRepository(txDb)
      const timestamp = now()

      // Find next pending task by order_index
      const tasks = txTaskRepo.findByPlanId(planId)
      const nextTask = tasks.find((t) => t.status === 'pending')

      if (!nextTask) {
        // No pending tasks — mark plan as completed instead of resuming
        txPlanRepo.updatePlan(planId, {
          status: 'completed',
          updated_at: timestamp
        })
        return { plan_id: planId }
      }

      // Start the next task
      const updatedTask = txTaskRepo.updateTask(nextTask.id, {
        status: 'running',
        updated_at: timestamp
      })

      if (!updatedTask) {
        throw new Error(`Failed to resume task: id=${nextTask.id}`)
      }

      // Create a new TaskRun
      const correlationId = generateCorrelationId()
      txTaskRunRepo.insert({
        task_id: nextTask.id,
        status: 'running',
        correlation_id: correlationId,
        started_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      })

      // Set plan to running
      const updatedPlan = txPlanRepo.updatePlan(planId, {
        status: 'running',
        updated_at: timestamp
      })

      if (!updatedPlan) {
        throw new Error(`Failed to resume plan: id=${planId}`)
      }

      return { plan_id: planId }
    })
  }

  // ── Stop Execution ──

  /**
   * Stop a running or paused plan: running/paused → stopped.
   * Cancels any active TaskRun and resets the running task back to pending.
   *
   * @throws OrchestratorTransitionError if plan is not running or paused.
   */
  stop(planId: number): { plan_id: number } {
    const plan = this.getPlan(planId)

    // Idempotent: if already stopped, return success
    if (plan.status === PlanStatus.STOPPED) {
      return { plan_id: planId }
    }

    this.guardTransition(plan.status, PlanStatus.STOPPED, planId)

    return withTransaction(this.db, (txDb) => {
      const txPlanRepo = new PlanRepository(txDb)
      const txTaskRepo = new TaskRepository(txDb)
      const txTaskRunRepo = new TaskRunRepository(txDb)
      const timestamp = now()

      // If plan is running, cancel the active task and TaskRun
      if (plan.status === PlanStatus.RUNNING) {
        const tasks = txTaskRepo.findByPlanId(planId)
        const runningTask = tasks.find((t) => t.status === 'running')

        if (runningTask) {
          const runs = txTaskRunRepo.findByTaskId(runningTask.id)
          const activeRun = runs.find((r) => r.status === 'running')

          if (activeRun) {
            txTaskRunRepo.updateTaskRun(activeRun.id, {
              status: 'cancelled',
              finished_at: timestamp,
              updated_at: timestamp
            })
          }

          // Reset task to pending
          txTaskRepo.updateTask(runningTask.id, {
            status: 'pending',
            updated_at: timestamp
          })
        }
      }

      // Set plan to stopped
      const updatedPlan = txPlanRepo.updatePlan(planId, {
        status: 'stopped',
        updated_at: timestamp
      })

      if (!updatedPlan) {
        throw new Error(`Failed to stop plan: id=${planId}`)
      }

      return { plan_id: planId }
    })
  }

  // ── Tick (Advance to Next Task) ──

  /**
   * Advance execution after a task run completes.
   * Atomically:
   * 1. Complete the current TaskRun (success/failed)
   * 2. If more pending tasks exist → start the next one (create new TaskRun, set task to running)
   * 3. If no more pending tasks → mark plan as completed
   *
   * @param taskRunId - The currently active TaskRun to complete
   * @param status - Final status of the run ('success' or 'failed')
   * @param errorCode - Optional error code for failed runs
   */
  tick(
    planId: number,
    taskRunId: number,
    status: 'success' | 'failed',
    errorCode?: string
  ): { plan_id: number } {
    const plan = this.getPlan(planId)

    // Tick only valid when plan is running
    if (plan.status !== PlanStatus.RUNNING) {
      throw new OrchestratorTransitionError(
        ErrorCode.INVALID_INPUT,
        `Cannot tick: plan ${planId} is "${plan.status}", expected "running"`
      )
    }

    return withTransaction(this.db, (txDb) => {
      const txPlanRepo = new PlanRepository(txDb)
      const txTaskRepo = new TaskRepository(txDb)
      const txTaskRunRepo = new TaskRunRepository(txDb)
      const timestamp = now()

      // Step 1: Complete the current TaskRun via TransactionFacade pattern
      const taskRun = txTaskRunRepo.updateTaskRun(taskRunId, {
        status,
        error_code: errorCode ?? null,
        finished_at: timestamp,
        updated_at: timestamp
      })

      if (!taskRun) {
        throw new OrchestratorTransitionError(
          ErrorCode.NOT_FOUND,
          `TaskRun not found: id=${taskRunId}`
        )
      }

      // Update parent task status
      const taskStatus = status === 'success' ? 'success' : 'failed'
      const task = txTaskRepo.updateTask(taskRun.task_id, {
        status: taskStatus,
        updated_at: timestamp
      })

      if (!task) {
        throw new OrchestratorTransitionError(
          ErrorCode.NOT_FOUND,
          `Task not found: id=${taskRun.task_id}`
        )
      }

      // Step 2: Check for next pending task by order_index
      const allTasks = txTaskRepo.findByPlanId(planId)
      const nextTask = allTasks.find((t) => t.status === 'pending')

      if (nextTask) {
        // Start the next task
        txTaskRepo.updateTask(nextTask.id, {
          status: 'running',
          updated_at: timestamp
        })

        // Create new TaskRun for the next task
        const correlationId = generateCorrelationId()
        txTaskRunRepo.insert({
          task_id: nextTask.id,
          status: 'running',
          correlation_id: correlationId,
          started_at: timestamp,
          created_at: timestamp,
          updated_at: timestamp
        })
        // Plan stays running — no status change needed
      } else {
        // No more pending tasks — mark plan as completed.
        // In V1, both all-success and mixed-success/failed result in completed.
        // A single failure blocks further progression, so if we're here with
        // a failed task and no more pending tasks, the plan is done.
        txPlanRepo.updatePlan(planId, {
          status: PlanStatus.COMPLETED,
          updated_at: timestamp
        })
      }

      return { plan_id: planId }
    })
  }
}
