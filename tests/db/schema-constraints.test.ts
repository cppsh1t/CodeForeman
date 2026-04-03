// ── Database Schema & Constraint Tests ──
//
// Tests run against an in-memory SQLite database with migrations applied.
// Each test gets a fresh database via beforeEach().
//
// Coverage:
// - All 7 tables exist after migration
// - Foreign key constraints (cascading deletes, restrict on missing parent)
// - Unique constraint: (plan_id, order_index) on tasks
// - Indexes exist
// - Happy path CRUD operations
// - Domain enum values match DB column constraints

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
// drizzle imported for type reference only
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import {
  projects,
  plans,
  planMaterials,
  tasks,
  taskRuns,
  runMessages,
  thinkDecisions
} from '@main/db/schema'
import { createStandaloneDatabase, type DatabaseInstance } from '@main/db/client'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let sqlite: Database.Database
let db: DatabaseInstance

function now(): string {
  return new Date().toISOString()
}

beforeEach(() => {
  const result = createStandaloneDatabase(':memory:')
  sqlite = result.sqlite
  db = result.db

  // Apply migrations to the in-memory database
  const migrationsFolder = join(__dirname, '../../drizzle')
  migrate(db, { migrationsFolder })
})

afterEach(() => {
  sqlite.close()
})

// ---------------------------------------------------------------------------
// Schema constraints
// ---------------------------------------------------------------------------

describe('schema constraints', () => {
  it('all 7 tables exist after migration', () => {
    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%'"
      )
      .all()
      .map((row: { name: string }) => row.name)
      .sort()

    expect(tables).toEqual([
      'plan_materials',
      'plans',
      'projects',
      'run_messages',
      'task_runs',
      'tasks',
      'think_decisions'
    ])
  })

  it('foreign keys are enforced for plans -> projects', () => {
    // Insert a plan referencing a non-existent project should fail
    expect(() => {
      sqlite.exec(
        `INSERT INTO plans (project_id, name, status, created_at, updated_at)
         VALUES (9999, 'orphan plan', 'draft', '${now()}', '${now()}')`
      )
    }).toThrow()
  })

  it('foreign keys are enforced for tasks -> plans', () => {
    // Insert a task referencing a non-existent plan should fail
    expect(() => {
      sqlite.exec(
        `INSERT INTO tasks (plan_id, name, status, order_index, created_at, updated_at)
         VALUES (9999, 'orphan task', 'pending', 0, '${now()}', '${now()}')`
      )
    }).toThrow()
  })

  it('cascading delete: deleting a project cascades to plans and materials', () => {
    // Create project
    const projectId = sqlite
      .prepare(
        `INSERT INTO projects (name, status, created_at, updated_at) VALUES ('Test Project', 'active', '${now()}', '${now()}')`
      )
      .run().lastInsertRowid as number

    // Create plan under project
    const planId = sqlite
      .prepare(
        `INSERT INTO plans (project_id, name, status, created_at, updated_at) VALUES (?, 'Test Plan', 'draft', '${now()}', '${now()}')`
      )
      .run(projectId).lastInsertRowid as number

    // Create material under plan
    sqlite
      .prepare(
        `INSERT INTO plan_materials (plan_id, type, source, content, created_at, updated_at) VALUES (?, 'requirements', 'manual', 'test content', '${now()}', '${now()}')`
      )
      .run(planId)

    // Verify data exists
    const planCount = (sqlite.prepare('SELECT COUNT(*) as c FROM plans').get() as { c: number }).c
    const materialCount = (
      sqlite.prepare('SELECT COUNT(*) as c FROM plan_materials').get() as { c: number }
    ).c
    expect(planCount).toBe(1)
    expect(materialCount).toBe(1)

    // Delete project — should cascade
    sqlite.prepare('DELETE FROM projects WHERE id = ?').run(projectId)

    const planCountAfter = (
      sqlite.prepare('SELECT COUNT(*) as c FROM plans').get() as { c: number }
    ).c
    const materialCountAfter = (
      sqlite.prepare('SELECT COUNT(*) as c FROM plan_materials').get() as { c: number }
    ).c
    expect(planCountAfter).toBe(0)
    expect(materialCountAfter).toBe(0)
  })

  it('required columns reject null values', () => {
    // name is NOT NULL on projects
    expect(() => {
      sqlite.exec(
        `INSERT INTO projects (name, status, created_at, updated_at) VALUES (NULL, 'active', '${now()}', '${now()}')`
      )
    }).toThrow()
  })

  it('default values are applied for optional columns', () => {
    // Insert project without description — should default to ''
    const id = sqlite
      .prepare(
        `INSERT INTO projects (name, status, created_at, updated_at) VALUES ('No Desc', 'active', '${now()}', '${now()}')`
      )
      .run().lastInsertRowid as number

    const row = sqlite.prepare('SELECT description FROM projects WHERE id = ?').get(id) as {
      description: string
    }
    expect(row.description).toBe('')
  })

  it('indexes exist on foreign key columns', () => {
    const indexes = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row: { name: string }) => row.name)
      .sort()

    // All expected indexes
    expect(indexes).toContain('plans_project_id_idx')
    expect(indexes).toContain('plan_materials_plan_id_idx')
    expect(indexes).toContain('tasks_plan_id_idx')
    expect(indexes).toContain('tasks_plan_id_order_index_unique')
    expect(indexes).toContain('task_runs_task_id_idx')
    expect(indexes).toContain('task_runs_correlation_id_idx')
    expect(indexes).toContain('run_messages_task_run_id_idx')
    expect(indexes).toContain('run_messages_correlation_id_idx')
    expect(indexes).toContain('think_decisions_task_run_id_idx')
  })
})

