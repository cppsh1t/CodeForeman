// ── Run Message Retention Service ──
//
// Enforces retention policy on run_messages to prevent unbounded log growth.
//
// Retention rules:
// - Max messages per task_run: configurable (default 1000).
// - When a task_run exceeds the cap, oldest messages are trimmed.
// - Retention enforcement is deterministic: keeps newest N messages.
// - Designed to be called after batch message persistence.
//
// Design decisions:
// - Uses DELETE with subquery to keep only the newest N messages per run.
// - Works within the repository layer — no raw SQL outside this file.
// - Retention cap is configurable per-call (defaults to DEFAULT_MAX_MESSAGES).

import { eq, desc, and, lt } from 'drizzle-orm'
import { runMessages } from '@main/db/schema'
import type { DatabaseInstance } from '@main/db/client'
import { RunMessageRepository } from '@main/repositories/run-message'

// ── Retention Configuration ──

/** Default maximum messages to retain per task_run. */
export const DEFAULT_MAX_MESSAGES = 1000

export interface RetentionConfig {
  /** Maximum number of messages to keep per task_run. Default: 1000. */
  maxMessagesPerRun: number
}

// ── Retention Result ──

export interface RetentionResult {
  /** Number of messages trimmed. */
  trimmed: number
  /** Number of messages remaining after trimming. */
  remaining: number
}

// ── Retention Service ──

export class RetentionService {
  private readonly maxMessages: number

  constructor(
    private readonly db: DatabaseInstance,
    config?: Partial<RetentionConfig>
  ) {
    this.maxMessages = config?.maxMessagesPerRun ?? DEFAULT_MAX_MESSAGES
  }

  /**
   * Enforce retention on a single task_run.
   * Deletes oldest messages if count exceeds maxMessages.
   *
   * @param taskRunId - The task_run to enforce retention on.
   * @returns RetentionResult with trimmed count and remaining count.
   */
  enforceForRun(taskRunId: number): RetentionResult {
    const messageRepo = new RunMessageRepository(this.db)
    const currentCount = messageRepo.count(eq(runMessages.task_run_id, taskRunId))

    if (currentCount <= this.maxMessages) {
      return { trimmed: 0, remaining: currentCount }
    }

    // currentCount - this.maxMessages messages will be deleted.

    // Delete the oldest messages (those NOT in the top N by id desc).
    // Subquery: find the N-th message id when ordered newest-first.
    // Then delete all messages with id < that threshold.
    const cutoffSubquery = this.db
      .select({ id: runMessages.id })
      .from(runMessages)
      .where(eq(runMessages.task_run_id, taskRunId))
      .orderBy(desc(runMessages.id))
      .limit(this.maxMessages)
      .offset(0)

    // Get the minimum id in the keep-set
    const keepRows = cutoffSubquery.all() as Array<{ id: number }>
    if (keepRows.length === 0) {
      return { trimmed: 0, remaining: currentCount }
    }

    const minKeepId = Math.min(...keepRows.map((r) => r.id))

    // Delete all messages with id < minKeepId (these are the oldest)
    const deleted = this.db
      .delete(runMessages)
      .where(and(eq(runMessages.task_run_id, taskRunId), lt(runMessages.id, minKeepId)))
      .returning()
      .all()

    return {
      trimmed: deleted.length,
      remaining: currentCount - deleted.length
    }
  }

  /**
   * Get the current retention configuration.
   */
  getConfig(): RetentionConfig {
    return { maxMessagesPerRun: this.maxMessages }
  }
}
