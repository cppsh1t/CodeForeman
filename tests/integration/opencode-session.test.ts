// ── OpenCode SDK Session Lifecycle Integration Tests ──
//
// Tests the full event-driven lifecycle: promptAsync → event stream →
// status convergence → run_messages persistence.
//
// Uses a mock OpenCode client since tests run without a real server.
// The mock simulates the SSE event stream with realistic event sequences.
//
// Test categories:
// 1. "sdk promptAsync event completion" — happy path: prompt → events → idle → run success
// 2. "sdk stream interruption" — failure path: stream error → run failure with error code

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import { createStandaloneDatabase, type DatabaseInstance } from '@main/db/client'
import { projects, plans, tasks, taskRuns, runMessages } from '@main/db/schema'
import { TransactionFacade } from '@main/repositories'
import { OrchestratorService } from '@main/services/orchestrator'
import {
  consumeEventStream,
  OpenCodeSessionService,
  mapSdkErrorToErrorCode
} from '@main/services/opencode-session'
import { OpenCodeClientHolder } from '@main/services/opencode-client'
import { ErrorCode } from '@shared/types/task-run'
import { MessageRole } from '@shared/types/run-message'
import { generateCorrelationId as _generateCorrelationId } from '@shared/types/correlation'
import type { OpencodeClient } from '@opencode-ai/sdk'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let sqlite: import('better-sqlite3').Database
let db: DatabaseInstance

function now(): string {
  return new Date().toISOString()
}

function seedPlan(taskCount = 2): {
  projectId: number
  planId: number
  taskIds: number[]
  taskRunId: number
  correlationId: string
} {
  const timestamp = now()

  const project = db
    .insert(projects)
    .values({
      name: 'Test Project',
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp
    })
    .returning()
    .get()!

  const plan = db
    .insert(plans)
    .values({
      project_id: project.id,
      name: 'Test Plan',
      status: 'ready',
      created_at: timestamp,
      updated_at: timestamp
    })
    .returning()
    .get()!

  const taskRows = Array.from({ length: taskCount }, (_, i) => ({
    plan_id: plan.id,
    name: `Task ${i + 1}`,
    status: 'pending',
    order_index: i,
    created_at: timestamp,
    updated_at: timestamp
  }))

  const inserted = db.insert(tasks).values(taskRows).returning().all()

  // Start the plan so the first task is running with a TaskRun
  const facade = new TransactionFacade(db)
  const orchestrator = new OrchestratorService(db, facade)
  orchestrator.start(plan.id)

  const run = db.select().from(taskRuns).where(eq(taskRuns.status, 'running')).get()!

  return {
    projectId: project.id,
    planId: plan.id,
    taskIds: inserted.map((t) => t.id),
    taskRunId: run.id,
    correlationId: run.correlation_id
  }
}

/**
 * Create a mock OpencodeClient that simulates an SSE event stream.
 *
 * @param events - Array of events to emit in sequence
 * @param options - Optional: delay between events, error to throw
 */
function createMockClient(
  events: Array<{ type: string; properties?: Record<string, unknown> }>,
  options?: {
    delay?: number
    streamError?: Error
  }
): { client: OpencodeClient; abortController: AbortController } {
  const abortController = new AbortController()

  const mockClient = {
    session: {
      create: async () => ({
        data: { id: 'mock-session-id', title: 'Test Session' },
        error: undefined
      }),
      promptAsync: async () => ({
        data: undefined,
        error: undefined
      }),
      abort: async () => ({
        data: true,
        error: undefined
      }),

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status: async (_options: any) => ({ data: {}, error: undefined })
    },
    event: {
      subscribe: async () => {
        if (options?.streamError) {
          throw options.streamError
        }

        const delay = options?.delay ?? 0

        async function* generateEvents() {
          for (const event of events) {
            if (abortController.signal.aborted) {
              return
            }
            if (delay > 0) {
              await new Promise((resolve) => setTimeout(resolve, delay))
            }
            yield event
          }
        }

        return { stream: generateEvents() }
      }
    },
    global: {},
    project: {},
    config: {},
    find: {},
    file: {},
    app: {},
    auth: {}
  } as unknown as OpencodeClient

  return { client: mockClient, abortController }
}

beforeEach(() => {
  const result = createStandaloneDatabase(':memory:')
  sqlite = result.sqlite
  db = result.db

  const migrationsFolder = join(__dirname, '../../drizzle')
  migrate(db, { migrationsFolder })
})

