// ── Startup Recovery Sweep ──
//
// Scans for orphaned `running` state on app startup and reconciles
// deterministically:
//
// 1. Find all plans with status='running' — these are orphaned (process crashed).
// 2. For each orphaned plan:
//    a. Mark all `running` TaskRuns as `failed` with error_code=CRASH_RECOVERY.
//    b. Reset all `running` tasks to `pending` (re-executable on user resume).
//    c. Set plan status to `blocked` (requires user decision to continue).
//
// Design decisions:
// - Each plan's reconciliation is its own transaction (partial failure isolation).
// - Recovery is idempotent: safe to run multiple times (only acts on `running`).
// - Bounded: only touches `running` entities, no full table scans.
// - Deterministic: every `running` entity converges to a terminal/resettable state.
// - Errors in recovering one plan are logged but don't block other plans.

import { eq } from 'drizzle-orm'
import type { DatabaseInstance } from '@main/db/client'
import { withTransaction } from '@main/db'
import { plans } from '@main/db/schema'
import { PlanRepository, type PlanRow } from '@main/repositories/plan'
import { TaskRepository } from '@main/repositories/task'
import { TaskRunRepository } from '@main/repositories/task-run'
import { PlanStatus } from '@shared/types/plan'
import { ErrorCode } from '@shared/types/task-run'

// ── Recovery Result ──

export interface RecoveryResult {
  /** Number of plans recovered from `running` to `blocked`. */
  plansRecovered: number
  /** Number of TaskRuns transitioned from `running` to `failed`. */
  runsReconciled: number
  /** Number of tasks reset from `running` to `pending`. */
  tasksReset: number
  /** Individual plan recovery details (for logging). */
  details: Array<{ planId: number; runsReconciled: number; tasksReset: number }>
}

// ── Recovery Service ──

export class RecoveryService {
  constructor(private readonly db: DatabaseInstance) {}

  /**
   * Perform a startup recovery sweep.
   *
   * Finds all orphaned `running` plans and reconciles their child entities
   * to a consistent state. Each plan is recovered in its own transaction.
   *
   * @returns RecoveryResult with counts and per-plan details.
   */
  sweep(): RecoveryResult {
    const planRepo = new PlanRepository(this.db)
    const result: RecoveryResult = {
      plansRecovered: 0,
      runsReconciled: 0,
      tasksReset: 0,
      details: []
    }

    // Find all running plans — these are orphaned (process crashed before
    // normal completion/transition). Use filtered query to avoid full table scan.
    const runningPlans = planRepo.findAll(eq(plans.status, PlanStatus.RUNNING)) as PlanRow[]

    if (runningPlans.length === 0) {
      return result
    }

    // Recover each plan in its own transaction for isolation
    for (const plan of runningPlans as PlanRow[]) {
      try {
        const planResult = this.recoverPlan(plan.id)
        result.plansRecovered++
        result.runsReconciled += planResult.runsReconciled
        result.tasksReset += planResult.tasksReset
        result.details.push(planResult)
      } catch (err) {
        // Log but don't abort — other plans should still be recovered
        console.error(
          `[recovery] Failed to recover plan ${(plan as PlanRow).id}:`,
          err instanceof Error ? err.message : String(err)
        )
      }
    }

    console.info(
      `[recovery] Sweep complete: ${result.plansRecovered} plans, ` +
        `${result.runsReconciled} runs, ${result.tasksReset} tasks`
    )

    return result
  }

  /**
   * Recover a single orphaned plan within a transaction.
   *
   * 1. Mark all `running` TaskRuns → `failed` (error_code=CRASH_RECOVERY)
   * 2. Reset all `running` tasks → `pending`
   * 3. Set plan → `blocked`
   */
  private recoverPlan(planId: number): {
    planId: number
    runsReconciled: number
    tasksReset: number
  } {
    return withTransaction(this.db, (txDb) => {
      const txPlanRepo = new PlanRepository(txDb)
      const txTaskRepo = new TaskRepository(txDb)
      const txTaskRunRepo = new TaskRunRepository(txDb)
      const timestamp = new Date().toISOString()

      // 1. Find all tasks for this plan
      const tasks = txTaskRepo.findByPlanId(planId)

      let runsReconciled = 0
      let tasksReset = 0

      // 2. For each task, reconcile its runs
      for (const task of tasks) {
        if (task.status === 'running') {
          // Find and fail all running TaskRuns
          const runs = txTaskRunRepo.findByTaskId(task.id)
          for (const run of runs) {
            if (run.status === 'running') {
              txTaskRunRepo.updateTaskRun(run.id, {
                status: 'failed',
                error_code: ErrorCode.TASK_EXECUTION_FAILED,
                finished_at: timestamp,
                updated_at: timestamp
              })
              runsReconciled++
            }
          }

          // Reset task to pending so it can be re-run
          txTaskRepo.updateTask(task.id, {
            status: 'pending',
            updated_at: timestamp
          })
          tasksReset++
        }
      }

      // 3. Set plan to blocked (user must decide to continue/stop)
      const updatedPlan = txPlanRepo.updatePlan(planId, {
        status: PlanStatus.BLOCKED,
        updated_at: timestamp
      })

      if (!updatedPlan) {
        throw new Error(`Failed to set plan ${planId} to blocked`)
      }

      return { planId, runsReconciled, tasksReset }
    })
  }
}
