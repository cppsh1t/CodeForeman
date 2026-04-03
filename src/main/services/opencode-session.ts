// ── OpenCode Session Lifecycle Service ──
//
// Manages the lifecycle of OpenCode SDK sessions: create, promptAsync,
// event-driven status convergence, message persistence, and cleanup.
//
// Design decisions:
// - promptAsync is fire-and-forget: it sends the prompt and returns immediately.
//   Completion/failure is determined by consuming the event stream, NOT by
//   the promptAsync return value.
// - An EventConsumer processes the SSE stream, persisting run_messages and
//   updating task_run status when session goes idle or errors.
// - The service coordinates between the SDK client, the DB (via repos/facade),
//   and the orchestrator's tick method for status advancement.
// - All cross-table mutations go through TransactionFacade for atomicity.
// - Session errors are mapped to shared ErrorCode values for deterministic
//   internal error classification.

import type { OpencodeClient, Message } from '@opencode-ai/sdk'
import type { DatabaseInstance } from '@main/db/client'
import { TransactionFacade } from '@main/repositories'
import { TaskRunRepository } from '@main/repositories/task-run'
import { OrchestratorService } from '@main/services/orchestrator'
import { ErrorCode } from '@shared/types/task-run'
import { MessageRole } from '@shared/types/run-message'
import { mapSdkErrorToErrorCode } from './opencode-client'

// Re-export so consumers (tests, callers) can import from this module
export { mapSdkErrorToErrorCode } from './opencode-client'

// ── Event Consumer ──

export interface RunExecutionContext {
  taskRunId: number
  planId: number
  sessionId: string
  correlationId: string
}

/**
 * Result of event-driven status convergence.
 * - `completed`: session went idle with no error → run succeeded
 * - `failed`: session error or unexpected termination → run failed
 * - `cancelled`: orchestrator stopped/paused the run externally
 */
export type RunResolution =
  | { status: 'success' }
  | { status: 'failed'; errorCode: ErrorCode; message: string }

/**
 * Consume the OpenCode SSE event stream for a given session.
 * Persists meaningful events as run_messages and detects completion.
 *
 * Events of interest:
 * - message.updated → persist assistant messages as run_messages
 * - session.status → track busy/idle/retry
 * - session.idle  → run completed successfully
 * - session.error → run failed with mapped error code
 *
 * Returns a RunResolution when the stream terminates or a terminal event is received.
 */
