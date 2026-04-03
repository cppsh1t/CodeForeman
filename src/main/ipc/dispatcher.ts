// ── IPC Dispatcher ──
//
// Single entry point for all IPC communication. Registers one `ipcMain.handle`
// that dispatches to the appropriate handler based on channel name.
//
// Validation flow:
// 1. Validate channel is known → reject with IPC_CHANNEL_ERROR if unknown
// 2. Validate input against zod schema → reject with INVALID_INPUT if malformed
// 3. Call handler with validated input
// 4. Validate handler output against zod schema → reject with UNKNOWN if malformed
// 5. Return { ok: true, data } on success
//
// Unknown channels and invalid payloads are rejected deterministically with
// standardized IpcError responses using the shared ErrorCode contract.

import { ipcMain } from 'electron'
import { ZodError } from 'zod'
import { ErrorCode } from '@shared/types'
import { generateCorrelationId } from '@shared/types'
import { schemas, isKnownChannel } from '@shared/ipc'
import type { IpcResult, IpcError, IpcChannel } from '@shared/ipc'
import type { IpcHandlerRegistry } from './registry'
import { getDatabase } from '@main/db/client'
import {
  TransactionFacade,
  ProjectRepository,
  PlanRepository,
  PlanMaterialRepository,
  TaskRepository,
  TaskRunRepository,
  RunMessageRepository
} from '@main/repositories'
import { OrchestratorService, OrchestratorTransitionError } from '@main/services/orchestrator'
import { ExecutionManager } from '@main/services/execution-manager'
import { OpenCodeSessionService } from '@main/services/opencode-session'
import { OpenCodeClientHolder } from '@main/services/opencode-client'

// ── Error Helpers ──

function ipcError(errorCode: ErrorCode, message: string, details?: IpcError['details']): IpcError {
  return { error_code: errorCode, message, details }
}

function channelNotFoundError(channel: string): IpcResult {
  return {
    ok: false,
    error: ipcError(ErrorCode.IPC_CHANNEL_ERROR, `Unknown IPC channel: ${channel}`, [
      { path: 'channel', message: `Channel "${channel}" is not registered` }
    ])
  }
}

function inputValidationError(issues: ZodError['issues']): IpcResult {
  return {
    ok: false,
    error: ipcError(
      ErrorCode.INVALID_INPUT,
      'Input validation failed',
      issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message
      }))
    )
  }
}

function outputValidationError(issues: ZodError['issues']): IpcResult {
  return {
    ok: false,
    error: ipcError(
      ErrorCode.UNKNOWN,
      'Internal error: handler returned invalid output',
      issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message
      }))
    )
  }
}

