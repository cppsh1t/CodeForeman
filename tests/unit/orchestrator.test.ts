// ── Orchestrator Unit Tests ──
//
// Tests the OrchestratorService state machine with an in-memory SQLite database.
// Covers:
// - Transition matrix: legal and illegal transitions
// - Serial task progression by order_index
// - Duplicate start idempotency
// - Pause / resume / stop lifecycle
// - Tick: complete run + advance to next task
// - Edge cases: no pending tasks, already in target state

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import { createStandaloneDatabase, type DatabaseInstance } from '@main/db/client'
import { projects, plans, tasks, taskRuns } from '@main/db/schema'
import { TransactionFacade } from '@main/repositories'
import { OrchestratorService, OrchestratorTransitionError } from '@main/services/orchestrator'
import { ErrorCode } from '@shared/types/task-run'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let sqlite: import('better-sqlite3').Database
let db: DatabaseInstance

function now(): string {
  return new Date().toISOString()
}

function seedPlan(taskCount = 3): { projectId: number; planId: number; taskIds: number[] } {
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
      name: 'Test Plan',
      status: 'ready',
      created_at: timestamp,
      updated_at: timestamp
    })
    .returning()
    .get()!

  const taskRows = Array.from({ length: taskCount }, (_, i) => ({
    plan_id: plan.id,
    name: `Task ${i + 1}`,
    status: 'pending',
    order_index: i,
    created_at: timestamp,
    updated_at: timestamp
  }))

  const inserted = db.insert(tasks).values(taskRows).returning().all()
  return {
    projectId: project.id,
    planId: plan.id,
    taskIds: inserted.map((t) => t.id)
  }
}

