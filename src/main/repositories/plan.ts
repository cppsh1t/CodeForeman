// ── Plan Repository ──
//
// CRUD + pagination + filter for plans.

import { eq } from 'drizzle-orm'
import { plans } from '@main/db/schema'
import { BaseRepository, type PaginatedResult } from './base'
import type { DatabaseInstance } from '@main/db/client'

export type PlanRow = (typeof plans)['$inferSelect']

export class PlanRepository extends BaseRepository {
  constructor(db: DatabaseInstance) {
    super(db, plans)
  }

  /** List plans for a given project with pagination. */
  listByProject(
    projectId: number,
    params: { page: number; page_size: number }
  ): PaginatedResult<PlanRow> {
    const filter = eq(plans.project_id, projectId)
    return this.list(params, filter) as PaginatedResult<PlanRow>
  }

  /** List all plans for a given project (no pagination). */
  findAllByProject(projectId: number): PlanRow[] {
    return this.findAll(eq(plans.project_id, projectId)) as PlanRow[]
  }

  /** Update plan by id. */
  updatePlan(
    id: number,
    values: {
      name?: string
      description?: string
      status?: string
      updated_at: string
    }
  ): PlanRow | undefined {
    return this.updateById(id, values) as PlanRow | undefined
  }

  /** Set plan status to 'ready'. */
  setReady(id: number, updatedAt: string): PlanRow | undefined {
    return this.updateById(id, { status: 'ready', updated_at: updatedAt }) as PlanRow | undefined
  }

  /** Check if a plan exists by id. */
  existsById(id: number): boolean {
    return this.exists(eq(plans.id, id))
  }
}
