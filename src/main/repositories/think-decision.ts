// ── ThinkDecision Repository ──
//
// CRUD for think decisions within a task run.

import { eq } from 'drizzle-orm'
import { thinkDecisions } from '@main/db/schema'
import { BaseRepository } from './base'
import type { DatabaseInstance } from '@main/db/client'

export type ThinkDecisionRow = (typeof thinkDecisions)['$inferSelect']

export class ThinkDecisionRepository extends BaseRepository {
  constructor(db: DatabaseInstance) {
    super(db, thinkDecisions)
  }

  /** List all think decisions for a task run. */
  findByTaskRunId(taskRunId: number): ThinkDecisionRow[] {
    return this.findAll(eq(thinkDecisions.task_run_id, taskRunId)) as ThinkDecisionRow[]
  }
}
