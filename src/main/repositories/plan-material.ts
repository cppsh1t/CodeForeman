// ── PlanMaterial Repository ──
//
// CRUD for plan materials. No pagination needed — materials are small sets per plan.

import { eq } from 'drizzle-orm'
import { planMaterials } from '@main/db/schema'
import { BaseRepository } from './base'
import type { DatabaseInstance } from '@main/db/client'

export type PlanMaterialRow = (typeof planMaterials)['$inferSelect']

export class PlanMaterialRepository extends BaseRepository {
  constructor(db: DatabaseInstance) {
    super(db, planMaterials)
  }

  /** List all materials for a given plan. */
  findByPlanId(planId: number): PlanMaterialRow[] {
    return this.findAll(eq(planMaterials.plan_id, planId)) as PlanMaterialRow[]
  }

  /** Delete a material by id. */
  deleteMaterial(id: number): PlanMaterialRow | undefined {
    return this.deleteById(id) as PlanMaterialRow | undefined
  }
}
