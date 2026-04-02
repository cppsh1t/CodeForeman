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
import { schemas, isKnownChannel } from '@shared/ipc'
import type { IpcResult, IpcError, IpcChannel } from '@shared/ipc'
import type { IpcHandlerRegistry } from './registry'

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
  const message = error instanceof Error ? error.message : String(error)
  return {
    ok: false,
    error: ipcError(ErrorCode.UNKNOWN, `Handler error: ${message}`)
  }
}

// ── Stub Handlers ──
//
// V1 stubs return placeholder data. Each stub matches the output schema
// so the dispatcher's output validation passes.
// Downstream tasks (5-9) replace these with real service calls.

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
  const handlers = createStubHandlers()

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
      // Should never happen if ALL_CHANNELS and schemas are in sync
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