afterEach(() => {
  sqlite.close()
})

// ===========================================================================
// Test Suite 1: "sdk promptAsync event completion" — Happy Path
// ===========================================================================

describe('sdk promptAsync event completion', () => {
  it('event-driven idle resolves run to success and persists messages', async () => {
    const { planId, taskRunId, correlationId } = seedPlan(1)
    const sessionId = 'test-session-id'

    const events: Array<{ type: string; properties?: Record<string, unknown> }> = [
      {
        type: 'message.updated',
        properties: {
          info: {
            id: 'msg-1',
            sessionID: sessionId,
            role: 'assistant',
            text: 'I will implement the feature now.',
            time: { created: Date.now() },
            parentID: 'parent-1',
            modelID: 'claude-3',
            providerID: 'anthropic',
            mode: 'default',
            path: { cwd: '/test', root: '/test' },
            cost: 0.01,
            tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      },
      {
        type: 'session.idle',
        properties: {
          sessionID: sessionId
        }
      }
    ]

    const { client } = createMockClient(events)
    const facade = new TransactionFacade(db)
    const orchestrator = new OrchestratorService(db, facade)

    const result = await consumeEventStream(
      client,
      { taskRunId, planId, sessionId, correlationId },
      db,
      facade,
      orchestrator
    )

    // Run resolved successfully
    expect(result.status).toBe('success')

    // TaskRun status should be 'success' in DB
    const run = db.select().from(taskRuns).where(eq(taskRuns.id, taskRunId)).get()!
    expect(run.status).toBe('success')
    expect(run.error_code).toBeNull()
    expect(run.finished_at).not.toBeNull()

    // Parent task should be 'success'
    const task = db.select().from(tasks).where(eq(tasks.id, run.task_id)).get()!
    expect(task.status).toBe('success')

    // Run message should be persisted
    const messages = db
      .select()
      .from(runMessages)
      .where(eq(runMessages.task_run_id, taskRunId))
      .all()
    expect(messages.length).toBeGreaterThanOrEqual(1)
    const assistantMsg = messages.find((m) => m.role === MessageRole.ASSISTANT)
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg!.content).toContain('I will implement the feature now')
    expect(assistantMsg!.correlation_id).toBe(correlationId)

    // Plan should still be running (more tasks to go in V1, or completed if only 1)
    const plan = db.select().from(plans).where(eq(plans.id, planId)).get()!
    expect(['running', 'completed']).toContain(plan.status)
  })

  it('multiple messages are batch-persisted before idle event', async () => {
    const { planId, taskRunId, correlationId } = seedPlan(1)
    const sessionId = 'batch-test-session'

    const events: Array<{ type: string; properties?: Record<string, unknown> }> = [
      {
        type: 'message.updated',
        properties: {
          info: {
            id: 'msg-1',
            sessionID: sessionId,
            role: 'assistant',
            text: 'First message',
            time: { created: Date.now() },
            parentID: 'p1',
            modelID: 'm1',
            providerID: 'p1',
            mode: 'default',
            path: { cwd: '/', root: '/' },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      },
      {
        type: 'message.updated',
        properties: {
          info: {
            id: 'msg-2',
            sessionID: sessionId,
            role: 'assistant',
            text: 'Second message',
            time: { created: Date.now() },
            parentID: 'p1',
            modelID: 'm1',
            providerID: 'p1',
            mode: 'default',
            path: { cwd: '/', root: '/' },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      },
      {
        type: 'message.updated',
        properties: {
          info: {
            id: 'msg-3',
            sessionID: sessionId,
            role: 'assistant',
            text: 'Third message',
            time: { created: Date.now() },
            parentID: 'p1',
            modelID: 'm1',
            providerID: 'p1',
            mode: 'default',
            path: { cwd: '/', root: '/' },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      },
      {
        type: 'session.idle',
        properties: {
          sessionID: sessionId
        }
      }
    ]

    const { client } = createMockClient(events)
    const facade = new TransactionFacade(db)
    const orchestrator = new OrchestratorService(db, facade)

    const result = await consumeEventStream(
      client,
      { taskRunId, planId, sessionId, correlationId },
      db,
      facade,
      orchestrator
    )

    expect(result.status).toBe('success')

    // All 3 assistant messages should be persisted
    const messages = db
      .select()
      .from(runMessages)
      .where(eq(runMessages.task_run_id, taskRunId))
      .all()
    const assistantMessages = messages.filter((m) => m.role === MessageRole.ASSISTANT)
    expect(assistantMessages).toHaveLength(3)
    expect(assistantMessages.map((m) => m.content)).toEqual([
      'First message',
      'Second message',
      'Third message'
    ])
  })

  it('completion is event-driven not promptAsync-return', async () => {
    // This test verifies the CRITICAL design contract:
    // promptAsync return (204) does NOT mean completion.
    // Only session.idle event drives completion.
    const { planId, taskRunId, correlationId } = seedPlan(1)
    const sessionId = 'async-test-session'

    // Events: prompt accepted (not a real event, but we verify
    // that without session.idle, the run stays running)
    const events: Array<{ type: string; properties?: Record<string, unknown> }> = [
      {
        type: 'session.status',
        properties: {
          sessionID: sessionId,
          status: { type: 'busy' }
        }
      }
      // No session.idle — stream ends without terminal event
    ]

    const { client } = createMockClient(events)
    const facade = new TransactionFacade(db)
    const orchestrator = new OrchestratorService(db, facade)

    const result = await consumeEventStream(
      client,
      { taskRunId, planId, sessionId, correlationId },
      db,
      facade,
      orchestrator
    )

    // Without session.idle, the run should be marked as failed
    expect(result.status).toBe('failed')
    expect(result.errorCode).toBe(ErrorCode.UNKNOWN)
    expect(result.message).toContain('without terminal event')

    const run = db.select().from(taskRuns).where(eq(taskRuns.id, taskRunId)).get()!
    expect(run.status).toBe('failed')
    expect(run.error_code).toBe(ErrorCode.UNKNOWN)
  })

  it('full execute flow: session create → promptAsync → events → success', async () => {
    const { planId, taskRunId, correlationId } = seedPlan(1)
    const sessionId = 'full-flow-session'

    const events: Array<{ type: string; properties?: Record<string, unknown> }> = [
      {
        type: 'message.updated',
        properties: {
          info: {
            id: 'msg-1',
            sessionID: sessionId,
            role: 'assistant',
            text: 'Done!',
            time: { created: Date.now() },
            parentID: 'p1',
            modelID: 'm1',
            providerID: 'p1',
            mode: 'default',
            path: { cwd: '/', root: '/' },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      },
      {
        type: 'session.idle',
        properties: { sessionID: sessionId }
      }
    ]

    const { client } = createMockClient(events)
    const facade = new TransactionFacade(db)
    const orchestrator = new OrchestratorService(db, facade)
    const service = new OpenCodeSessionService(db, facade, orchestrator)

    const result = await service.execute(
      client,
      taskRunId,
      planId,
      correlationId,
      'Implement feature X',
      { sessionId }
    )

    expect(result.status).toBe('success')

    // User prompt should be persisted
    const messages = db
      .select()
      .from(runMessages)
      .where(eq(runMessages.task_run_id, taskRunId))
      .all()
    const userMsg = messages.find((m) => m.role === MessageRole.USER)
    expect(userMsg).toBeDefined()
    expect(userMsg!.content).toBe('Implement feature X')
  })
})

// ===========================================================================
// Test Suite 2: "sdk stream interruption" — Failure Path
// ===========================================================================

describe('sdk stream interruption', () => {
  it('session.error maps to correct internal ErrorCode', async () => {
    const { planId, taskRunId, correlationId } = seedPlan(1)
    const sessionId = 'error-session'

    const events: Array<{ type: string; properties?: Record<string, unknown> }> = [
      {
        type: 'session.error',
        properties: {
          sessionID: sessionId,
          error: {
            name: 'APIError',
            data: {
              message: 'Provider API returned 429 Too Many Requests',
              statusCode: 429,
              isRetryable: true
            }
          }
        }
      }
    ]

    const { client } = createMockClient(events)
    const facade = new TransactionFacade(db)
    const orchestrator = new OrchestratorService(db, facade)

    const result = await consumeEventStream(
      client,
      { taskRunId, planId, sessionId, correlationId },
      db,
      facade,
      orchestrator
    )

    expect(result.status).toBe('failed')
    expect(result.errorCode).toBe(ErrorCode.AI_RATE_LIMITED)
    expect(result.message).toContain('429')

    const run = db.select().from(taskRuns).where(eq(taskRuns.id, taskRunId)).get()!
    expect(run.status).toBe('failed')
    expect(run.error_code).toBe(ErrorCode.AI_RATE_LIMITED)
  })

  it('auth error maps to AI_API_ERROR code', async () => {
    const { planId, taskRunId, correlationId } = seedPlan(1)
    const sessionId = 'auth-error-session'

    const events: Array<{ type: string; properties?: Record<string, unknown> }> = [
      {
        type: 'session.error',
        properties: {
          sessionID: sessionId,
          error: {
            name: 'ProviderAuthError',
            data: {
              providerID: 'anthropic',
              message: 'Invalid API key'
            }
          }
        }
      }
    ]

    const { client } = createMockClient(events)
    const facade = new TransactionFacade(db)
    const orchestrator = new OrchestratorService(db, facade)

    const result = await consumeEventStream(
      client,
      { taskRunId, planId, sessionId, correlationId },
      db,
      facade,
      orchestrator
    )

    expect(result.status).toBe('failed')
    expect(result.errorCode).toBe(ErrorCode.AI_API_ERROR)
  })

  it('stream connection error maps to AI_API_ERROR', async () => {
    const { planId, taskRunId, correlationId } = seedPlan(1)
    const sessionId = 'conn-error-session'

    const { client } = createMockClient([], {
      streamError: new Error('ECONNREFUSED: connection refused to localhost:4096')
    })
    const facade = new TransactionFacade(db)
    const orchestrator = new OrchestratorService(db, facade)

    const result = await consumeEventStream(
      client,
      { taskRunId, planId, sessionId, correlationId },
      db,
      facade,
      orchestrator
    )

    expect(result.status).toBe('failed')
    expect(result.errorCode).toBe(ErrorCode.AI_API_ERROR)
    expect(result.message).toContain('ECONNREFUSED')

    const run = db.select().from(taskRuns).where(eq(taskRuns.id, taskRunId)).get()!
    expect(run.status).toBe('failed')
  })

  it('abort signal resolves run to TASK_TIMEOUT', async () => {
    const { planId, taskRunId, correlationId } = seedPlan(1)
    const sessionId = 'abort-session'

    // Events that never produce a terminal event
    const events: Array<{ type: string; properties?: Record<string, unknown> }> = [
      {
        type: 'message.updated',
        properties: {
          info: {
            id: 'msg-1',
            sessionID: sessionId,
            role: 'assistant',
            text: 'Working...',
            time: { created: Date.now() },
            parentID: 'p1',
            modelID: 'm1',
            providerID: 'p1',
            mode: 'default',
            path: { cwd: '/', root: '/' },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      },
      {
        type: 'message.updated',
        properties: {
          info: {
            id: 'msg-2',
            sessionID: sessionId,
            role: 'assistant',
            text: 'Still working...',
            time: { created: Date.now() },
            parentID: 'p1',
            modelID: 'm1',
            providerID: 'p1',
            mode: 'default',
            path: { cwd: '/', root: '/' },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      }
    ]

    const { client, abortController } = createMockClient(events, { delay: 10 })
    const facade = new TransactionFacade(db)
    const orchestrator = new OrchestratorService(db, facade)

    // Abort after first event
    setTimeout(() => abortController.abort(), 15)

    const result = await consumeEventStream(
      client,
      { taskRunId, planId, sessionId, correlationId },
      db,
      facade,
      orchestrator,
      abortController.signal
    )

    expect(result.status).toBe('failed')
    expect(result.errorCode).toBe(ErrorCode.TASK_TIMEOUT)
    expect(result.message).toContain('aborted')

    const run = db.select().from(taskRuns).where(eq(taskRuns.id, taskRunId)).get()!
    expect(run.status).toBe('failed')
    expect(run.error_code).toBe(ErrorCode.TASK_TIMEOUT)
  })

  it('output length error maps to AI_CONTEXT_TOO_LONG', async () => {
    const { planId, taskRunId, correlationId } = seedPlan(1)
    const sessionId = 'length-error-session'

    const events: Array<{ type: string; properties?: Record<string, unknown> }> = [
      {
        type: 'session.error',
        properties: {
          sessionID: sessionId,
          error: {
            name: 'MessageOutputLengthError',
            data: {}
          }
        }
      }
    ]

    const { client } = createMockClient(events)
    const facade = new TransactionFacade(db)
    const orchestrator = new OrchestratorService(db, facade)

    const result = await consumeEventStream(
      client,
      { taskRunId, planId, sessionId, correlationId },
      db,
      facade,
      orchestrator
    )

    expect(result.status).toBe('failed')
    expect(result.errorCode).toBe(ErrorCode.AI_CONTEXT_TOO_LONG)
  })

  it('already-completed run is idempotent on idle event', async () => {
    // Simulate a race where the run was completed externally (e.g. by orchestrator.stop)
    // before the idle event arrives
    const { planId, taskRunId, correlationId } = seedPlan(1)
    const sessionId = 'already-done-session'

    // Manually complete the run
    const facade = new TransactionFacade(db)
    const orchestrator = new OrchestratorService(db, facade)
    orchestrator.tick(planId, taskRunId, 'success')

    const events: Array<{ type: string; properties?: Record<string, unknown> }> = [
      {
        type: 'session.idle',
        properties: { sessionID: sessionId }
      }
    ]

    const { client } = createMockClient(events)

    // Should not throw even though run is already completed
    const result = await consumeEventStream(
      client,
      { taskRunId, planId, sessionId, correlationId },
      db,
      facade,
      orchestrator
    )

    expect(result.status).toBe('success')

    // Run should still be 'success', not modified
    const run = db.select().from(taskRuns).where(eq(taskRuns.id, taskRunId)).get()!
    expect(run.status).toBe('success')
  })
})

// ===========================================================================
// Test Suite 3: "sdk error mapping" — Error Code Classification
// ===========================================================================

describe('sdk error mapping', () => {
  it('maps ProviderAuthError to AI_API_ERROR', () => {
    const error = {
      name: 'ProviderAuthError',
      data: { providerID: 'anthropic', message: 'Invalid key' }
    }
    expect(mapSdkErrorToErrorCode(error)).toBe(ErrorCode.AI_API_ERROR)
  })

  it('maps 429 error to AI_RATE_LIMITED', () => {
    expect(mapSdkErrorToErrorCode(new Error('429 Too Many Requests'))).toBe(
      ErrorCode.AI_RATE_LIMITED
    )
  })

  it('maps OutputLength to AI_CONTEXT_TOO_LONG', () => {
    const error = {
      name: 'MessageOutputLengthError',
      data: {}
    }
    expect(mapSdkErrorToErrorCode(error)).toBe(ErrorCode.AI_CONTEXT_TOO_LONG)
  })

  it('maps abort to TASK_TIMEOUT', () => {
    expect(mapSdkErrorToErrorCode(new Error('abort'))).toBe(ErrorCode.TASK_TIMEOUT)
  })

  it('maps network error to AI_API_ERROR', () => {
    expect(mapSdkErrorToErrorCode(new Error('ECONNREFUSED'))).toBe(ErrorCode.AI_API_ERROR)
    expect(mapSdkErrorToErrorCode(new Error('fetch failed'))).toBe(ErrorCode.AI_API_ERROR)
  })

  it('maps unknown error to UNKNOWN', () => {
    expect(mapSdkErrorToErrorCode(new Error('something unexpected'))).toBe(ErrorCode.UNKNOWN)
    expect(mapSdkErrorToErrorCode(null)).toBe(ErrorCode.UNKNOWN)
    expect(mapSdkErrorToErrorCode(undefined)).toBe(ErrorCode.UNKNOWN)
  })

  it('maps 403 to AI_API_ERROR', () => {
    expect(mapSdkErrorToErrorCode(new Error('403 Forbidden'))).toBe(ErrorCode.AI_API_ERROR)
  })
})

// ===========================================================================
// Test Suite 4: "sdk client holder" — Client Lifecycle
// ===========================================================================

describe('sdk client holder', () => {
  it('connect sets connected flag', async () => {
    const holder = new OpenCodeClientHolder()
    expect(holder.connected).toBe(false)

    await holder.connect({ baseUrl: 'http://localhost:4096' })
    expect(holder.connected).toBe(true)

    holder.disconnect()
    expect(holder.connected).toBe(false)
  })

  it('disconnect is safe when not connected', () => {
    const holder = new OpenCodeClientHolder()
    expect(() => holder.disconnect()).not.toThrow()
  })

  it('client getter throws when not connected', () => {
    const holder = new OpenCodeClientHolder()
    expect(() => holder.client).toThrow('not connected')
  })

  it('double connect is idempotent', async () => {
    const holder = new OpenCodeClientHolder()
    await holder.connect({ baseUrl: 'http://localhost:4096' })
    await holder.connect({ baseUrl: 'http://localhost:4096' })
    expect(holder.connected).toBe(true)
    holder.disconnect()
  })
})