export async function consumeEventStream(
  client: OpencodeClient,
  context: RunExecutionContext,
  db: DatabaseInstance,
  facade: TransactionFacade,
  orchestrator: OrchestratorService,
  signal?: AbortSignal
): Promise<RunResolution> {
  const { taskRunId, planId, sessionId, correlationId } = context
  let resolved = false

  // Batch messages for periodic persistence (avoid per-event DB writes)
  let messageBuffer: Array<{ correlation_id: string; role: string; content: string }> = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  const flushMessages = (): void => {
    if (messageBuffer.length > 0) {
      try {
        facade.persistRunMessages(taskRunId, messageBuffer)
      } catch (err) {
        console.error(`[opencode-session] Failed to persist messages for run ${taskRunId}:`, err)
      }
      messageBuffer = []
    }
  }

  const scheduleFlush = (): void => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(flushMessages, 2000)
  }

  try {
    const result = await client.event.subscribe({
      signal
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const event of result.stream as AsyncGenerator<any>) {
      if (resolved) break

      if (signal?.aborted) {
        flushMessages()
        if (flushTimer) clearTimeout(flushTimer)

        // Converge run to failed with TASK_TIMEOUT via orchestrator
        try {
          const runRepo = new TaskRunRepository(db)
          const run = runRepo.findById(taskRunId) as { status: string } | undefined
          if (run && run.status === 'running') {
            orchestrator.tick(planId, taskRunId, 'failed', ErrorCode.TASK_TIMEOUT)
          }
        } catch {
          // best-effort
        }

        return {
          status: 'failed',
          errorCode: ErrorCode.TASK_TIMEOUT,
          message: 'Run aborted by signal'
        }
      }

      // Extract event type and properties
      const eventType = event?.type
      const props = event?.properties

      // ── message.updated: persist assistant/user messages ──
      if (eventType === 'message.updated' && props?.info) {
        const msg: Message = props.info
        const role =
          msg.role === 'assistant'
            ? MessageRole.ASSISTANT
            : msg.role === 'user'
              ? MessageRole.USER
              : MessageRole.OPENCODE

        // Extract text content from the message
        const content = extractMessageText(msg)

        if (content) {
          messageBuffer.push({
            correlation_id: correlationId,
            role,
            content
          })
          scheduleFlush()
        }
      }

      // ── session.idle: run completed successfully ──
      if (eventType === 'session.idle' && props?.sessionID === sessionId) {
        flushMessages()
        if (flushTimer) clearTimeout(flushTimer)
        resolved = true

        // Atomically complete the run and advance the orchestrator
        try {
          const runRepo = new TaskRunRepository(db)
          const run = runRepo.findById(taskRunId) as { status: string } | undefined
          if (run && run.status === 'running') {
            orchestrator.tick(planId, taskRunId, 'success')
          }
        } catch (err) {
          console.error(`[opencode-session] Failed to complete run ${taskRunId}:`, err)
          return {
            status: 'failed',
            errorCode: ErrorCode.DB_ERROR,
            message: `Failed to mark run complete: ${err instanceof Error ? err.message : String(err)}`
          }
        }

        return { status: 'success' }
      }

      // ── session.error: run failed ──
      if (eventType === 'session.error') {
        flushMessages()
        if (flushTimer) clearTimeout(flushTimer)

        const sdkError = props?.error as { data?: { message?: string }; name?: string } | undefined
        const errorCode = mapSdkErrorToErrorCode(sdkError)
        const errorMessage = sdkError?.data?.message ?? sdkError?.name ?? 'Unknown session error'

        resolved = true

        try {
          const runRepo = new TaskRunRepository(db)
          const run = runRepo.findById(taskRunId) as { status: string } | undefined
          if (run && run.status === 'running') {
            orchestrator.tick(planId, taskRunId, 'failed', errorCode)
          }
        } catch (err) {
          console.error(`[opencode-session] Failed to fail run ${taskRunId}:`, err)
        }

        return {
          status: 'failed',
          errorCode,
          message: errorMessage
        }
      }
    }

    // Stream ended without a terminal event — treat as failure
    flushMessages()
    if (flushTimer) clearTimeout(flushTimer)

    if (!resolved) {
      // If abort was triggered during event processing, converge to TASK_TIMEOUT
      if (signal?.aborted) {
        try {
          const runRepo = new TaskRunRepository(db)
          const run = runRepo.findById(taskRunId) as { status: string } | undefined
          if (run && run.status === 'running') {
            orchestrator.tick(planId, taskRunId, 'failed', ErrorCode.TASK_TIMEOUT)
          }
        } catch {
          // best-effort
        }
        return {
          status: 'failed',
          errorCode: ErrorCode.TASK_TIMEOUT,
          message: 'Run aborted by signal'
        }
      }

      try {
        const runRepo = new TaskRunRepository(db)
        const run = runRepo.findById(taskRunId) as { status: string } | undefined
        if (run && run.status === 'running') {
          orchestrator.tick(planId, taskRunId, 'failed', ErrorCode.UNKNOWN)
        }
      } catch {
        // best-effort
      }
      return {
        status: 'failed',
        errorCode: ErrorCode.UNKNOWN,
        message: 'Event stream ended without terminal event'
      }
    }

    return { status: 'success' }
  } catch (err) {
    // Stream was interrupted or connection failed
    flushMessages()
    if (flushTimer) clearTimeout(flushTimer)

    if (signal?.aborted) {
      try {
        const runRepo = new TaskRunRepository(db)
        const run = runRepo.findById(taskRunId) as { status: string } | undefined
        if (run && run.status === 'running') {
          orchestrator.tick(planId, taskRunId, 'failed', ErrorCode.TASK_TIMEOUT)
        }
      } catch {
        // best-effort
      }
      return { status: 'failed', errorCode: ErrorCode.TASK_TIMEOUT, message: 'Run aborted' }
    }

    const errorCode = mapSdkErrorToErrorCode(err)
    const message = err instanceof Error ? err.message : String(err)

    try {
      const runRepo = new TaskRunRepository(db)
      const run = runRepo.findById(taskRunId) as { status: string } | undefined
      if (run && run.status === 'running') {
        orchestrator.tick(planId, taskRunId, 'failed', errorCode)
      }
    } catch {
      // best-effort
    }

    return { status: 'failed', errorCode, message }
  }
}

// ── Text extraction ──

/**
 * Extract human-readable text content from a Message.
 * Handles both UserMessage and AssistantMessage shapes.
 */
function extractMessageText(msg: Message): string {
  // Check for direct text content (not part of the strict SDK Message type,
  // but mock objects and some extended message formats may include it)
  const record = msg as unknown as Record<string, unknown>
  if (typeof record.text === 'string' && record.text) {
    return record.text
  }

  // For assistant messages, reconstruct a summary from metadata
  if (msg.role === 'assistant') {
    const parts: string[] = []
    parts.push(`[model: ${msg.modelID}]`)
    if (msg.error) {
      // All SDK error variants have .name and .data; data.message is common but not universal
      const data = msg.error.data as { message?: string } | undefined
      parts.push(`[error: ${data?.message ?? msg.error.name ?? 'unknown'}]`)
    }
    if (msg.finish) {
      parts.push(`[finish: ${msg.finish}]`)
    }
    return parts.join(' ') || '[assistant message]'
  }

  return ''
}

// ── Session Lifecycle Service ──

