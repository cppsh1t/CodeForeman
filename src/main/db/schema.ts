// ── Drizzle ORM Schema — V1 Entities ──
//
// SQLite schema for CodeForeman V1 domain: Project, Plan, PlanMaterial,
// Task, TaskRun, RunMessage, ThinkDecision.
//
// Conventions:
// - All PKs: INTEGER PRIMARY KEY AUTOINCREMENT
// - Timestamps: TEXT (ISO 8601), set by application layer
// - Foreign keys: ON DELETE CASCADE for owned entities
// - Unique constraint: (plan_id, order_index) on tasks

import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('active'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
})

// ---------------------------------------------------------------------------
// Plans — belongs to a project
// ---------------------------------------------------------------------------

export const plans = sqliteTable(
  'plans',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    project_id: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').notNull().default('draft'),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull()
  },
  (table) => [index('plans_project_id_idx').on(table.project_id)]
)

// ---------------------------------------------------------------------------
// PlanMaterials — belongs to a plan
// ---------------------------------------------------------------------------

export const planMaterials = sqliteTable(
  'plan_materials',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    plan_id: integer('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    source: text('source').notNull().default('manual'),
    content: text('content').notNull().default(''),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull()
  },
  (table) => [index('plan_materials_plan_id_idx').on(table.plan_id)]
)

// ---------------------------------------------------------------------------
// Tasks — belongs to a plan, unique (plan_id, order_index)
// ---------------------------------------------------------------------------

export const tasks = sqliteTable(
  'tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    plan_id: integer('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').notNull().default('pending'),
    order_index: integer('order_index').notNull(),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull()
  },
  (table) => [
    // UNIQUE constraint: no two tasks in the same plan can have the same order_index
    uniqueIndex('tasks_plan_id_order_index_unique').on(table.plan_id, table.order_index),
    index('tasks_plan_id_idx').on(table.plan_id)
  ]
)

// ---------------------------------------------------------------------------
// TaskRuns — belongs to a task
// ---------------------------------------------------------------------------

export const taskRuns = sqliteTable(
  'task_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    task_id: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('running'),
    correlation_id: text('correlation_id').notNull().default(''),
    error_code: text('error_code'),
    started_at: text('started_at'),
    finished_at: text('finished_at'),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull()
  },
  (table) => [
    index('task_runs_task_id_idx').on(table.task_id),
    index('task_runs_correlation_id_idx').on(table.correlation_id)
  ]
)

// ---------------------------------------------------------------------------
// RunMessages — belongs to a task_run
// ---------------------------------------------------------------------------

export const runMessages = sqliteTable(
  'run_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    task_run_id: integer('task_run_id')
      .notNull()
      .references(() => taskRuns.id, { onDelete: 'cascade' }),
    correlation_id: text('correlation_id').notNull().default(''),
    role: text('role').notNull(),
    content: text('content').notNull().default(''),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull()
  },
  (table) => [
    index('run_messages_task_run_id_idx').on(table.task_run_id),
    index('run_messages_correlation_id_idx').on(table.correlation_id)
  ]
)

// ---------------------------------------------------------------------------
// ThinkDecisions — belongs to a task_run
// ---------------------------------------------------------------------------

export const thinkDecisions = sqliteTable(
  'think_decisions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    task_run_id: integer('task_run_id')
      .notNull()
      .references(() => taskRuns.id, { onDelete: 'cascade' }),
    correlation_id: text('correlation_id').notNull().default(''),
    trigger_type: text('trigger_type').notNull(),
    decision: text('decision').notNull(),
    reason: text('reason').notNull().default(''),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull()
  },
  (table) => [index('think_decisions_task_run_id_idx').on(table.task_run_id)]
)
