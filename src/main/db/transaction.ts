// ── Transaction Facade ──
//
// Provides explicit transaction boundaries for cross-table atomic operations.
// Wraps Drizzle's db.transaction() with typed callbacks and proper error handling.
//
// Key use cases:
// - Plan status change + task state transitions
// - TaskRun creation + task status update
// - ThinkDecision submit + task run state update
// - Any multi-entity state transition that must be atomic
//
// Design decisions:
// - Synchronous API (better-sqlite3 transactions are synchronous).
// - Callbacks receive a transaction-scoped database instance.
// - Errors inside the callback trigger automatic rollback.
// - The transaction-scoped db shares the same schema/types as the regular db.

import type { DatabaseInstance } from '@main/db/client'

// ── Transaction API ──

/**
 * Execute a callback within a database transaction.
 * If the callback throws, all changes are rolled back automatically.
 *
 * The callback receives a transaction-scoped database instance that should
 * be used for ALL queries within the transaction. Using the regular db
 * instance inside the callback would bypass the transaction boundary.
 *
 * @param db - The regular database instance to create a transaction from
 * @param fn - Callback that receives the transaction-scoped db
 * @returns The return value of the callback
 */
export function withTransaction<T>(db: DatabaseInstance, fn: (txDb: DatabaseInstance) => T): T {
  return db.transaction((tx) => {
    return fn(tx as DatabaseInstance)
  })
}

/**
 * Execute a callback within a database transaction with explicit error handling.
 *
 * Unlike `withTransaction`, this catches errors and returns a result object
 * indicating success or failure, rather than propagating the exception.
 *
 * @param db - The regular database instance
 * @param fn - Callback that receives the transaction-scoped db
 * @returns Result object with ok/data or ok/false/error
 */
export function tryTransaction<T>(
  db: DatabaseInstance,
  fn: (txDb: DatabaseInstance) => T
): { ok: true; data: T } | { ok: false; error: string } {
  try {
    const data = withTransaction(db, fn)
    return { ok: true, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}
