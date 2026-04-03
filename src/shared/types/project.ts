import type { BaseEntity, ProjectId } from './common'

// ── Project Status ──

export const ProjectStatus = {
  ACTIVE: 'active',
  ARCHIVED: 'archived'
} as const

export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus]

// ── Project Entity ──

export interface Project extends BaseEntity {
  id: ProjectId
  name: string
  description: string
  status: ProjectStatus
}
