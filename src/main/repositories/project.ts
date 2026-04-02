// ── Project Repository ──
//
// CRUD + pagination + filter for projects.

import { eq, type SQL } from 'drizzle-orm'
import { projects } from '@main/db/schema'
import { BaseRepository, type PaginatedResult } from './base'
import type { DatabaseInstance } from '@main/db/client'

export type ProjectRow = (typeof projects)['$inferSelect']

export class ProjectRepository extends BaseRepository {
  constructor(db: DatabaseInstance) {
    super(db, projects)
  }

  /** List projects with optional status filter. */
  listByStatus(
    params: { page: number; page_size: number },
    status?: string
  ): PaginatedResult<ProjectRow> {
    const filter: SQL | undefined = status ? eq(projects.status, status) : undefined
    const result = this.list(params, filter)
    return result as PaginatedResult<ProjectRow>
  }

  /** Update project by id (name, description, status, etc.). */
  updateProject(
    id: number,
    values: {
      name?: string
      description?: string
      status?: string
      updated_at: string
    }
  ): ProjectRow | undefined {
    return this.updateById(id, values) as ProjectRow | undefined
  }

  /** Archive a project by setting its status to 'archived'. */
  archive(id: number, updatedAt: string): ProjectRow | undefined {
    return this.updateById(id, { status: 'archived', updated_at: updatedAt }) as
      | ProjectRow
      | undefined
  }

  /** Check if a project exists by id. */
  existsById(id: number): boolean {
    return this.exists(eq(projects.id, id))
  }
}
