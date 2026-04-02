// ── Database Layer Barrel Export ──
//
// Single entry point for all database functionality.
// Import from '@main/db' in the main process.

export * from './schema'
export {
  initDatabase,
  getDatabase,
  closeDatabase,
  getRawDatabase,
  createStandaloneDatabase,
  type DatabaseInstance
} from './client'
export { migrateDatabase } from './migrate'