function handlerError(error: unknown): IpcResult {
  if (error instanceof OrchestratorTransitionError) {
    return {
      ok: false,
      error: ipcError(error.errorCode, error.message)
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return {
    ok: false,
    error: ipcError(ErrorCode.UNKNOWN, `Handler error: ${message}`)
  }
}

// ── Real Handlers ──
//
// All handlers backed by repositories. Execution control handlers also
// trigger the auto-progression loop via ExecutionManager.

export function createRealHandlers(
  db: ReturnType<typeof getDatabase>,
  facade: TransactionFacade,
  orchestrator: OrchestratorService,
  executionManager: ExecutionManager
): IpcHandlerRegistry {
  const projectRepo = new ProjectRepository(db)
  const planRepo = new PlanRepository(db)
  const materialRepo = new PlanMaterialRepository(db)
  const taskRepo = new TaskRepository(db)
  const taskRunRepo = new TaskRunRepository(db)

  const handlers: Partial<IpcHandlerRegistry> = {}

  // ── Project ──

  handlers['project:create'] = async (input) => {
    const now = new Date().toISOString()
    const row = projectRepo.insert({
      name: input.name,
      description: input.description ?? '',
      status: 'active',
      created_at: now,
      updated_at: now
    })
    return { id: row.id }
  }

  handlers['project:list'] = async (input) => {
    const result = projectRepo.listByStatus(
      { page: input.page ?? 1, page_size: input.page_size ?? 20 },
      undefined
    )
    return {
      items: result.items.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status as 'active' | 'archived',
        created_at: p.created_at,
        updated_at: p.updated_at
      })),
      total: result.total,
      page: result.page,
      page_size: result.page_size
    }
  }

  handlers['project:get'] = async (input) => {
    const row = projectRepo.findById(input.id)
    if (!row) throw new Error(`Project not found: id=${input.id}`)
    const p = row as Record<string, unknown>
    return {
      id: p.id as number,
      name: p.name as string,
      description: p.description as string,
      status: p.status as 'active' | 'archived',
      created_at: p.created_at as string,
      updated_at: p.updated_at as string
    }
  }

  handlers['project:update'] = async (input) => {
    const now = new Date().toISOString()
    const row = projectRepo.updateProject(input.id, {
      name: input.name,
      description: input.description,
      updated_at: now
    })
    if (!row) throw new Error(`Project not found: id=${input.id}`)
    return { id: row.id }
  }

  handlers['project:archive'] = async (input) => {
    const now = new Date().toISOString()
    const row = projectRepo.archive(input.id, now)
    if (!row) throw new Error(`Project not found: id=${input.id}`)
    return { id: row.id }
  }

  // ── Plan ──

  handlers['plan:create'] = async (input) => {
    const now = new Date().toISOString()
    const row = planRepo.insert({
      project_id: input.project_id,
      name: input.name,
      description: input.description ?? '',
      status: 'draft',
      created_at: now,
      updated_at: now
    })
    return { id: row.id }
  }

  handlers['plan:list'] = async (input) => {
    const result = planRepo.listByProject(input.project_id, {
      page: input.page ?? 1,
      page_size: input.page_size ?? 20
    })
    return {
      items: result.items.map((p) => ({
        id: p.id,
        project_id: p.project_id,
        name: p.name,
        description: p.description,
        status: p.status as
          | 'draft'
          | 'ready'
          | 'running'
          | 'paused'
          | 'completed'
          | 'blocked'
          | 'stopped',
        created_at: p.created_at,
        updated_at: p.updated_at
      })),
      total: result.total,
      page: result.page,
      page_size: result.page_size
    }
  }

  handlers['plan:get'] = async (input) => {
    const row = planRepo.findById(input.id)
    if (!row) throw new Error(`Plan not found: id=${input.id}`)
    const p = row as Record<string, unknown>
    return {
      id: p.id as number,
      project_id: p.project_id as number,
      name: p.name as string,
      description: p.description as string,
      status: p.status as
        | 'draft'
        | 'ready'
        | 'running'
        | 'paused'
        | 'completed'
        | 'blocked'
        | 'stopped',
      created_at: p.created_at as string,
      updated_at: p.updated_at as string
    }
  }

  handlers['plan:update'] = async (input) => {
    const now = new Date().toISOString()
    const row = planRepo.updatePlan(input.id, {
      name: input.name,
      description: input.description,
      updated_at: now
    })
    if (!row) throw new Error(`Plan not found: id=${input.id}`)
    return { id: row.id }
  }

  handlers['plan:setReady'] = async (input) => {
    const now = new Date().toISOString()
    const row = planRepo.setReady(input.id, now)
    if (!row) throw new Error(`Plan not found: id=${input.id}`)
    return { id: row.id }
  }

  // ── Material ──

  handlers['material:create'] = async (input) => {
    const now = new Date().toISOString()
    const row = materialRepo.insert({
      plan_id: input.plan_id,
      type: input.type,
      source: input.source ?? 'manual',
      content: input.content,
      created_at: now,
      updated_at: now
    })
    return { id: row.id }
  }

  handlers['material:list'] = async (input) => {
    const rows = materialRepo.findByPlanId(input.plan_id)
    return rows.map((m) => ({
      id: m.id,
      plan_id: m.plan_id,
      type: m.type as 'requirements' | 'prototype' | 'api_spec' | 'note',
      source: m.source as 'manual' | 'import',
      content: m.content,
      created_at: m.created_at,
      updated_at: m.updated_at
    }))
  }

  handlers['material:delete'] = async (input) => {
    const row = materialRepo.deleteMaterial(input.id)
    if (!row) throw new Error(`Material not found: id=${input.id}`)
    return { id: row.id }
  }

  // ── Task ──

  handlers['task:create'] = async (input) => {
    const now = new Date().toISOString()
    const ids = input.tasks.map((t) => {
      const row = taskRepo.insert({
        plan_id: input.plan_id,
        name: t.name,
        description: t.description ?? '',
        status: 'pending',
        order_index: t.order_index,
        created_at: now,
        updated_at: now
      })
      return row.id
    })
    return { ids }
  }

  handlers['task:list'] = async (input) => {
    const rows = taskRepo.findByPlanId(input.plan_id)
    return rows.map((t) => ({
      id: t.id,
      plan_id: t.plan_id,
      name: t.name,
      description: t.description,
      status: t.status as 'pending' | 'running' | 'success' | 'failed' | 'blocked' | 'skipped',
      order_index: t.order_index,
      created_at: t.created_at,
      updated_at: t.updated_at
    }))
  }

  handlers['task:get'] = async (input) => {
    const row = taskRepo.findById(input.id)
    if (!row) throw new Error(`Task not found: id=${input.id}`)
    const t = row as Record<string, unknown>
    return {
      id: t.id as number,
      plan_id: t.plan_id as number,
      name: t.name as string,
      description: t.description as string,
      status: t.status as 'pending' | 'running' | 'success' | 'failed' | 'blocked' | 'skipped',
      order_index: t.order_index as number,
      created_at: t.created_at as string,
      updated_at: t.updated_at as string
    }
  }

  handlers['task:update'] = async (input) => {
    const now = new Date().toISOString()
    const row = taskRepo.updateTask(input.id, {
      name: input.name,
      description: input.description,
      status: input.status,
      updated_at: now
    })
    if (!row) throw new Error(`Task not found: id=${input.id}`)
    return { id: row.id }
  }

  // ── Execution Control (with auto-progression) ──

  handlers['execution:start'] = async (input) => {
    const result = orchestrator.start(input.plan_id)
    executionManager.startExecution(input.plan_id).catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[ipc] Auto-progression error for plan ${input.plan_id}: ${message}`)
      // Error is logged; the renderer will see the failed task run status on next poll
    })
    return result
  }

  handlers['execution:pause'] = async (input) => {
    executionManager.abortExecution(input.plan_id)
    return orchestrator.pause(input.plan_id)
  }

  handlers['execution:resume'] = async (input) => {
    const result = orchestrator.resume(input.plan_id)
    executionManager.startExecution(input.plan_id).catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[ipc] Auto-progression error for plan ${input.plan_id}: ${message}`)
      // Error is logged; the renderer will see the failed task run status on next poll
    })
    return result
  }

  handlers['execution:stop'] = async (input) => {
    executionManager.abortExecution(input.plan_id)
    return orchestrator.stop(input.plan_id)
  }

  // ── TaskRun ──

  handlers['taskRun:get'] = async (input) => {
    const row = taskRunRepo.findById(input.id)
    if (!row) throw new Error(`TaskRun not found: id=${input.id}`)
    const tr = row as Record<string, unknown>
    return {
      id: tr.id as number,
      task_id: tr.task_id as number,
      status: tr.status as 'running' | 'success' | 'failed' | 'cancelled',
      error_code: (tr.error_code ?? null) as ErrorCode | null,
      started_at: tr.started_at as string | null,
      finished_at: tr.finished_at as string | null,
      created_at: tr.created_at as string,
      updated_at: tr.updated_at as string
    }
  }

  handlers['taskRun:list'] = async (input) => {
    const rows = taskRunRepo.listByPlanId(input.plan_id)
    return rows.map((tr) => ({
      id: tr.id,
      task_id: tr.task_id,
      status: tr.status as 'running' | 'success' | 'failed' | 'cancelled',
      error_code: (tr.error_code ?? null) as ErrorCode | null,
      started_at: tr.started_at as string | null,
      finished_at: tr.finished_at as string | null,
      created_at: tr.created_at,
      updated_at: tr.updated_at
    }))
  }

  // ── Think ──

  handlers['think:submit'] = async (input) => {
    const corrId = generateCorrelationId()
    const decisionRow = facade.submitThinkDecision(input.task_run_id, {
      correlation_id: corrId,
      trigger_type: input.trigger_type,
      decision: input.decision,
      reason: input.reason
    })
    facade.persistRunMessages(input.task_run_id, [
      {
        correlation_id: corrId,
        role: 'system',
        content: `[Think Decision] ${input.decision} (trigger: ${input.trigger_type}) — ${input.reason}`
      }
    ])
    return { id: decisionRow.id }
  }

  // ── Message ──

  handlers['message:list'] = async (input) => {
    const msgRepo = new RunMessageRepository(db)
    const result = msgRepo.listByTaskRunId(input.task_run_id, {
      page: input.page ?? 1,
      page_size: input.page_size ?? 20
    })
    return {
      items: result.items.map((m) => ({
        id: m.id,
        task_run_id: m.task_run_id,
        correlation_id: m.correlation_id,
        role: m.role as 'system' | 'assistant' | 'opencode' | 'user',
        content: m.content,
        created_at: m.created_at,
        updated_at: m.updated_at
      })),
      total: result.total,
      page: result.page,
      page_size: result.page_size
    }
  }

  return handlers as IpcHandlerRegistry
}

