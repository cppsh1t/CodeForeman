// ── Base Repository ──
//
// Generic CRUD + pagination + filter operations backed by Drizzle ORM.
// Entity-specific repositories extend this base with domain-aware methods.
//
// Design decisions:
// - All methods are synchronous (better-sqlite3 is synchronous).
// - Pagination uses offset-based approach (SQLite-friendly, no cursor complexity).
// - Filters are built up via Drizzle's where() combinators — no raw SQL.
// - Uses `any` for the table generic to avoid Drizzle v0.45 complex index
//   signature constraints; all type safety is restored at the entity level.

import { eq, desc, asc, count as countFn, type SQL, type SQLWrapper } from 'drizzle-orm'
import type { DatabaseInstance } from '@main/db/client'

// ── Types ──

/** Pagination parameters. */
export interface PaginationParams {
  page: number
  page_size: number
}

/** Paginated result set. */
export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

// ── Base Repository ──

export class BaseRepository {
  constructor(
    protected readonly db: DatabaseInstance,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected readonly table: any
  ) {}

  // ── Create ──

  /** Insert a single row and return it. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert(values: any): any {
    return this.db.insert(this.table).values(values).returning().get()
  }

  /** Insert multiple rows and return them. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insertMany(rows: any[]): any[] {
    if (rows.length === 0) return []
    return this.db.insert(this.table).values(rows).returning().all() as any[]
  }

  // ── Read ──

  /** Find a single row by primary key. Returns undefined if not found. */
  findById(id: number): unknown {
    const pkColumn = this.getPrimaryKeyColumn()
    return this.db.select().from(this.table).where(eq(pkColumn, id)).get()
  }

  /**
   * Find a single row by primary key. Throws if not found.
   * Use when the caller expects the row to exist.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getById(id: number): any {
    const row = this.findById(id)
    if (!row) {
      const meta = this.table as unknown as { [k: symbol]: string | undefined }
      const tableName = meta[Symbol.for('drizzle:Name')]
      throw new Error(`Entity not found in ${tableName ?? 'table'}: id=${id}`)
    }
    return row
  }

  /**
   * List rows with pagination and optional filter.
   * Defaults to ordering by id descending (newest first).
   */
  list(params: PaginationParams, filters?: SQL | undefined): PaginatedResult<unknown> {
    const { page, page_size } = params
    const offset = (page - 1) * page_size
    const pkColumn = this.getPrimaryKeyColumn()

    // Count total matching rows
    const countQuery = filters
      ? this.db.select({ count: countFn() }).from(this.table).where(filters)
      : this.db.select({ count: countFn() }).from(this.table)
    const total = countQuery.get()?.count ?? 0

    // Fetch page
    const dataQuery = filters
      ? this.db
          .select()
          .from(this.table)
          .where(filters)
          .orderBy(desc(pkColumn))
          .limit(page_size)
          .offset(offset)
      : this.db.select().from(this.table).orderBy(desc(pkColumn)).limit(page_size).offset(offset)
    const items = dataQuery.all()

    return { items, total, page, page_size }
  }

  /**
   * List all rows matching filters (no pagination).
   * Useful for small collections like tasks within a plan.
   */
  findAll(filters?: SQL | undefined): unknown[] {
    const pkColumn = this.getPrimaryKeyColumn()
    const dataQuery = filters
      ? this.db.select().from(this.table).where(filters).orderBy(asc(pkColumn))
      : this.db.select().from(this.table).orderBy(asc(pkColumn))
    return dataQuery.all()
  }

  // ── Update ──

  /** Update rows matching a filter. Returns the updated rows. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update(values: any, filters: SQL | undefined): any[] {
    if (!filters) {
      throw new Error('BaseRepository.update requires a filter condition for safety.')
    }
    return this.db.update(this.table).set(values).where(filters).returning().all() as any[]
  }

  /** Update a single row by primary key. Returns the updated row or undefined. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateById(id: number, values: any): any {
    const pkColumn = this.getPrimaryKeyColumn()
    return this.db.update(this.table).set(values).where(eq(pkColumn, id)).returning().get()
  }

  // ── Delete ──

  /** Delete rows matching a filter. Returns the deleted rows. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete(filters: SQL | undefined): any[] {
    if (!filters) {
      throw new Error('BaseRepository.delete requires a filter condition for safety.')
    }
    return this.db.delete(this.table).where(filters).returning().all() as any[]
  }

  /** Delete a single row by primary key. Returns the deleted row or undefined. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteById(id: number): any {
    const pkColumn = this.getPrimaryKeyColumn()
    return this.db.delete(this.table).where(eq(pkColumn, id)).returning().get()
  }

  // ── Count ──

  /** Count all rows matching optional filters. */
  count(filters?: SQL | undefined): number {
    const countQuery = filters
      ? this.db.select({ count: countFn() }).from(this.table).where(filters)
      : this.db.select({ count: countFn() }).from(this.table)
    return countQuery.get()?.count ?? 0
  }

  // ── Exists ──

  /** Check if any row matches the given filter. */
  exists(filters: SQL | undefined): boolean {
    if (!filters) return false
    const result = this.db.select({ count: countFn() }).from(this.table).where(filters).get()
    return (result?.count ?? 0) > 0
  }

  // ── Internal helpers ──

  /** Get the primary key column (assumes single PK named 'id'). */
  protected getPrimaryKeyColumn(): SQLWrapper {
    const table = this.table as unknown as {
      [k: symbol]: Record<string, unknown>
    }
    const columns = table[Symbol.for('drizzle:Columns')] ?? {}
    return (columns.id ?? Object.values(columns)[0]) as SQLWrapper
  }
}