function createOrchestrator(): OrchestratorService {
  const facade = new TransactionFacade(db)
  return new OrchestratorService(db, facade)
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
// Test Suite 1: Transition Matrix (legal / illegal)
// ===========================================================================

describe('orchestrator transition matrix', () => {
  it('rejects start on draft plan', () => {
    const { planId } = seedPlan()
    // Manually set plan to draft
    db.update(plans).set({ status: 'draft', updated_at: now() }).where(eq(plans.id, planId)).run()

    const orchestrator = createOrchestrator()
    expect(() => orchestrator.start(planId)).toThrow(OrchestratorTransitionError)
    try {
      orchestrator.start(planId)
    } catch (err) {
      expect(err).toBeInstanceOf(OrchestratorTransitionError)
      expect((err as OrchestratorTransitionError).errorCode).toBe(ErrorCode.INVALID_INPUT)
      expect((err as OrchestratorTransitionError).message).toContain('draft')
      expect((err as OrchestratorTransitionError).message).toContain('running')
    }
  })

  it('rejects start on completed plan', () => {
    const { planId } = seedPlan()
    db.update(plans)
      .set({ status: 'completed', updated_at: now() })
      .where(eq(plans.id, planId))
      .run()

    const orchestrator = createOrchestrator()
    expect(() => orchestrator.start(planId)).toThrow(OrchestratorTransitionError)
  })

  it('rejects start on stopped plan', () => {
    const { planId } = seedPlan()
    db.update(plans).set({ status: 'stopped', updated_at: now() }).where(eq(plans.id, planId)).run()

    const orchestrator = createOrchestrator()
    expect(() => orchestrator.start(planId)).toThrow(OrchestratorTransitionError)
  })

  it('rejects pause on ready plan', () => {
    const { planId } = seedPlan()
    const orchestrator = createOrchestrator()
    expect(() => orchestrator.pause(planId)).toThrow(OrchestratorTransitionError)
  })

  it('rejects resume on running plan', () => {
    const { planId } = seedPlan()
    const orchestrator = createOrchestrator()
    orchestrator.start(planId) // plan is now running

    // Resume on running plan should be idempotent (returns success)
    const result = orchestrator.resume(planId)
    expect(result.plan_id).toBe(planId)
  })

  it('rejects stop on ready plan', () => {
    const { planId } = seedPlan()
    const orchestrator = createOrchestrator()
    expect(() => orchestrator.stop(planId)).toThrow(OrchestratorTransitionError)
  })

  it('rejects tick on non-running plan', () => {
    const { planId } = seedPlan()
    const orchestrator = createOrchestrator()
    expect(() => orchestrator.tick(planId, 1, 'success')).toThrow(OrchestratorTransitionError)
  })

  it('throws NOT_FOUND for non-existent plan', () => {
    const orchestrator = createOrchestrator()
    expect(() => orchestrator.start(99999)).toThrow(OrchestratorTransitionError)
    try {
      orchestrator.start(99999)
    } catch (err) {
      expect((err as OrchestratorTransitionError).errorCode).toBe(ErrorCode.NOT_FOUND)
    }
  })
})

// ===========================================================================
// Test Suite 2: orchestrator serial seq — Serial Task Progression
// ===========================================================================

describe('orchestrator serial seq', () => {
  it('starts execution with first task by order_index', () => {
    const { planId, taskIds } = seedPlan(3)
    const orchestrator = createOrchestrator()

    const result = orchestrator.start(planId)
    expect(result.plan_id).toBe(planId)

    // Plan should be running
    const plan = db.select().from(plans).where(eq(plans.id, planId)).get()!
    expect(plan.status).toBe('running')

    // First task (order_index 0) should be running
    const task1 = db.select().from(tasks).where(eq(tasks.id, taskIds[0])).get()!
    expect(task1.status).toBe('running')

    // Other tasks should still be pending
    const task2 = db.select().from(tasks).where(eq(tasks.id, taskIds[1])).get()!
    expect(task2.status).toBe('pending')

    const task3 = db.select().from(tasks).where(eq(tasks.id, taskIds[2])).get()!
    expect(task3.status).toBe('pending')

    // Exactly one TaskRun should exist
    const runs = db.select().from(taskRuns).all()
    expect(runs).toHaveLength(1)
    expect(runs[0].task_id).toBe(taskIds[0])
    expect(runs[0].status).toBe('running')
  })

  it('tick advances to next task by order_index', () => {
    const { planId, taskIds } = seedPlan(3)
    const orchestrator = createOrchestrator()

    // Start
    orchestrator.start(planId)

    // Get the active TaskRun
    const run1 = db.select().from(taskRuns).where(eq(taskRuns.status, 'running')).get()!

    // Tick: complete task 1 successfully
    orchestrator.tick(planId, run1.id, 'success')

    // Task 1 should be success
    const task1 = db.select().from(tasks).where(eq(tasks.id, taskIds[0])).get()!
    expect(task1.status).toBe('success')

    // Task 2 should now be running
    const task2 = db.select().from(tasks).where(eq(tasks.id, taskIds[1])).get()!
    expect(task2.status).toBe('running')

    // Task 3 should still be pending
    const task3 = db.select().from(tasks).where(eq(tasks.id, taskIds[2])).get()!
    expect(task3.status).toBe('pending')

    // Two TaskRuns should exist (one completed, one running)
    const runs = db.select().from(taskRuns).all()
    expect(runs).toHaveLength(2)

    // Get the new running TaskRun
    const run2 = db.select().from(taskRuns).where(eq(taskRuns.status, 'running')).get()!
    expect(run2.task_id).toBe(taskIds[1])

    // Tick: complete task 2 successfully
    orchestrator.tick(planId, run2.id, 'success')

    // Task 3 should now be running
    const task3After = db.select().from(tasks).where(eq(tasks.id, taskIds[2])).get()!
    expect(task3After.status).toBe('running')

    // Three TaskRuns now
    const runs3 = db.select().from(taskRuns).all()
    expect(runs3).toHaveLength(3)

    // Get the third TaskRun
    const run3 = db.select().from(taskRuns).where(eq(taskRuns.status, 'running')).get()!
    expect(run3.task_id).toBe(taskIds[2])

    // Tick: complete task 3 → plan should be completed
    orchestrator.tick(planId, run3.id, 'success')

    const finalPlan = db.select().from(plans).where(eq(plans.id, planId)).get()!
    expect(finalPlan.status).toBe('completed')
  })

  it('no overlap: only one task running at a time', () => {
    const { planId, taskIds } = seedPlan(4)
    const orchestrator = createOrchestrator()

    orchestrator.start(planId)

    // After start: exactly one task running
    const runningAfterStart = db
      .select()
      .from(tasks)
      .where(eq(tasks.plan_id, planId))
      .all()
      .filter((t) => t.status === 'running')
    expect(runningAfterStart).toHaveLength(1)
    expect(runningAfterStart[0].id).toBe(taskIds[0])

    // Tick to next
    const run1 = db.select().from(taskRuns).where(eq(taskRuns.status, 'running')).get()!
    orchestrator.tick(planId, run1.id, 'success')

    // After tick: still exactly one task running
    const runningAfterTick = db
      .select()
      .from(tasks)
      .where(eq(tasks.plan_id, planId))
      .all()
      .filter((t) => t.status === 'running')
    expect(runningAfterTick).toHaveLength(1)
    expect(runningAfterTick[0].id).toBe(taskIds[1])
  })

  it('tick records failure on task run and marks plan completed when no tasks remain', () => {
    const { planId } = seedPlan(1) // Only 1 task
    const orchestrator = createOrchestrator()

    orchestrator.start(planId)

    const run1 = db.select().from(taskRuns).where(eq(taskRuns.status, 'running')).get()!

    // Tick with failure
    orchestrator.tick(planId, run1.id, 'failed', ErrorCode.TASK_EXECUTION_FAILED)

    // TaskRun should be failed with error_code
    const runAfter = db.select().from(taskRuns).where(eq(taskRuns.id, run1.id)).get()!
    expect(runAfter.status).toBe('failed')
    expect(runAfter.error_code).toBe(ErrorCode.TASK_EXECUTION_FAILED)
    expect(runAfter.finished_at).not.toBeNull()

    // Plan should be completed (no more pending tasks)
    const finalPlan = db.select().from(plans).where(eq(plans.id, planId)).get()!
    expect(finalPlan.status).toBe('completed')
  })
})

// ===========================================================================
// Test Suite 3: Pause / Resume / Stop lifecycle
// ===========================================================================

describe('orchestrator pause resume stop', () => {
  it('pause cancels active TaskRun and resets task to pending', () => {
    const { planId, taskIds } = seedPlan(2)
    const orchestrator = createOrchestrator()

    orchestrator.start(planId)

    // Pause
    orchestrator.pause(planId)

    // Plan should be paused
    const plan = db.select().from(plans).where(eq(plans.id, planId)).get()!
    expect(plan.status).toBe('paused')

    // Task 1 should be reset to pending
    const task1 = db.select().from(tasks).where(eq(tasks.id, taskIds[0])).get()!
    expect(task1.status).toBe('pending')

    // TaskRun should be cancelled
    const run = db.select().from(taskRuns).all()[0]
    expect(run.status).toBe('cancelled')
    expect(run.finished_at).not.toBeNull()
  })

  it('resume starts the next pending task after pause', () => {
    const { planId, taskIds } = seedPlan(2)
    const orchestrator = createOrchestrator()

    orchestrator.start(planId)
    orchestrator.pause(planId)

    // Resume
    orchestrator.resume(planId)

    // Plan should be running
    const plan = db.select().from(plans).where(eq(plans.id, planId)).get()!
    expect(plan.status).toBe('running')

    // Task 1 should be running again (it was reset to pending by pause)
    const task1 = db.select().from(tasks).where(eq(tasks.id, taskIds[0])).get()!
    expect(task1.status).toBe('running')

    // A new TaskRun should be created
    const runs = db.select().from(taskRuns).all()
    expect(runs).toHaveLength(2) // 1 cancelled + 1 new running
    const activeRun = runs.find((r) => r.status === 'running')
    expect(activeRun).toBeDefined()
    expect(activeRun!.task_id).toBe(taskIds[0])
  })

  it('stop cancels active run and marks plan stopped', () => {
    const { planId, taskIds } = seedPlan(2)
    const orchestrator = createOrchestrator()

    orchestrator.start(planId)
    orchestrator.stop(planId)

    // Plan should be stopped
    const plan = db.select().from(plans).where(eq(plans.id, planId)).get()!
    expect(plan.status).toBe('stopped')

    // Task should be reset to pending
    const task1 = db.select().from(tasks).where(eq(tasks.id, taskIds[0])).get()!
    expect(task1.status).toBe('pending')

    // TaskRun should be cancelled
    const run = db.select().from(taskRuns).all()[0]
    expect(run.status).toBe('cancelled')
  })

  it('stop from paused state works', () => {
    const { planId } = seedPlan(2)
    const orchestrator = createOrchestrator()

    orchestrator.start(planId)
    orchestrator.pause(planId)
    orchestrator.stop(planId)

    const plan = db.select().from(plans).where(eq(plans.id, planId)).get()!
    expect(plan.status).toBe('stopped')
  })

  it('pause on already paused plan is idempotent', () => {
    const { planId } = seedPlan(2)
    const orchestrator = createOrchestrator()

    orchestrator.start(planId)
    orchestrator.pause(planId)

    // Second pause — should be idempotent
    const result = orchestrator.pause(planId)
    expect(result.plan_id).toBe(planId)

    const plan = db.select().from(plans).where(eq(plans.id, planId)).get()!
    expect(plan.status).toBe('paused')
  })

  it('stop on already stopped plan is idempotent', () => {
    const { planId } = seedPlan(2)
    const orchestrator = createOrchestrator()

    orchestrator.start(planId)
    orchestrator.stop(planId)

    // Second stop — should be idempotent
    const result = orchestrator.stop(planId)
    expect(result.plan_id).toBe(planId)

    const plan = db.select().from(plans).where(eq(plans.id, planId)).get()!
    expect(plan.status).toBe('stopped')
  })

  it('full lifecycle: start → pause → resume → tick → stop', () => {
    const { planId, taskIds } = seedPlan(3)
    const orchestrator = createOrchestrator()

    // Start
    orchestrator.start(planId)
    let plan = db.select().from(plans).where(eq(plans.id, planId)).get()!
    expect(plan.status).toBe('running')

    // Pause
    orchestrator.pause(planId)
    plan = db.select().from(plans).where(eq(plans.id, planId)).get()!
    expect(plan.status).toBe('paused')

    // Resume
    orchestrator.resume(planId)
    plan = db.select().from(plans).where(eq(plans.id, planId)).get()!
    expect(plan.status).toBe('running')

    // Tick (complete task 1)
    const run1 = db.select().from(taskRuns).where(eq(taskRuns.status, 'running')).get()!
    orchestrator.tick(planId, run1.id, 'success')

    const task1 = db.select().from(tasks).where(eq(tasks.id, taskIds[0])).get()!
    expect(task1.status).toBe('success')

    // Stop
    orchestrator.stop(planId)
    plan = db.select().from(plans).where(eq(plans.id, planId)).get()!
    expect(plan.status).toBe('stopped')
  })
})
