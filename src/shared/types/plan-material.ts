import type { BaseEntity, MaterialId, PlanId } from './common'

// ── Material Type ──

export const MaterialType = {
  REQUIREMENTS: 'requirements',
  PROTOTYPE: 'prototype',
  API_SPEC: 'api_spec',
  NOTE: 'note'
} as const

export type MaterialType = (typeof MaterialType)[keyof typeof MaterialType]

// ── Material Source ──

export const MaterialSource = {
  MANUAL: 'manual',
  IMPORT: 'import'
} as const

export type MaterialSource = (typeof MaterialSource)[keyof typeof MaterialSource]

// ── PlanMaterial Entity ──

export interface PlanMaterial extends BaseEntity {
  id: MaterialId
  plan_id: PlanId
  type: MaterialType
  source: MaterialSource
  content: string
}
