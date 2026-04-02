// ── Task Repository ──
//
// CRUD for tasks. Tasks are ordered by order_index within a plan.

import { eq, asc } from 'drizzle-orm'
import { tasks } from '@main/db/schema'
import { BaseRepository } from './base'
import type { DatabaseInstance } from '@main/db/client'

export type TaskRow = (typeof tasks)['$inferSelect']

export class TaskRepository extends BaseRepository {
  constructor(db: DatabaseInstance) {
    super(db, tasks)
  }

  /** List all tasks for a given plan, ordered by order_index. */
  findByPlanId(planId: number): TaskRow[] {
    // Use findAll with filter, then manually sort by order_index
    // (base sorts by id asc; we need order_index asc)
    return this.db
      .select()
      .from(tasks)
      .where(eq(tasks.plan_id, planId))
      .orderBy(asc(tasks.order_index))
      .all() as TaskRow[]
  }

  /** Update a single task by id. */
  updateTask(
    id: number,
    values: {
      name?: string
      description?: string
      status?: string
      order_index?: number
      updated_at: string
    }
  ): TaskRow | undefined {
    return this.updateById(id, values) as TaskRow | undefined
  }

  /** Check if a task exists by id. */
  existsById(id: number): boolean {
    return this.exists(eq(tasks.id, id))
  }
}
