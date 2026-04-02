import { defineConfig } from 'drizzle-kit'

// Drizzle Kit configuration for SQLite + better-sqlite3.
// Used by: `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:studio`

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: './dev.db'
  }
})
