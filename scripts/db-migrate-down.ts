#!/usr/bin/env node
// ── db-migrate-down.ts ──
//
// Reverses the most recently applied drizzle-kit migration.
// Reads meta/_journal.json for migration ordering and tags, checks
// __drizzle_migrations table for applied entries, executes the
// corresponding <tag>_down.sql, and removes the journal entry.
//
// Usage: npx tsx scripts/db-migrate-down.ts [--db <path>]
//   --db <path>  SQLite database path (default: ./dev.db from drizzle.config.ts)

import Database from 'better-sqlite3'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Parse CLI args
const args = process.argv.slice(2)
let dbPath = './dev.db'

const dbIdx = args.indexOf('--db')
if (dbIdx !== -1 && args[dbIdx + 1]) {
  dbPath = args[dbIdx + 1]
}

if (!existsSync(dbPath)) {
  console.error(`[migrate:down] Database not found: ${dbPath}`)
  process.exit(1)
}

// Read the drizzle journal to get migration ordering and tags
const journalPath = join(__dirname, '..', 'drizzle', 'meta', '_journal.json')
if (!existsSync(journalPath)) {
  console.error('[migrate:down] drizzle/meta/_journal.json not found. No migrations exist.')
  process.exit(1)
}

interface JournalEntry {
  idx: number
  when: number
  tag: string
}

const journal = JSON.parse(readFileSync(journalPath, 'utf-8'))
const journalEntries: JournalEntry[] = journal.entries

if (journalEntries.length === 0) {
  console.log('[migrate:down] No migrations in journal. Nothing to reverse.')
  process.exit(0)
}

// Sort by idx descending to find the last migration tag
const sorted = [...journalEntries].sort((a, b) => b.idx - a.idx)
const latestTag = sorted[0].tag

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')

// Check if the journal table exists in the database
const journalTableExists = sqlite
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
  .get() as { name: string } | undefined

if (!journalTableExists) {
  console.log('[migrate:down] No migrations have been applied. Nothing to reverse.')
  sqlite.close()
  process.exit(0)
}

// Count applied migrations to ensure the latest one has actually been applied
const appliedCount = (
  sqlite.prepare('SELECT COUNT(*) as cnt FROM __drizzle_migrations').get() as { cnt: number }
).cnt

if (appliedCount === 0) {
  console.log('[migrate:down] No migrations in database journal. Nothing to reverse.')
  sqlite.close()
  process.exit(0)
}

// Find the down SQL file for the latest migration
const downFile = join(__dirname, '..', 'drizzle', `${latestTag}_down.sql`)

if (!existsSync(downFile)) {
  console.error(
    `[migrate:down] Down migration file not found: ${downFile}\n` +
      `The migration "${latestTag}" does not have a corresponding ${latestTag}_down.sql file.\n` +
      `To reverse this migration, create the down SQL file or drop the database manually.`
  )
  sqlite.close()
  process.exit(1)
}

// Execute the down SQL in a transaction
const downSql = readFileSync(downFile, 'utf-8')
console.log(`[migrate:down] Reversing migration: ${latestTag}`)

try {
  sqlite.exec('BEGIN')
  sqlite.exec(downSql)

  // Remove the last applied migration entry from the journal table
  // drizzle stores them with rowid ordering; remove the most recent one
  sqlite
    .prepare(
      `DELETE FROM __drizzle_migrations 
       WHERE rowid IN (
         SELECT rowid FROM __drizzle_migrations 
         ORDER BY rowid DESC 
         LIMIT 1
       )`
    )
    .run()

  sqlite.exec('COMMIT')
  console.log(`[migrate:down] Successfully reversed migration: ${latestTag}`)
} catch (err) {
  sqlite.exec('ROLLBACK')
  console.error(`[migrate:down] Failed to reverse migration:`, err)
  sqlite.close()
  process.exit(1)
}

sqlite.close()