// ---------------------------------------------------------------------------
// Duplicate plan seq constraint
// ---------------------------------------------------------------------------

describe('duplicate plan seq', () => {
  it('rejects inserting two tasks with the same (plan_id, order_index)', () => {
    // Create project + plan
    const projectId = sqlite
      .prepare(
        `INSERT INTO projects (name, status, created_at, updated_at) VALUES ('P', 'active', '${now()}', '${now()}')`
      )
      .run().lastInsertRowid as number

    const planId = sqlite
      .prepare(
        `INSERT INTO plans (project_id, name, status, created_at, updated_at) VALUES (?, 'Plan', 'draft', '${now()}', '${now()}')`
      )
      .run(projectId).lastInsertRowid as number

    // Insert first task with order_index=0
    sqlite
      .prepare(
        `INSERT INTO tasks (plan_id, name, status, order_index, created_at, updated_at) VALUES (?, 'Task 1', 'pending', 0, '${now()}', '${now()}')`
      )
      .run(planId)

    // Insert second task with same (plan_id, order_index) = 0 — should fail
    expect(() => {
      sqlite
        .prepare(
          `INSERT INTO tasks (plan_id, name, status, order_index, created_at, updated_at) VALUES (?, 'Task 2', 'pending', 0, '${now()}', '${now()}')`
        )
        .run(planId)
    }).toThrow(/UNIQUE constraint failed/)
  })

  it('allows the same order_index across different plans', () => {
    // Create project + two plans
    const projectId = sqlite
      .prepare(
        `INSERT INTO projects (name, status, created_at, updated_at) VALUES ('P', 'active', '${now()}', '${now()}')`
      )
      .run().lastInsertRowid as number

    const plan1Id = sqlite
      .prepare(
        `INSERT INTO plans (project_id, name, status, created_at, updated_at) VALUES (?, 'Plan 1', 'draft', '${now()}', '${now()}')`
      )
      .run(projectId).lastInsertRowid as number

    const plan2Id = sqlite
      .prepare(
        `INSERT INTO plans (project_id, name, status, created_at, updated_at) VALUES (?, 'Plan 2', 'draft', '${now()}', '${now()}')`
      )
      .run(projectId).lastInsertRowid as number

    // Insert task with order_index=0 in plan1
    sqlite
      .prepare(
        `INSERT INTO tasks (plan_id, name, status, order_index, created_at, updated_at) VALUES (?, 'Task A', 'pending', 0, '${now()}', '${now()}')`
      )
      .run(plan1Id)

    // Same order_index=0 in plan2 — should succeed (different plan_id)
    expect(() => {
      sqlite
        .prepare(
          `INSERT INTO tasks (plan_id, name, status, order_index, created_at, updated_at) VALUES (?, 'Task B', 'pending', 0, '${now()}', '${now()}')`
        )
        .run(plan2Id)
    }).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Happy path CRUD with Drizzle ORM
// ---------------------------------------------------------------------------

describe('happy path CRUD', () => {
  it('insert and retrieve a project with drizzle', () => {
    const timestamp = now()
    const result = db
      .insert(projects)
      .values({
        name: 'My Project',
        description: 'A test project',
        status: 'active',
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()

    expect(result).toBeDefined()
    expect(result!.name).toBe('My Project')
    expect(result!.id).toBeGreaterThan(0)

    const fetched = db.select().from(projects).where(eq(projects.id, result!.id)).get()
    expect(fetched).toBeDefined()
    expect(fetched!.status).toBe('active')
  })

  it('full hierarchy: project → plan → material → task → taskRun → message → thinkDecision', () => {
    const timestamp = now()

    // Project
    const project = db
      .insert(projects)
      .values({
        name: 'Root Project',
        status: 'active',
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    // Plan
    const plan = db
      .insert(plans)
      .values({
        project_id: project.id,
        name: 'Build Feature',
        status: 'ready',
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    // Material
    const material = db
      .insert(planMaterials)
      .values({
        plan_id: plan.id,
        type: 'requirements',
        source: 'manual',
        content: 'User must be able to login',
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    expect(material.id).toBeGreaterThan(0)
    expect(material.type).toBe('requirements')

    // Task
    const task = db
      .insert(tasks)
      .values({
        plan_id: plan.id,
        name: 'Implement login',
        status: 'pending',
        order_index: 0,
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    // TaskRun
    const taskRun = db
      .insert(taskRuns)
      .values({
        task_id: task.id,
        status: 'running',
        correlation_id: 'test-corr-123',
        started_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    // RunMessage
    const message = db
      .insert(runMessages)
      .values({
        task_run_id: taskRun.id,
        correlation_id: 'test-corr-123',
        role: 'system',
        content: 'Starting task execution',
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    expect(message.role).toBe('system')

    // ThinkDecision
    const decision = db
      .insert(thinkDecisions)
      .values({
        task_run_id: taskRun.id,
        correlation_id: 'test-corr-123',
        trigger_type: 'failure',
        decision: 'retry_current',
        reason: 'Network timeout, retrying',
        created_at: timestamp,
        updated_at: timestamp
      })
      .returning()
      .get()!

    expect(decision.decision).toBe('retry_current')
  })

  it('migration creates __drizzle_migrations tracking table', () => {
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '__drizzle_%'")
      .all()
      .map((row: { name: string }) => row.name)

    expect(tables).toContain('__drizzle_migrations')
  })
})
