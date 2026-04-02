// ── Migration Runner ──
//
// Applies drizzle-kit generated SQL migrations to a database.
// Tracks applied migrations in the __drizzle_migrations table.
//
// Usage:
//   // At app startup (main process):
//   import { migrateDatabase } from './db/migrate'
//   migrateDatabase(dbPath)
//
//   // In tests:
//   import { createStandaloneDatabase, migrateDatabase } from './db'
//   const { sqlite, db } = createStandaloneDatabase(':memory:')
//   migrateDatabase(':memory:')  // or use the real path

import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { existsSync } from 'fs'
import { join } from 'path'

function resolveMigrationsFolder(): string {
  const candidates: string[] = []

  // Electron packaged/dev runtime (app path may be app.asar in production).
  try {
    const { app } = require('electron') as { app?: { getAppPath?: () => string } }
    const appPath = app?.getAppPath?.()
    if (appPath) candidates.push(join(appPath, 'drizzle'))
  } catch {
    // Non-Electron environments (e.g. scripts/tests) fall back to other paths.
  }

  // Bundled main entry (out/main/index.js)
  candidates.push(join(__dirname, '../../drizzle'))
  // Non-bundled main/db output (out/main/db/migrate.js)
  candidates.push(join(__dirname, '../../../drizzle'))
  // CLI/tests executed from repo root
  candidates.push(join(process.cwd(), 'drizzle'))

  const visited = new Set<string>()
  for (const folder of candidates) {
    if (visited.has(folder)) continue
    visited.add(folder)
    if (existsSync(join(folder, 'meta', '_journal.json'))) {
      return folder
    }
  }

  const checked = [...visited].map((p) => `- ${p}`).join('\n')
  throw new Error(
    `Unable to locate Drizzle migrations folder (missing meta/_journal.json). Checked:\n${checked}`
  )
}

/**
 * Apply all pending drizzle-kit migrations to the database at dbPath.
 *
 * The migration SQL files are located in `drizzle/` at the project root.
 * Drizzle tracks which migrations have been applied in a __drizzle_migrations table.
 *
 * @param dbPath - Path to the SQLite database file (must match initDatabase)
 */
export function migrateDatabase(dbPath: string): void {
  const migrationsFolder = resolveMigrationsFolder()

  // Dynamically import better-sqlite3 and drizzle here to avoid circular
  // dependency with client.ts (which imports schema, which is imported here).
  const Database = require('better-sqlite3')
  const { drizzle } = require('drizzle-orm/better-sqlite3')

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite)

  migrate(db, { migrationsFolder })

  sqlite.close()
}
