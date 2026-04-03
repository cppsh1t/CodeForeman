// ── Repository Transaction Integration Tests ──
//
// Tests the TransactionFacade for atomic cross-table writes.
// Covers:
// - Transaction commit: multi-table writes succeed atomically
// - Transaction rollback: injected error mid-transaction, no partial writes remain
// - Repository CRUD + pagination + filter via the facade and direct repos
//
// Runs against an in-memory SQLite database with migrations applied.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import { createStandaloneDatabase, type DatabaseInstance } from '@main/db/client'
import { withTransaction, tryTransaction } from '@main/db'
import { projects, plans, tasks, taskRuns, runMessages, thinkDecisions } from '@main/db/schema'
import {
  ProjectRepository,
  PlanRepository,
  TaskRepository,
  TaskRunRepository,
  RunMessageRepository,
  ThinkDecisionRepository,
  TransactionFacade
} from '@main/repositories'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let sqlite: Database.Database
let db: DatabaseInstance

function now(): string {
  return new Date().toISOString()
}

function seedPlan(): { projectId: number; planId: number; taskIds: number[] } {
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

  const taskRows = [
    { plan_id: plan.id, name: 'Task 1', status: 'pending', order_index: 0 },
    { plan_id: plan.id, name: 'Task 2', status: 'pending', order_index: 1 },
    { plan_id: plan.id, name: 'Task 3', status: 'pending', order_index: 2 }
  ].map((t) => ({
    ...t,
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

// ---------------------------------------------------------------------------
// Repository CRUD + Pagination + Filter
// ---------------------------------------------------------------------------

describe('repository CRUD and pagination', () => {
  it('ProjectRepository: insert, findById, list, update, archive', () => {
    const repo = new ProjectRepository(db)
    const timestamp = now()

    // Create
    const project = repo.insert({
      name: 'My Project',
      description: 'A description',
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp
    })
    expect(project.id).toBeGreaterThan(0)
    expect(project.name).toBe('My Project')

    // FindById
    const found = repo.findById(project.id)
    expect(found).toBeDefined()
    expect((found as { name: string }).name).toBe('My Project')

    // List with pagination
    const result = repo.list({ page: 1, page_size: 10 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)

    // List by status filter
    const activeResult = repo.listByStatus({ page: 1, page_size: 10 }, 'active')
    expect(activeResult.items).toHaveLength(1)

    // Update
    const updated = repo.updateProject(project.id, {
      name: 'Updated Project',
      updated_at: timestamp
    })
    expect(updated?.name).toBe('Updated Project')

    // Archive
    const archived = repo.archive(project.id, timestamp)
    expect(archived?.status).toBe('archived')

    // Exists
    expect(repo.existsById(project.id)).toBe(true)
    expect(repo.existsById(9999)).toBe(false)
  })

  it('PlanRepository: insert, findByProject, list with pagination, setReady', () => {
    const repo = new PlanRepository(db)
    const timestamp = now()

    const project = db
      .insert(projects)
      .values({ name: 'P', status: 'active', created_at: timestamp, updated_at: timestamp })
      .returning()
      .get()!

    const plan = repo.insert({
      project_id: project.id,
      name: 'Plan A',
      status: 'draft',
      created_at: timestamp,
      updated_at: timestamp
    })
    expect(plan.status).toBe('draft')

    // findByProject
    const byProject = repo.findAllByProject(project.id)
    expect(byProject).toHaveLength(1)

    // listByProject with pagination
    const paginated = repo.listByProject(project.id, { page: 1, page_size: 10 })
    expect(paginated.items).toHaveLength(1)
    expect(paginated.total).toBe(1)

    // setReady
    const ready = repo.setReady(plan.id, timestamp)
    expect(ready?.status).toBe('ready')

    // existsById
    expect(repo.existsById(plan.id)).toBe(true)
  })

  it('TaskRepository: insert, findByPlanId (ordered), update', () => {
    const repo = new TaskRepository(db)
    const timestamp = now()

    const project = db
      .insert(projects)
      .values({ name: 'P', status: 'active', created_at: timestamp, updated_at: timestamp })
      .returning()
      .get()!
    const plan = db
      .insert(plans)
      .values({
        project_id: project.id,
        name: 'Plan',
        status: 'draft',
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    const t3 = repo.insert({
      plan_id: plan.id,
      name: 'Third',
      status: 'pending',
      order_index: 2,
      created_at: timestamp,
      updated_at: timestamp
    })
    const t1 = repo.insert({
      plan_id: plan.id,
      name: 'First',
      status: 'pending',
      order_index: 0,
      created_at: timestamp,
      updated_at: timestamp
    })
    const t2 = repo.insert({
      plan_id: plan.id,
      name: 'Second',
      status: 'pending',
      order_index: 1,
      created_at: timestamp,
      updated_at: timestamp
    })

    // findByPlanId returns ordered by order_index
    const planTasks = repo.findByPlanId(plan.id)
    expect(planTasks).toHaveLength(3)
    expect(planTasks[0].id).toBe(t1.id)
    expect(planTasks[1].id).toBe(t2.id)
    expect(planTasks[2].id).toBe(t3.id)

    // update
    const updated = repo.updateTask(t1.id, { status: 'running', updated_at: timestamp })
    expect(updated?.status).toBe('running')
  })

  it('TaskRunRepository: insert, update, listByPlanId', () => {
    const repo = new TaskRunRepository(db)
    const timestamp = now()

    const project = db
      .insert(projects)
      .values({ name: 'P', status: 'active', created_at: timestamp, updated_at: timestamp })
      .returning()
      .get()!
    const plan = db
      .insert(plans)
      .values({
        project_id: project.id,
        name: 'Plan',
        status: 'ready',
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!
    const task = db
      .insert(tasks)
      .values({
        plan_id: plan.id,
        name: 'Task',
        status: 'running',
        order_index: 0,
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    const run = repo.insert({
      task_id: task.id,
      status: 'running',
      correlation_id: 'corr-123',
      started_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp
    })
    expect(run.id).toBeGreaterThan(0)

    // update
    const updated = repo.updateTaskRun(run.id, {
      status: 'success',
      finished_at: timestamp,
      updated_at: timestamp
    })
    expect(updated?.status).toBe('success')

    // listByPlanId
    const planRuns = repo.listByPlanId(plan.id)
    expect(planRuns).toHaveLength(1)
  })

  it('RunMessageRepository: insert, listByTaskRunId with pagination', () => {
    const repo = new RunMessageRepository(db)
    const timestamp = now()

    const project = db
      .insert(projects)
      .values({ name: 'P', status: 'active', created_at: timestamp, updated_at: timestamp })
      .returning()
      .get()!
    const plan = db
      .insert(plans)
      .values({
        project_id: project.id,
        name: 'Plan',
        status: 'ready',
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!
    const task = db
      .insert(tasks)
      .values({
        plan_id: plan.id,
        name: 'Task',
        status: 'running',
        order_index: 0,
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!
    const run = db
      .insert(taskRuns)
      .values({
        task_id: task.id,
        status: 'running',
        correlation_id: 'corr-123',
        started_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    const msg = repo.insert({
      task_run_id: run.id,
      correlation_id: 'corr-123',
      role: 'system',
      content: 'Hello',
      created_at: timestamp,
      updated_at: timestamp
    })
    expect(msg.role).toBe('system')

    // listByTaskRunId with pagination
    const result = repo.listByTaskRunId(run.id, { page: 1, page_size: 10 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('ThinkDecisionRepository: insert, findByTaskRunId', () => {
    const repo = new ThinkDecisionRepository(db)
    const timestamp = now()

    const project = db
      .insert(projects)
      .values({ name: 'P', status: 'active', created_at: timestamp, updated_at: timestamp })
      .returning()
      .get()!
    const plan = db
      .insert(plans)
      .values({
        project_id: project.id,
        name: 'Plan',
        status: 'ready',
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!
    const task = db
      .insert(tasks)
      .values({
        plan_id: plan.id,
        name: 'Task',
        status: 'running',
        order_index: 0,
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!
    const run = db
      .insert(taskRuns)
      .values({
        task_id: task.id,
        status: 'running',
        correlation_id: 'corr-123',
        started_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    const decision = repo.insert({
      task_run_id: run.id,
      correlation_id: 'corr-123',
      trigger_type: 'failure',
      decision: 'retry_current',
      reason: 'Network error',
      created_at: timestamp,
      updated_at: timestamp
    })
    expect(decision.decision).toBe('retry_current')

    // findByTaskRunId
    const decisions = repo.findByTaskRunId(run.id)
    expect(decisions).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Transaction Facade: Commit
// ---------------------------------------------------------------------------

describe('repository transaction', () => {
  it('startPlanExecution commits plan status, task status, and taskRun atomically', () => {
    const facade = new TransactionFacade(db)
    const { planId, taskIds } = seedPlan()

    const result = facade.startPlanExecution(planId, 'corr-start-001')

    // All three entities returned
    expect(result.plan.status).toBe('running')
    expect(result.task.status).toBe('running')
    expect(result.taskRun.status).toBe('running')
    expect(result.taskRun.correlation_id).toBe('corr-start-001')
    expect(result.task.id).toBe(taskIds[0])

    // Verify persistence via direct queries
    const planCheck = db.select().from(plans).where(eq(plans.id, planId)).get()
    expect(planCheck!.status).toBe('running')

    const taskCheck = db.select().from(tasks).where(eq(tasks.id, taskIds[0])).get()
    expect(taskCheck!.status).toBe('running')

    // Other tasks should still be pending
    const task2Check = db.select().from(tasks).where(eq(tasks.id, taskIds[1])).get()
    expect(task2Check!.status).toBe('pending')

    // TaskRun should exist
    const runs = db.select().from(taskRuns).all()
    expect(runs).toHaveLength(1)
    expect(runs[0].task_id).toBe(taskIds[0])
  })

  it('completeTaskRun updates taskRun and task status atomically', () => {
    const facade = new TransactionFacade(db)
    const { planId, taskIds } = seedPlan()

    // Start execution first
    const started = facade.startPlanExecution(planId, 'corr-complete-001')

    // Complete successfully
    const result = facade.completeTaskRun(started.taskRun.id, 'success')

    expect(result.taskRun.status).toBe('success')
    expect(result.taskRun.finished_at).not.toBeNull()
    expect(result.task.status).toBe('success')

    // Verify via direct query
    const taskCheck = db.select().from(tasks).where(eq(tasks.id, taskIds[0])).get()
    expect(taskCheck!.status).toBe('success')

    const runCheck = db.select().from(taskRuns).where(eq(taskRuns.id, started.taskRun.id)).get()
    expect(runCheck!.status).toBe('success')
    expect(runCheck!.error_code).toBeNull()
  })

  it('completeTaskRun with failed status records error_code', () => {
    const facade = new TransactionFacade(db)
    const { planId } = seedPlan()

    const started = facade.startPlanExecution(planId, 'corr-fail-001')
    const result = facade.completeTaskRun(started.taskRun.id, 'failed', 'TASK_EXECUTION_FAILED')

    expect(result.taskRun.status).toBe('failed')
    expect(result.taskRun.error_code).toBe('TASK_EXECUTION_FAILED')
    expect(result.task.status).toBe('failed')
  })

  it('persistRunMessages inserts all messages atomically', () => {
    const facade = new TransactionFacade(db)
    const { planId } = seedPlan()

    const started = facade.startPlanExecution(planId, 'corr-msg-001')

    const messages = [
      { correlation_id: 'corr-msg-001', role: 'system', content: 'You are a helpful assistant.' },
      { correlation_id: 'corr-msg-001', role: 'user', content: 'Please implement the feature.' },
      { correlation_id: 'corr-msg-001', role: 'assistant', content: 'I will implement it now.' }
    ]

    const inserted = facade.persistRunMessages(started.taskRun.id, messages)
    expect(inserted).toHaveLength(3)
    expect(inserted[0].role).toBe('system')
    expect(inserted[1].role).toBe('user')
    expect(inserted[2].role).toBe('assistant')

    // Verify via direct query
    const allMsgs = db.select().from(runMessages).all()
    expect(allMsgs).toHaveLength(3)
  })

  it('persistRunMessages with empty array returns empty', () => {
    const facade = new TransactionFacade(db)
    const result = facade.persistRunMessages(999, [])
    expect(result).toHaveLength(0)
  })

  it('submitThinkDecision records decision atomically', () => {
    const facade = new TransactionFacade(db)
    const { planId } = seedPlan()

    const started = facade.startPlanExecution(planId, 'corr-think-001')

    const decision = facade.submitThinkDecision(started.taskRun.id, {
      correlation_id: 'corr-think-001',
      trigger_type: 'failure',
      decision: 'retry_current',
      reason: 'Flaky test, retrying.'
    })

    expect(decision.decision).toBe('retry_current')
    expect(decision.trigger_type).toBe('failure')

    // Verify via direct query
    const allDecisions = db.select().from(thinkDecisions).all()
    expect(allDecisions).toHaveLength(1)
    expect(allDecisions[0].task_run_id).toBe(started.taskRun.id)
  })

  it('chained operations: start -> persist messages -> complete', () => {
    const facade = new TransactionFacade(db)
    const { planId } = seedPlan()

    // 1. Start
    const started = facade.startPlanExecution(planId, 'corr-chain-001')

    // 2. Persist messages
    facade.persistRunMessages(started.taskRun.id, [
      { correlation_id: 'corr-chain-001', role: 'system', content: 'Start' }
    ])

    // 3. Complete
    facade.completeTaskRun(started.taskRun.id, 'success')

    // Verify final state
    const taskCheck = db.select().from(tasks).where(eq(tasks.id, started.task.id)).get()
    expect(taskCheck!.status).toBe('success')

    const msgCount = db.select().from(runMessages).all()
    expect(msgCount).toHaveLength(1)

    const runCheck = db.select().from(taskRuns).where(eq(taskRuns.id, started.taskRun.id)).get()
    expect(runCheck!.status).toBe('success')
  })
})

// ---------------------------------------------------------------------------
// Transaction Facade: Rollback
// ---------------------------------------------------------------------------

describe('repository rollback', () => {
  it('startPlanExecution rolls back all changes when plan is missing', () => {
    const facade = new TransactionFacade(db)
    const timestamp = now()

    // Seed a project (no plan) to verify no side effects
    db.insert(projects)
      .values({
        name: 'Standalone Project',
        status: 'active',
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()

    // Try to start execution for non-existent plan
    expect(() => facade.startPlanExecution(99999, 'corr-rollback-001')).toThrow(/Plan not found/)

    // Verify nothing was created in any table
    const planCount = db.select().from(plans).all()
    expect(planCount).toHaveLength(0)

    const taskCount = db.select().from(tasks).all()
    expect(taskCount).toHaveLength(0)

    const runCount = db.select().from(taskRuns).all()
    expect(runCount).toHaveLength(0)
  })

  it('startPlanExecution rolls back when no pending tasks exist', () => {
    const facade = new TransactionFacade(db)
    const { planId } = seedPlan()

    // Manually set all tasks to 'success' so no pending tasks remain
    const timestamp = now()
    db.update(tasks)
      .set({ status: 'success', updated_at: timestamp })
      .where(eq(tasks.plan_id, planId))
      .run()

    // Also set plan back to 'ready'
    db.update(plans)
      .set({ status: 'ready', updated_at: timestamp })
      .where(eq(plans.id, planId))
      .run()

    // Try to start - should fail because no pending tasks
    expect(() => facade.startPlanExecution(planId, 'corr-rollback-002')).toThrow(/No pending tasks/)

    // Plan status should NOT have been changed to 'running'
    const planCheck = db.select().from(plans).where(eq(plans.id, planId)).get()
    expect(planCheck!.status).toBe('ready')

    // No taskRun should have been created
    const runCount = db.select().from(taskRuns).all()
    expect(runCount).toHaveLength(0)
  })

  it('completeTaskRun rolls back when taskRun is missing', () => {
    const facade = new TransactionFacade(db)
    const { planId, taskIds } = seedPlan()

    // Start execution normally
    facade.startPlanExecution(planId, 'corr-rollback-003')

    // Try to complete non-existent taskRun
    expect(() => facade.completeTaskRun(99999, 'success')).toThrow(/TaskRun not found/)

    // Original task should still be 'running' (not updated to 'success')
    const taskCheck = db.select().from(tasks).where(eq(tasks.id, taskIds[0])).get()
    expect(taskCheck!.status).toBe('running')
  })

  it('persistRunMessages rolls back all inserts on failure', () => {
    const facade = new TransactionFacade(db)
    const { planId } = seedPlan()
    const started = facade.startPlanExecution(planId, 'corr-rollback-004')

    // Insert one message normally first
    facade.persistRunMessages(started.taskRun.id, [
      { correlation_id: 'corr-rollback-004', role: 'system', content: 'First message' }
    ])

    // Try to persist to a non-existent taskRun - should throw and not create partial writes
    // We use withTransaction directly to simulate a mid-transaction failure
    expect(() => {
      withTransaction(db, (txDb) => {
        const msgRepo = new RunMessageRepository(txDb)
        const timestamp = new Date().toISOString()

        // Insert first message
        msgRepo.insert({
          task_run_id: started.taskRun.id,
          correlation_id: 'corr-rollback-004',
          role: 'user',
          content: 'This should be rolled back',
          created_at: timestamp,
          updated_at: timestamp
        })

        // Simulate failure mid-transaction
        throw new Error('Simulated mid-transaction failure')
      })
    }).toThrow(/Simulated mid-transaction failure/)

    // Only the first message (from the successful call) should exist
    const allMsgs = db.select().from(runMessages).all()
    expect(allMsgs).toHaveLength(1)
    expect(allMsgs[0].content).toBe('First message')
  })

  it('withTransaction rolls back partial plan + task writes on error', () => {
    const { planId, taskIds } = seedPlan()
    const timestamp = now()

    // Simulate a multi-step transaction that fails mid-way
    expect(() => {
      withTransaction(db, (txDb) => {
        // Step 1: Update plan status
        new PlanRepository(txDb).updatePlan(planId, { status: 'running', updated_at: timestamp })

        // Step 2: Update task status
        new TaskRepository(txDb).updateTask(taskIds[0], {
          status: 'running',
          updated_at: timestamp
        })

        // Step 3: Simulate failure - this should rollback steps 1 and 2
        throw new Error('Atomic boundary test failure')
      })
    }).toThrow(/Atomic boundary test failure/)

    // Plan status should remain 'ready'
    const planCheck = db.select().from(plans).where(eq(plans.id, planId)).get()
    expect(planCheck!.status).toBe('ready')

    // Task status should remain 'pending'
    const taskCheck = db.select().from(tasks).where(eq(tasks.id, taskIds[0])).get()
    expect(taskCheck!.status).toBe('pending')

    // No TaskRun should exist
    const runCount = db.select().from(taskRuns).all()
    expect(runCount).toHaveLength(0)
  })

  it('tryTransaction returns ok:false on error without throwing', () => {
    const { planId } = seedPlan()

    const result = tryTransaction(db, (txDb) => {
      const timestamp = new Date().toISOString()
      new PlanRepository(txDb).updatePlan(planId, { status: 'running', updated_at: timestamp })
      throw new Error('Expected failure for tryTransaction test')
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Expected failure for tryTransaction test')
    }

    // Plan status unchanged
    const planCheck = db.select().from(plans).where(eq(plans.id, planId)).get()
    expect(planCheck!.status).toBe('ready')
  })

  it('tryTransaction returns ok:true with data on success', () => {
    const { planId } = seedPlan()

    const result = tryTransaction(db, (txDb) => {
      const timestamp = new Date().toISOString()
      return new PlanRepository(txDb).updatePlan(planId, {
        status: 'running',
        updated_at: timestamp
      })
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data?.status).toBe('running')
    }
  })
})
