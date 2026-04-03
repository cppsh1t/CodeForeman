// ── Log Batcher — Throttled/Batched Message Persistence ──
//
// Buffers high-frequency log messages and persists them in batches to reduce
// database write pressure during event stream consumption.
//
// Design decisions:
// - Dual trigger: flush on timer interval OR when buffer reaches max size.
// - Synchronous flush (better-sqlite3 is sync) — no async complexity.
// - Flush-on-full provides backpressure: if events arrive faster than the
//   timer, the buffer fills up and triggers an immediate flush.
// - If flush fails, messages remain in the buffer and will be retried on
//   the next trigger (at-most-once delivery; duplicates are acceptable for logs).
// - Dispose must be called to prevent timer leaks.
//
// Usage:
//   const batcher = new LogBatcher(db, facade, { maxBufferSize: 50, flushIntervalMs: 2000 })
//   batcher.add(taskRunId, { correlation_id, role: 'assistant', content: '...' })
//   // ... add more messages
//   batcher.dispose() // flushes remaining + clears timer

import type { DatabaseInstance } from '@main/db/client'
import { TransactionFacade } from '@main/repositories'
import { RetentionService } from './retention'

// ── Types ──

export interface LogMessage {
  correlation_id: string
  role: string
  content: string
}

export interface LogBatcherConfig {
  /** Maximum messages before an immediate flush is triggered. Default: 50. */
  maxBufferSize: number
  /** Interval in ms between automatic flushes. Default: 2000. */
  flushIntervalMs: number
  /** Whether to enforce retention after each flush. Default: true. */
  enforceRetention: boolean
  /** Retention cap: max messages per task_run. Default: 1000. */
  retentionCap: number
}

// ── Log Batcher ──

export class LogBatcher {
  private buffer: Map<number, LogMessage[]> = new Map()
  private timer: ReturnType<typeof setTimeout> | null = null
  private _disposed = false

  private readonly maxBufferSize: number
  private readonly flushIntervalMs: number
  private readonly enforceRetention: boolean
  private readonly retentionService: RetentionService | null

  constructor(
    private readonly _db: DatabaseInstance,
    private readonly facade: TransactionFacade,
    config?: Partial<LogBatcherConfig>
  ) {
    this.maxBufferSize = config?.maxBufferSize ?? 50
    this.flushIntervalMs = config?.flushIntervalMs ?? 2000
    this.enforceRetention = config?.enforceRetention ?? true

    if (this.enforceRetention) {
      this.retentionService = new RetentionService(this._db, {
        maxMessagesPerRun: config?.retentionCap ?? 1000
      })
    } else {
      this.retentionService = null
    }

    this.startTimer()
  }

  /**
   * Add a message to the buffer for the given task_run.
   * If the buffer for this task_run exceeds maxBufferSize, an immediate flush is triggered.
   */
  add(taskRunId: number, message: LogMessage): void {
    if (this._disposed) {
      console.warn('[log-batcher] Attempted to add message after disposal')
      return
    }

    const messages = this.buffer.get(taskRunId) ?? []
    messages.push(message)
    this.buffer.set(taskRunId, messages)

    // Immediate flush if buffer for this run exceeds threshold
    if (messages.length >= this.maxBufferSize) {
      this.flushRun(taskRunId)
    }
  }

  /**
   * Flush all buffered messages across all task_runs.
   */
  flush(): void {
    if (this._disposed) return

    for (const taskRunId of this.buffer.keys()) {
      this.flushRun(taskRunId)
    }
  }

  /**
   * Flush and enforce retention for a specific task_run.
   */
  private flushRun(taskRunId: number): void {
    const messages = this.buffer.get(taskRunId)
    if (!messages || messages.length === 0) return

    try {
      this.facade.persistRunMessages(taskRunId, messages)

      // Enforce retention after successful persistence
      if (this.retentionService) {
        const result = this.retentionService.enforceForRun(taskRunId)
        if (result.trimmed > 0) {
          console.info(
            `[log-batcher] Retention: trimmed ${result.trimmed} old messages for run ${taskRunId}`
          )
        }
      }

      // Clear the buffer for this run
      this.buffer.set(taskRunId, [])
    } catch (err) {
      // Don't clear buffer on failure — messages will be retried on next flush
      console.error(
        `[log-batcher] Failed to flush ${messages.length} messages for run ${taskRunId}:`,
        err instanceof Error ? err.message : String(err)
      )
    }
  }

  /**
   * Start the periodic flush timer.
   */
  private startTimer(): void {
    this.timer = setTimeout(() => {
      this.flush()
      if (!this._disposed) {
        this.startTimer() // Reschedule
      }
    }, this.flushIntervalMs)
  }

  /**
   * Dispose the batcher: flush all remaining messages and clear the timer.
   * Must be called when the batcher is no longer needed to prevent leaks.
   */
  dispose(): void {
    // Flush BEFORE marking disposed, otherwise flush() bails early
    this.flush()

    this._disposed = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.buffer.clear()
  }

  /** Whether the batcher has been disposed. */
  get disposed(): boolean {
    return this._disposed
  }

  /** Current buffer size across all task_runs. */
  get bufferSize(): number {
    let total = 0
    for (const messages of this.buffer.values()) {
      total += messages.length
    }
    return total
  }
}
