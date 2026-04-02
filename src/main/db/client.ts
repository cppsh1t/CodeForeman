// ── Database Client ──
//
// Initializes a better-sqlite3 database at Electron's userData path.
// Enables WAL mode and foreign keys. Provides the drizzle instance.
//
// This module is the ONLY place that creates the Database connection.
// All consumers must import `getDatabase()` — never `new Database()` directly.

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export type DatabaseInstance = ReturnType<typeof drizzle<typeof schema>>

let _db: DatabaseInstance | null = null
let _sqlite: Database.Database | null = null

/**
 * Create and return the drizzle database instance.
 * Safe to call multiple times — returns the same singleton.
 *
 * @param dbPath - Absolute path to the SQLite database file (e.g. userData/codeforeman.db)
 */
export function initDatabase(dbPath: string): DatabaseInstance {
  if (_db) {
    throw new Error('Database already initialized. Call initDatabase() only once.')
  }

  const sqlite = new Database(dbPath)

  // Performance: WAL mode allows concurrent reads during writes
  sqlite.pragma('journal_mode = WAL')

  // Safety: enforce foreign key constraints at the SQLite level
  sqlite.pragma('foreign_keys = ON')

  _sqlite = sqlite
  _db = drizzle(sqlite, { schema })

  return _db
}

/**
 * Get the initialized drizzle database instance.
 * Throws if initDatabase() has not been called.
 */
export function getDatabase(): DatabaseInstance {
  if (!_db) {
    throw new Error('Database not initialized. Call initDatabase(dbPath) before getDatabase().')
  }
  return _db
}

/**
 * Close the underlying SQLite connection.
 * Call during app shutdown to release file handles.
 */
export function closeDatabase(): void {
  if (_sqlite) {
    _sqlite.close()
    _sqlite = null
    _db = null
  }
}

/**
 * Get the underlying better-sqlite3 Database instance.
 * Useful for raw SQL operations or pragma access.
 * Throws if initDatabase() has not been called.
 */
export function getRawDatabase(): Database.Database {
  if (!_sqlite) {
    throw new Error('Database not initialized. Call initDatabase(dbPath) before getRawDatabase().')
  }
  return _sqlite
}

/**
 * Create a standalone database connection at the given path.
 * Used by tests and migration scripts that need their own connection.
 * Does NOT affect the singleton — call close() on the returned Database when done.
 */
export function createStandaloneDatabase(dbPath: string): {
  sqlite: Database.Database
  db: DatabaseInstance
} {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  return { sqlite, db }
}