// ── Stub Handlers (for testing) ──
//
// Schema-compatible stubs that return placeholder data matching output schemas.
// Used by integration tests that validate IPC schema shapes without DB dependencies.

export function createStubHandlers(): IpcHandlerRegistry {
  const now = new Date().toISOString()
  const handlers: Partial<IpcHandlerRegistry> = {}

  // Project stubs

  handlers['project:create'] = async (_input) => ({ id: 1 })
  handlers['project:list'] = async (input) => ({
    items: [],
    total: 0,
    page: input.page ?? 1,
    page_size: input.page_size ?? 20
  })
  handlers['project:get'] = async (input) => ({
    id: input.id,
    name: 'Stub Project',
    description: '',
    status: 'active' as const,
    created_at: now,
    updated_at: now
  })
  handlers['project:update'] = async (input) => ({ id: input.id })
  handlers['project:archive'] = async (input) => ({ id: input.id })

  // Plan stubs
  handlers['plan:create'] = async (_input) => ({ id: 1 })
  handlers['plan:list'] = async (input) => ({
    items: [],
    total: 0,
    page: input.page ?? 1,
    page_size: input.page_size ?? 20
  })
  handlers['plan:get'] = async (input) => ({
    id: input.id,
    project_id: 1,
    name: 'Stub Plan',
    description: '',
    status: 'draft' as const,
    created_at: now,
    updated_at: now
  })
  handlers['plan:update'] = async (input) => ({ id: input.id })
  handlers['plan:setReady'] = async (input) => ({ id: input.id })

  // Material stubs
  handlers['material:create'] = async (_input) => ({ id: 1 })
  handlers['material:list'] = async (_input) => []
  handlers['material:delete'] = async (input) => ({ id: input.id })

  // Task stubs
  handlers['task:create'] = async (input) => ({
    ids: input.tasks.map((_, i) => i + 1)
  })
  handlers['task:list'] = async (_input) => []
  handlers['task:get'] = async (input) => ({
    id: input.id,
    plan_id: 1,
    name: 'Stub Task',
    description: '',
    status: 'pending' as const,
    order_index: 0,
    created_at: now,
    updated_at: now
  })
  handlers['task:update'] = async (input) => ({ id: input.id })

  // Execution control stubs
  handlers['execution:start'] = async (input) => ({ plan_id: input.plan_id })
  handlers['execution:pause'] = async (input) => ({ plan_id: input.plan_id })
  handlers['execution:resume'] = async (input) => ({ plan_id: input.plan_id })
  handlers['execution:stop'] = async (input) => ({ plan_id: input.plan_id })

  // TaskRun stubs
  handlers['taskRun:get'] = async (input) => ({
    id: input.id,
    task_id: 1,
    status: 'running' as const,
    error_code: null,
    started_at: now,
    finished_at: null,
    created_at: now,
    updated_at: now
  })
  handlers['taskRun:list'] = async (_input) => []

  // Think stubs
  handlers['think:submit'] = async (_input) => ({ id: 1 })

  // Message stubs
  handlers['message:list'] = async (input) => ({
    items: [],
    total: 0,
    page: input.page ?? 1,
    page_size: input.page_size ?? 20
  })

  return handlers as IpcHandlerRegistry
}

