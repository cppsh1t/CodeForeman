// ── RunMessage Repository ──
//
// CRUD + pagination for run messages within a task run.

import { eq } from 'drizzle-orm'
import { runMessages } from '@main/db/schema'
import { BaseRepository, type PaginatedResult } from './base'
import type { DatabaseInstance } from '@main/db/client'

export type RunMessageRow = (typeof runMessages)['$inferSelect']

export class RunMessageRepository extends BaseRepository {
  constructor(db: DatabaseInstance) {
    super(db, runMessages)
  }

  /** List messages for a task run with pagination. */
  listByTaskRunId(
    taskRunId: number,
    params: { page: number; page_size: number }
  ): PaginatedResult<RunMessageRow> {
    return this.list(
      params,
      eq(runMessages.task_run_id, taskRunId)
    ) as PaginatedResult<RunMessageRow>
  }
}
