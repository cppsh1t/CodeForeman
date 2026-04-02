// ── Common / base types shared across all domain entities ──

/** ISO 8601 datetime string */
export type Timestamp = string

/** Auto-increment integer primary keys (V1: SQLite INTEGER PK) */
export type ProjectId = number & { readonly __brand: unique symbol }
export type PlanId = number & { readonly __brand: unique symbol }
export type TaskId = number & { readonly __brand: unique symbol }
export type TaskRunId = number & { readonly __brand: unique symbol }
export type ThinkDecisionId = number & { readonly __brand: unique symbol }
export type MaterialId = number & { readonly __brand: unique symbol }
export type MessageId = number & { readonly __brand: unique symbol }

/** Base fields present on every persisted entity */
export interface BaseEntity {
  id: number
  created_at: Timestamp
  updated_at: Timestamp
}
