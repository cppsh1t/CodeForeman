// ── Startup Recovery Sweep Integration Tests ──
//
// Tests the RecoveryService against a real in-memory SQLite database.
// Verifies that orphaned `running` states are reconciled deterministically
// on startup.
//
// Test categories:
// 1. "startup recovery sweep" — basic recovery of orphaned running plans
// 2. Recovery of multiple concurrent plans
// 3. Idempotency (sweep safe to run multiple times)
// 4. Partial recovery isolation (one plan failure doesn't block others)

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import { createStandaloneDatabase, type DatabaseInstance } from '@main/db/client'
import { projects, plans, tasks, taskRuns } from '@main/db/schema'
import { RecoveryService } from '@main/services/recovery'
import { PlanStatus } from '@shared/types/plan'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let sqlite: import('better-sqlite3').Database
let db: DatabaseInstance

function now(): string {
  return new Date().toISOString()
}

/**
 * Seed a complete plan hierarchy in a given status.
 * Returns all entity IDs for verification.
 */
function seedRunningPlan(
  taskCount = 3,
  currentTaskIndex = 0
): {
  projectId: number
  planId: number
  taskIds: number[]
  taskRunId: number
} {
  const timestamp = now()

  const project = db
    .insert(projects)
    .values({
      name: 'Test Project',
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp
    })
    .returning()
    .get()!

  const plan = db
    .insert(plans)
    .values({
      project_id: project.id,
      name: 'Running Plan',
      status: PlanStatus.RUNNING,
      created_at: timestamp,
      updated_at: timestamp
    })
    .returning()
    .get()!

  const taskRows = Array.from({ length: taskCount }, (_, i) => ({
    plan_id: plan.id,
    name: `Task ${i + 1}`,
    // Tasks up to currentTaskIndex are running/pending; others are pending
    status: i < currentTaskIndex ? 'success' : i === currentTaskIndex ? 'running' : 'pending',
    order_index: i,
    created_at: timestamp,
    updated_at: timestamp
  }))

  const insertedTasks = db.insert(tasks).values(taskRows).returning().all()
  const taskIds = insertedTasks.map((t) => t.id)

  // Create a running TaskRun for the current task
  const currentTaskId = taskIds[currentTaskIndex]
  const taskRun = db
    .insert(taskRuns)
    .values({
      task_id: currentTaskId,
      status: 'running',
      correlation_id: 'orphan-correlation-id',
      started_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp
    })
    .returning()
    .get()!

  return {
    projectId: project.id,
    planId: plan.id,
    taskIds,
    taskRunId: taskRun.id
  }
}

function createRecoveryService(): RecoveryService {
  return new RecoveryService(db)
}

beforeEach(() => {
  const result = createStandaloneDatabase(':memory:')
  sqlite = result.sqlite
  db = result.db

  const migrationsFolder = join(__dirname, '../../drizzle')
  migrate(db, { migrationsFolder })
})

afterEach(() => {
  sqlite.close()
})

// ===========================================================================
// Test Suite: "startup recovery sweep"
// ===========================================================================

