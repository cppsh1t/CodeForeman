// ── Execution Manager ──
//
// Manages the auto-progression loop for plan execution.
// After orchestrator.start() or orchestrator.resume(), this service:
// 1. Gets the current running TaskRun
// 2. Executes it via OpenCodeSessionService
// 3. On completion, checks if tick() created a new TaskRun
// 4. If yes, repeats; if no, the plan is complete
//
// Design decisions:
// - Fire-and-forget: the IPC handler returns immediately after starting execution
// - Tracks active executions per plan to prevent duplicates
// - Supports abort for pause/stop operations
// - All cross-table mutations go through TransactionFacade

import type { DatabaseInstance } from '@main/db/client'
import { TaskRunRepository } from '@main/repositories/task-run'
import { TaskRepository } from '@main/repositories/task'
import { OpenCodeSessionService } from '@main/services/opencode-session'
import { OpenCodeClientHolder } from '@main/services/opencode-client'

interface ActiveExecution {
  planId: number
  abortController: AbortController
}

export class ExecutionManager {
  private activeExecutions = new Map<number, ActiveExecution>()

  constructor(
    private readonly db: DatabaseInstance,
    private readonly sessionService: OpenCodeSessionService,
    private readonly clientHolder: OpenCodeClientHolder
  ) {}

  /**
   * Start auto-progression for a plan.
   * Returns immediately; execution runs in background.
   */
  async startExecution(planId: number): Promise<void> {
    // Prevent duplicate executions
    if (this.activeExecutions.has(planId)) {
      return
    }

    const abortController = new AbortController()
    this.activeExecutions.set(planId, { planId, abortController })

    try {
      await this.runNextTask(planId, abortController.signal)
    } finally {
      this.activeExecutions.delete(planId)
    }
  }

  /**
   * Abort the active execution for a plan.
   */
  abortExecution(planId: number): void {
    const execution = this.activeExecutions.get(planId)
    if (execution) {
      execution.abortController.abort()
    }
  }

  /**
   * Check if a plan has an active execution.
   */
  isActive(planId: number): boolean {
    return this.activeExecutions.has(planId)
  }

  // ── Internal ──

  private async runNextTask(planId: number, signal: AbortSignal): Promise<void> {
    // Check if aborted
    if (signal.aborted) return

    // Find the current running TaskRun for this plan
    const taskRunRepo = new TaskRunRepository(this.db)
    const taskRepo = new TaskRepository(this.db)

    const taskRuns = taskRunRepo.listByPlanId(planId)
    const runningTaskRun = taskRuns.find((tr) => tr.status === 'running')

    if (!runningTaskRun) {
      // No running task — execution is complete or paused
      return
    }

    // Get the task details for the prompt
    const task = taskRepo.findById(runningTaskRun.task_id) as
      | {
          name: string
          description: string
        }
      | undefined

    if (!task) {
      console.error(
        `[execution-manager] Task not found for TaskRun ${runningTaskRun.id} (task_id=${runningTaskRun.task_id})`
      )
      return
    }

    // Build the prompt from task name and description
    const prompt = `${task.name}\n\n${task.description}`

    // Execute the task via OpenCode
    await this.sessionService.execute(
      this.clientHolder.client,
      runningTaskRun.id,
      planId,
      runningTaskRun.correlation_id ?? '',
      prompt,
      { signal }
    )

    // After execute() returns, the sessionService has already called
    // orchestrator.tick() which may have created a new TaskRun.
    // Check if there's another running task and continue.
    if (!signal.aborted) {
      await this.runNextTask(planId, signal)
    }
  }
}
