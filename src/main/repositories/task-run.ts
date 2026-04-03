// ── TaskRun Repository ──
//
// CRUD for task runs. Task runs track individual execution attempts of a task.

import { eq } from 'drizzle-orm'
import { taskRuns, tasks } from '@main/db/schema'
import { BaseRepository } from './base'
import type { DatabaseInstance } from '@main/db/client'

export type TaskRunRow = (typeof taskRuns)['$inferSelect']

export class TaskRunRepository extends BaseRepository {
  constructor(db: DatabaseInstance) {
    super(db, taskRuns)
  }

  /** List all task runs for a given plan (via task.plan_id). */
  listByPlanId(planId: number): TaskRunRow[] {
    return this.db
      .select()
      .from(taskRuns)
      .innerJoin(tasks, eq(taskRuns.task_id, tasks.id))
      .where(eq(tasks.plan_id, planId))
      .all() as unknown as TaskRunRow[]
  }

  /** List all task runs for a given task. */
  findByTaskId(taskId: number): TaskRunRow[] {
    return this.findAll(eq(taskRuns.task_id, taskId)) as TaskRunRow[]
  }

  /** Update a task run by id. */
  updateTaskRun(
    id: number,
    values: {
      status?: string
      error_code?: string | null
      finished_at?: string | null
      updated_at: string
    }
  ): TaskRunRow | undefined {
    return this.updateById(id, values) as TaskRunRow | undefined
  }
}