/**
 * Coordinates the full lifecycle of an OpenCode session for a task run.
 *
 * Flow:
 * 1. Create a new OpenCode session
 * 2. Send promptAsync to begin processing
 * 3. Spawn event consumer (background) that drives status convergence
 * 4. Return context for caller to track or cancel
 *
 * The session lifecycle is event-driven: promptAsync fires the prompt,
 * and the event stream determines when the run completes or fails.
 */
export class OpenCodeSessionService {
  constructor(
    private readonly db: DatabaseInstance,
    private readonly facade: TransactionFacade,
    private readonly orchestrator: OrchestratorService
  ) {}

  /**
   * Execute a task run via OpenCode SDK.
   *
   * 1. Creates a new session
   * 2. Sends promptAsync
   * 3. Starts consuming events (returns a promise that resolves when run completes)
   *
   * @param client - Connected OpenCode SDK client
   * @param taskRunId - The active TaskRun to execute
   * @param planId - The parent plan (needed for orchestrator.tick)
   * @param correlationId - Correlation ID for the run
   * @param prompt - The prompt text to send to OpenCode
   * @param options - Optional: sessionId to reuse, abort signal
   * @returns RunResolution indicating success or failure
   */
  async execute(
    client: OpencodeClient,
    taskRunId: number,
    planId: number,
    correlationId: string,
    prompt: string,
    options?: {
      sessionId?: string
      signal?: AbortSignal
      directory?: string
    }
  ): Promise<RunResolution> {
    let sessionId: string

    // Step 1: Create session (or use existing)
    if (options?.sessionId) {
      sessionId = options.sessionId
    } else {
      try {
        const createResult = await client.session.create({
          body: {
            title: `Run ${taskRunId}`
          }
        })
        if (createResult.error) {
          const errCode = mapSdkErrorToErrorCode(createResult.error)
          this.failRun(taskRunId, planId, errCode, 'Failed to create session')
          return {
            status: 'failed',
            errorCode: errCode,
            message: `Session creation failed: ${String(createResult.error)}`
          }
        }
        sessionId = createResult.data!.id
      } catch (err) {
        const errCode = mapSdkErrorToErrorCode(err)
        this.failRun(
          taskRunId,
          planId,
          errCode,
          `Session creation error: ${err instanceof Error ? err.message : String(err)}`
        )
        return {
          status: 'failed',
          errorCode: errCode,
          message: err instanceof Error ? err.message : String(err)
        }
      }
    }

    // Step 2: Persist the user prompt as a run message
    try {
      this.facade.persistRunMessages(taskRunId, [
        {
          correlation_id: correlationId,
          role: MessageRole.USER,
          content: prompt
        }
      ])
    } catch (err) {
      console.error(`[opencode-session] Failed to persist user message:`, err)
      // Non-fatal: the run can still proceed
    }

    // Step 3: Send promptAsync (fire-and-forget)
    try {
      const promptResult = await client.session.promptAsync({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: prompt }],
          ...(options?.directory ? {} : {})
        },
        query: options?.directory ? { directory: options.directory } : undefined
      })

      if (promptResult.error) {
        const errCode = mapSdkErrorToErrorCode(promptResult.error)
        this.failRun(taskRunId, planId, errCode, 'Failed to send prompt')
        return {
          status: 'failed',
          errorCode: errCode,
          message: `Prompt rejected: ${String(promptResult.error)}`
        }
      }
      // promptAsync returns 204 on success — this is NOT completion
    } catch (err) {
      const errCode = mapSdkErrorToErrorCode(err)
      this.failRun(
        taskRunId,
        planId,
        errCode,
        `Prompt error: ${err instanceof Error ? err.message : String(err)}`
      )
      return {
        status: 'failed',
        errorCode: errCode,
        message: err instanceof Error ? err.message : String(err)
      }
    }

    // Step 4: Consume events to determine completion
    const context: RunExecutionContext = {
      taskRunId,
      planId,
      sessionId,
      correlationId
    }

    return consumeEventStream(
      client,
      context,
      this.db,
      this.facade,
      this.orchestrator,
      options?.signal
    )
  }

  /**
   * Abort a running session via the SDK.
   */
  async abort(client: OpencodeClient, sessionId: string): Promise<boolean> {
    try {
      const result = await client.session.abort({
        path: { id: sessionId }
      })
      if (result.error) {
        console.error(`[opencode-session] Abort failed:`, result.error)
        return false
      }
      return true
    } catch (err) {
      console.error(`[opencode-session] Abort error:`, err)
      return false
    }
  }

  // ── Internal helpers ──

  private failRun(taskRunId: number, planId: number, errorCode: ErrorCode, _message: string): void {
    try {
      const runRepo = new TaskRunRepository(this.db)
      const run = runRepo.findById(taskRunId) as { status: string } | undefined
      if (run && run.status === 'running') {
        this.orchestrator.tick(planId, taskRunId, 'failed', errorCode)
      }
    } catch (err) {
      console.error(`[opencode-session] failRun error:`, err)
    }
  }
}