describe('startup recovery sweep', () => {
  it('recovers orphaned running plan to blocked', () => {
    const { planId } = seedRunningPlan(3, 0)
    const service = createRecoveryService()

    const result = service.sweep()

    expect(result.plansRecovered).toBe(1)

    // Plan should now be blocked
    const plan = db.select().from(plans).where(eq(plans.id, planId)).get()!
    expect(plan.status).toBe(PlanStatus.BLOCKED)
  })

  it('reconciles orphaned running TaskRun to failed', () => {
    const { taskRunId } = seedRunningPlan(2, 0)
    const service = createRecoveryService()

    service.sweep()

    // TaskRun should be failed
    const run = db.select().from(taskRuns).where(eq(taskRuns.id, taskRunId)).get()!
    expect(run.status).toBe('failed')
    expect(run.error_code).toBe('TASK_EXECUTION_FAILED')
    expect(run.finished_at).not.toBeNull()
  })

  it('resets running task back to pending', () => {
    const { taskIds } = seedRunningPlan(3, 0)
    const service = createRecoveryService()

    service.sweep()

    // The running task (index 0) should be reset to pending
    const task = db.select().from(tasks).where(eq(tasks.id, taskIds[0])).get()!
    expect(task.status).toBe('pending')

    // Pending tasks should remain pending
    const task2 = db.select().from(tasks).where(eq(tasks.id, taskIds[1])).get()!
    expect(task2.status).toBe('pending')

    const task3 = db.select().from(tasks).where(eq(tasks.id, taskIds[2])).get()!
    expect(task3.status).toBe('pending')
  })

  it('leaves non-running plans untouched', () => {
    const timestamp = now()

    // Create a completed plan
    const project = db
      .insert(projects)
      .values({
        name: 'P',
        status: 'active',
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    const plan = db
      .insert(plans)
      .values({
        project_id: project.id,
        name: 'Completed Plan',
        status: PlanStatus.COMPLETED,
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    const service = createRecoveryService()
    const result = service.sweep()

    expect(result.plansRecovered).toBe(0)

    // Plan should still be completed
    const planAfter = db.select().from(plans).where(eq(plans.id, plan.id)).get()!
    expect(planAfter.status).toBe(PlanStatus.COMPLETED)
  })

  it('handles multiple orphaned plans independently', () => {
    seedRunningPlan(2, 0)
    seedRunningPlan(3, 1)

    const service = createRecoveryService()
    const result = service.sweep()

    expect(result.plansRecovered).toBe(2)
    expect(result.runsReconciled).toBe(2) // One running TaskRun per plan
    expect(result.tasksReset).toBe(2) // One running task per plan

    // All plans should be blocked
    const allPlans = db.select().from(plans).all()
    for (const p of allPlans) {
      expect(p.status).toBe(PlanStatus.BLOCKED)
    }

    // All TaskRuns should be failed
    const allRuns = db.select().from(taskRuns).all()
    for (const r of allRuns) {
      expect(r.status).toBe('failed')
    }
  })

  it('is idempotent — safe to run multiple times', () => {
    seedRunningPlan(2, 0)

    const service = createRecoveryService()

    // First sweep
    const result1 = service.sweep()
    expect(result1.plansRecovered).toBe(1)

    // Second sweep — nothing to do
    const result2 = service.sweep()
    expect(result2.plansRecovered).toBe(0)
    expect(result2.runsReconciled).toBe(0)
    expect(result2.tasksReset).toBe(0)
  })

  it('no lingering running states remain after recovery', () => {
    seedRunningPlan(4, 1) // Task 0 done, Task 1 running, Task 2-3 pending

    const service = createRecoveryService()
    service.sweep()

    // Verify NO entity remains in `running` state
    const runningPlans = db
      .select()
      .from(plans)
      .all()
      .filter((p) => p.status === 'running')
    expect(runningPlans).toHaveLength(0)

    const runningTasks = db
      .select()
      .from(tasks)
      .all()
      .filter((t) => t.status === 'running')
    expect(runningTasks).toHaveLength(0)

    const runningRuns = db
      .select()
      .from(taskRuns)
      .all()
      .filter((r) => r.status === 'running')
    expect(runningRuns).toHaveLength(0)
  })

  it('recovers plan with multiple completed tasks and one running', () => {
    // Create a plan where task 0 was completed and task 1 is running
    const { planId, taskIds } = seedRunningPlan(3, 1)

    // Mark task 0 as success via DB
    db.update(tasks).set({ status: 'success', updated_at: now() }).where(eq(tasks.id, taskIds[0]))

    // Mark task 0's run as success
    const timestamp = now()
    const completedRun = db
      .insert(taskRuns)
      .values({
        task_id: taskIds[0],
        status: 'success',
        correlation_id: 'completed-corr-id',
        started_at: timestamp,
        finished_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    const service = createRecoveryService()
    const result = service.sweep()

    expect(result.plansRecovered).toBe(1)
    expect(result.runsReconciled).toBe(1) // Only the running run is reconciled
    expect(result.tasksReset).toBe(1) // Only the running task is reset

    // Completed task should remain success
    const task0 = db.select().from(tasks).where(eq(tasks.id, taskIds[0])).get()!
    expect(task0.status).toBe('success')

    // Running task (index 1) should be reset to pending
    const task1 = db.select().from(tasks).where(eq(tasks.id, taskIds[1])).get()!
    expect(task1.status).toBe('pending')

    // Completed run should remain success
    const runAfter = db.select().from(taskRuns).where(eq(taskRuns.id, completedRun.id)).get()!
    expect(runAfter.status).toBe('success')

    // Plan should be blocked
    const plan = db.select().from(plans).where(eq(plans.id, planId)).get()!
    expect(plan.status).toBe(PlanStatus.BLOCKED)
  })

  it('handles empty database gracefully', () => {
    const service = createRecoveryService()
    const result = service.sweep()

    expect(result.plansRecovered).toBe(0)
    expect(result.runsReconciled).toBe(0)
    expect(result.tasksReset).toBe(0)
    expect(result.details).toHaveLength(0)
  })

  it('recovery details contain per-plan information', () => {
    const { planId } = seedRunningPlan(2, 0)

    const service = createRecoveryService()
    const result = service.sweep()

    expect(result.details).toHaveLength(1)
    expect(result.details[0].planId).toBe(planId)
  })
})

// ===========================================================================
// Test Suite: "recovery edge cases" — Additional sweep scenarios
// ===========================================================================

describe('recovery edge cases', () => {
  it('does not recover plans that are blocked (not running)', () => {
    const timestamp = now()

    const project = db
      .insert(projects)
      .values({
        name: 'P',
        status: 'active',
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    db.insert(plans)
      .values({
        project_id: project.id,
        name: 'Blocked Plan',
        status: PlanStatus.BLOCKED,
        created_at: timestamp,
        updated_at: timestamp
      })
      .run()

    const service = createRecoveryService()
    const result = service.sweep()

    expect(result.plansRecovered).toBe(0)
  })

  it('does not recover plans that are paused (not orphaned)', () => {
    const timestamp = now()

    const project = db
      .insert(projects)
      .values({
        name: 'P',
        status: 'active',
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    db.insert(plans)
      .values({
        project_id: project.id,
        name: 'Paused Plan',
        status: PlanStatus.PAUSED,
        created_at: timestamp,
        updated_at: timestamp
      })
      .run()

    const service = createRecoveryService()
    const result = service.sweep()

    expect(result.plansRecovered).toBe(0)
  })

  it('handles plan with running task but no TaskRun gracefully', () => {
    const timestamp = now()

    const project = db
      .insert(projects)
      .values({
        name: 'P',
        status: 'active',
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    const plan = db
      .insert(plans)
      .values({
        project_id: project.id,
        name: 'Orphan Plan',
        status: PlanStatus.RUNNING,
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    db.insert(tasks)
      .values({
        plan_id: plan.id,
        name: 'Orphan Task',
        status: 'running',
        order_index: 0,
        created_at: timestamp,
        updated_at: timestamp
      })
      .run()

    const service = createRecoveryService()
    const result = service.sweep()

    // Should still recover the plan even without a TaskRun
    expect(result.plansRecovered).toBe(1)
  })

  it('recovery sweep is safe on database with only completed plans', () => {
    const timestamp = now()

    for (let i = 0; i < 5; i++) {
      const project = db
        .insert(projects)
        .values({
          name: `P${i}`,
          status: 'active',
          created_at: timestamp,
          updated_at: timestamp
        })
        .returning()
        .get()!

      db.insert(plans)
        .values({
          project_id: project.id,
          name: `Completed Plan ${i}`,
          status: PlanStatus.COMPLETED,
          created_at: timestamp,
          updated_at: timestamp
        })
        .run()
    }

    const service = createRecoveryService()
    const result = service.sweep()

    expect(result.plansRecovered).toBe(0)
    expect(result.runsReconciled).toBe(0)
    expect(result.tasksReset).toBe(0)
  })
})