// ── Dispatcher Setup ──

/**
 * Register the IPC dispatcher on the main process.
 * Call once during app initialization (after `app.whenReady()`).
 *
 * The dispatcher handles ALL IPC via a single `ipcMain.handle('ipc', ...)`.
 * Unknown channels are rejected deterministically.
 * Invalid payloads are rejected with standardized error_code responses.
 */
export function setupIpcDispatcher(): void {
  const db = getDatabase()
  const facade = new TransactionFacade(db)
  const orchestrator = new OrchestratorService(db, facade)
  const clientHolder = new OpenCodeClientHolder()
  const sessionService = new OpenCodeSessionService(db, facade, orchestrator)
  const executionManager = new ExecutionManager(db, sessionService, clientHolder)

  const handlers = createRealHandlers(db, facade, orchestrator, executionManager)

  ipcMain.handle('ipc', async (_event, rawPayload: unknown): Promise<IpcResult> => {
    // --- Step 0: Validate payload shape ---
    if (
      rawPayload === null ||
      typeof rawPayload !== 'object' ||
      !('channel' in rawPayload) ||
      typeof (rawPayload as { channel: unknown }).channel !== 'string'
    ) {
      return {
        ok: false,
        error: ipcError(
          ErrorCode.INVALID_INPUT,
          'Payload must be { channel: string, input?: unknown }'
        )
      }
    }

    const { channel, input } = rawPayload as { channel: string; input?: unknown }

    // --- Step 1: Validate channel is known ---
    if (!isKnownChannel(channel)) {
      return channelNotFoundError(channel)
    }

    const channelDef = schemas[channel as IpcChannel]
    if (!channelDef) {
      return channelNotFoundError(channel)
    }

    // --- Step 2: Validate input schema ---
    const parsedInput = channelDef.input.safeParse(input)
    if (!parsedInput.success) {
      return inputValidationError(parsedInput.error.issues)
    }

    // --- Step 3: Call handler ---
    const handler = handlers[channel as IpcChannel]
    if (!handler) {
      return {
        ok: false,
        error: ipcError(
          ErrorCode.IPC_CHANNEL_ERROR,
          `No handler registered for channel: ${channel}`
        )
      }
    }

    try {
      const result = await (handler as (input: unknown) => Promise<unknown>)(parsedInput.data)

      // --- Step 4: Validate output schema ---
      const parsedOutput = channelDef.output.safeParse(result)
      if (!parsedOutput.success) {
        console.error(`[ipc] Output validation failed for ${channel}:`, parsedOutput.error.issues)
        return outputValidationError(parsedOutput.error.issues)
      }

      // --- Step 5: Success ---
      return { ok: true, data: parsedOutput.data }
    } catch (error) {
      console.error(`[ipc] Handler error for ${channel}:`, error)
      return handlerError(error)
    }
  })
}
