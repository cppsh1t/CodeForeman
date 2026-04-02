// ── IPC Result Types ──
//
// All IPC responses use a discriminated union: { ok: true, data } | { ok: false, error }.
// This ensures the renderer can never accidentally access error fields on success
// or data fields on failure.

import type { ErrorCode } from '../types'

/** Standardized error returned on validation or handler failure. */
export interface IpcError {
  error_code: ErrorCode
  message: string
  /** Structured validation details (zod issues) when applicable. */
  details?: Array<{ path: string; message: string }>
}

/** Successful IPC response carrying typed data. */
export interface IpcSuccess<T = unknown> {
  ok: true
  data: T
}

/** Failed IPC response with standardized error. */
export interface IpcFailure {
  ok: false
  error: IpcError
}

/** Discriminated union for all IPC responses. */
export type IpcResult<T = unknown> = IpcSuccess<T> | IpcFailure

// ── Pagination ──

export interface PaginationParams {
  page: number
  page_size: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

// ── Validation Constants ──

/** Maximum length for string fields (name, description, etc.). */
export const MAX_STRING_LENGTH = 10_000

/** Maximum length for content-heavy fields (material content, message content). */
export const MAX_CONTENT_LENGTH = 100_000

/** Maximum page size for paginated queries. */
export const MAX_PAGE_SIZE = 100
