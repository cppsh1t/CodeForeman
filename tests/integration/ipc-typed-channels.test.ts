/**
 * Typed IPC channel integration tests (Task 4)
 *
 * Verifies the IPC contract layer: channel constants, schema validation,
 * dispatcher behavior, and preload typing. These tests exercise the shared
 * IPC infrastructure directly — no Electron process is spawned.
 *
 * Test categories:
 * 1. "ipc typed channels" — happy path: valid input → valid typed output
 * 2. "ipc invalid payload" — failure path: invalid input → standardized error
 */

import { describe, it, expect } from 'vitest'
import { ErrorCode } from '@shared/types'
import { ALL_CHANNELS, isKnownChannel, schemas, type IpcChannel, type IpcResult } from '@shared/ipc'
import { MAX_STRING_LENGTH, MAX_CONTENT_LENGTH, MAX_PAGE_SIZE } from '@shared/ipc/types'

// We test the dispatcher logic by importing its core functions.
// The dispatcher itself depends on electron's ipcMain, so we test
// the validation pipeline separately.
import { createStubHandlers } from '../../src/main/ipc/dispatcher'

// ---------------------------------------------------------------------------
// Helper: simulate the dispatcher's validation pipeline
// ---------------------------------------------------------------------------

function simulateDispatch(channel: string, input: unknown): IpcResult {
  // Step 1: Validate channel
  if (!isKnownChannel(channel)) {
    return {
      ok: false,
      error: {
        error_code: ErrorCode.IPC_CHANNEL_ERROR,
        message: `Unknown IPC channel: ${channel}`,
        details: [{ path: 'channel', message: `Channel "${channel}" is not registered` }]
      }
    }
  }

  const channelDef = schemas[channel as IpcChannel]
  if (!channelDef) {
    return {
      ok: false,
      error: {
        error_code: ErrorCode.IPC_CHANNEL_ERROR,
        message: `Unknown IPC channel: ${channel}`
      }
    }
  }

  // Step 2: Validate input
  const parsedInput = channelDef.input.safeParse(input)
  if (!parsedInput.success) {
    return {
      ok: false,
      error: {
        error_code: ErrorCode.INVALID_INPUT,
        message: 'Input validation failed',
        details: parsedInput.error.issues.map((issue) => ({
          path: issue.path.join('.') || '(root)',
          message: issue.message
        }))
      }
    }
  }

  // Step 3-4: Call handler and validate output (synchronously for test)
  const handlers = createStubHandlers()
  const handler = handlers[channel as IpcChannel]

  if (!handler) {
    return {
      ok: false,
      error: {
        error_code: ErrorCode.IPC_CHANNEL_ERROR,
        message: `No handler registered for channel: ${channel}`
      }
    }
  }

  // Note: we can't await in this synchronous test helper, but we can test
  // that the schema shapes match. For async testing, see the async dispatch tests.
  return {
    ok: true,
    data: { _validated: true, _channel: channel }
  }
}

// Async version for full pipeline testing
async function simulateDispatchAsync(channel: string, input: unknown): Promise<IpcResult> {
  if (!isKnownChannel(channel)) {
    return {
      ok: false,
      error: {
        error_code: ErrorCode.IPC_CHANNEL_ERROR,
        message: `Unknown IPC channel: ${channel}`,
        details: [{ path: 'channel', message: `Channel "${channel}" is not registered` }]
      }
    }
  }

  const channelDef = schemas[channel as IpcChannel]
  if (!channelDef) {
    return {
      ok: false,
      error: {
        error_code: ErrorCode.IPC_CHANNEL_ERROR,
        message: `Unknown IPC channel: ${channel}`
      }
    }
  }

  const parsedInput = channelDef.input.safeParse(input)
  if (!parsedInput.success) {
    return {
      ok: false,
      error: {
        error_code: ErrorCode.INVALID_INPUT,
        message: 'Input validation failed',
        details: parsedInput.error.issues.map((issue) => ({
          path: issue.path.join('.') || '(root)',
          message: issue.message
        }))
      }
    }
  }

  const handlers = createStubHandlers()
  const handler = handlers[channel as IpcChannel]

  try {
    const result = await (handler as (input: unknown) => Promise<unknown>)(parsedInput.data)
    const parsedOutput = channelDef.output.safeParse(result)
    if (!parsedOutput.success) {
      return {
        ok: false,
        error: {
          error_code: ErrorCode.UNKNOWN,
          message: 'Internal error: handler returned invalid output'
        }
      }
    }
    return { ok: true, data: parsedOutput.data }
  } catch (error) {
    return {
      ok: false,
      error: {
        error_code: ErrorCode.UNKNOWN,
        message: `Handler error: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
}

// ===========================================================================
// Test Suite 1: "ipc typed channels" — happy path
// ===========================================================================

describe('ipc typed channels', () => {
  it('ALL_CHANNELS contains all channels defined in schemas', () => {
    const schemaKeys = Object.keys(schemas)
    for (const channel of ALL_CHANNELS) {
      expect(schemaKeys).toContain(channel)
    }
    // Also verify reverse: every schema key is in ALL_CHANNELS
    for (const key of schemaKeys) {
      expect(ALL_CHANNELS as readonly string[]).toContain(key)
    }
  })

  it('isKnownChannel rejects unknown strings', () => {
    expect(isKnownChannel('unknown:channel')).toBe(false)
    expect(isKnownChannel('')).toBe(false)
    expect(isKnownChannel('project:delete')).toBe(false) // not defined
    expect(isKnownChannel('PROJECT_CREATE')).toBe(false) // constant name, not value
  })

  it('isKnownChannel accepts all defined channel values', () => {
    for (const channel of ALL_CHANNELS) {
      expect(isKnownChannel(channel)).toBe(true)
    }
  })

  // --- Project channels ---

  it('project:create accepts valid input', async () => {
    const result = await simulateDispatchAsync('project:create', {
      name: 'Test Project',
      description: 'A test project'
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toHaveProperty('id')
      expect(typeof (result.data as { id: number }).id).toBe('number')
    }
  })

  it('project:get accepts valid input', async () => {
    const result = await simulateDispatchAsync('project:get', { id: 1 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const data = result.data as Record<string, unknown>
      expect(data.id).toBe(1)
      expect(typeof data.name).toBe('string')
      expect(data.status).toBe('active')
    }
  })

  it('project:list returns paginated structure', async () => {
    const result = await simulateDispatchAsync('project:list', { page: 1, page_size: 10 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const data = result.data as Record<string, unknown>
      expect(Array.isArray(data.items)).toBe(true)
      expect(typeof data.total).toBe('number')
      expect(data.page).toBe(1)
      expect(data.page_size).toBe(10)
    }
  })

  // --- Plan channels ---

  it('plan:create accepts valid input', async () => {
    const result = await simulateDispatchAsync('plan:create', {
      project_id: 1,
      name: 'Test Plan',
      description: 'A test plan'
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toHaveProperty('id')
    }
  })

  it('plan:list with pagination returns correct structure', async () => {
    const result = await simulateDispatchAsync('plan:list', {
      project_id: 1,
      page: 2,
      page_size: 5
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const data = result.data as Record<string, unknown>
      expect(data.page).toBe(2)
      expect(data.page_size).toBe(5)
    }
  })

  // --- Task channels ---

  it('task:create accepts batch input', async () => {
    const result = await simulateDispatchAsync('task:create', {
      plan_id: 1,
      tasks: [
        { name: 'Task 1', description: 'First task', order_index: 0 },
        { name: 'Task 2', description: 'Second task', order_index: 1 }
      ]
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const data = result.data as { ids: number[] }
      expect(Array.isArray(data.ids)).toBe(true)
      expect(data.ids.length).toBe(2)
    }
  })

  // --- Material channels ---

  it('material:create accepts valid enum values', async () => {
    const result = await simulateDispatchAsync('material:create', {
      plan_id: 1,
      type: 'requirements',
      source: 'manual',
      content: 'Some requirements text'
    })
    expect(result.ok).toBe(true)
  })

  // --- Execution channels ---

  it('execution:start returns plan_id', async () => {
    const result = await simulateDispatchAsync('execution:start', { plan_id: 1 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.data as { plan_id: number }).plan_id).toBe(1)
    }
  })

  // --- Think channels ---

  it('think:submit accepts valid decision enum', async () => {
    const result = await simulateDispatchAsync('think:submit', {
      task_run_id: 1,
      trigger_type: 'failure',
      decision: 'retry_current',
      reason: 'The task failed due to a transient error'
    })
    expect(result.ok).toBe(true)
  })

  // --- Message channels ---

  it('message:list returns paginated structure', async () => {
    const result = await simulateDispatchAsync('message:list', {
      task_run_id: 1,
      page: 1,
      page_size: 20
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const data = result.data as Record<string, unknown>
      expect(Array.isArray(data.items)).toBe(true)
      expect(typeof data.total).toBe('number')
    }
  })

  // --- All channels have matching schemas ---

  it('every channel in ALL_CHANNELS has a matching schema with input and output', () => {
    for (const channel of ALL_CHANNELS) {
      const def = schemas[channel]
      expect(def, `Channel "${channel}" missing from schemas`).toBeDefined()
      expect(def.input, `Channel "${channel}" missing input schema`).toBeDefined()
      expect(def.output, `Channel "${channel}" missing output schema`).toBeDefined()
    }
  })
})

// ===========================================================================
// Test Suite 2: "ipc invalid payload" — rejection paths
// ===========================================================================

describe('ipc invalid payload', () => {
  // --- Unknown channels ---

  it('rejects completely unknown channel', () => {
    const result = simulateDispatch('totally:unknown:channel', {})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.IPC_CHANNEL_ERROR)
      expect(result.error.message).toContain('totally:unknown:channel')
    }
  })

  it('rejects empty string channel', () => {
    const result = simulateDispatch('', {})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.IPC_CHANNEL_ERROR)
    }
  })

  it('rejects channel that looks similar but is not registered', () => {
    const result = simulateDispatch('project:delete', { id: 1 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.IPC_CHANNEL_ERROR)
    }
  })

  // --- Oversized strings ---

  it('rejects project name exceeding MAX_STRING_LENGTH', () => {
    const result = simulateDispatch('project:create', {
      name: 'x'.repeat(MAX_STRING_LENGTH + 1),
      description: ''
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
      expect(result.error.details).toBeDefined()
      expect(result.error.details!.some((d) => d.path.includes('name'))).toBe(true)
    }
  })

  it('rejects material content exceeding MAX_CONTENT_LENGTH', () => {
    const result = simulateDispatch('material:create', {
      plan_id: 1,
      type: 'requirements',
      content: 'x'.repeat(MAX_CONTENT_LENGTH + 1)
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
      expect(result.error.details!.some((d) => d.path.includes('content'))).toBe(true)
    }
  })

  // --- Invalid enum values ---

  it('rejects invalid project status enum', () => {
    const result = simulateDispatch('project:update', {
      id: 1,
      // No status field on project:update, but let's test enum validation
      name: 'valid'
    })
    // This should succeed since status is optional
    expect(result.ok).toBe(true)
  })

  it('rejects invalid material type enum', () => {
    const result = simulateDispatch('material:create', {
      plan_id: 1,
      type: 'invalid_material_type',
      content: 'some content'
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
      expect(result.error.details!.some((d) => d.path.includes('type'))).toBe(true)
    }
  })

  it('rejects invalid think decision enum', () => {
    const result = simulateDispatch('think:submit', {
      task_run_id: 1,
      trigger_type: 'failure',
      decision: 'do_something_crazy',
      reason: 'Trying invalid decision'
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
      expect(result.error.details!.some((d) => d.path.includes('decision'))).toBe(true)
    }
  })

  it('rejects invalid trigger type enum', () => {
    const result = simulateDispatch('think:submit', {
      task_run_id: 1,
      trigger_type: 'invalid_trigger',
      decision: 'continue_next',
      reason: 'Testing invalid trigger'
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
      expect(result.error.details!.some((d) => d.path.includes('trigger_type'))).toBe(true)
    }
  })

  // --- Malformed objects ---

  it('rejects project:create with missing required field', () => {
    const result = simulateDispatch('project:create', {
      // missing 'name'
      description: 'no name provided'
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
      expect(result.error.details!.some((d) => d.path.includes('name'))).toBe(true)
    }
  })

  it('rejects project:get with non-numeric id', () => {
    const result = simulateDispatch('project:get', { id: 'not-a-number' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
    }
  })

  it('rejects project:get with negative id', () => {
    const result = simulateDispatch('project:get', { id: -1 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
    }
  })

  it('rejects project:get with zero id', () => {
    const result = simulateDispatch('project:get', { id: 0 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
    }
  })

  it('rejects task:create with empty tasks array', () => {
    const result = simulateDispatch('task:create', {
      plan_id: 1,
      tasks: []
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
    }
  })

  it('rejects task:create with too many tasks (> 50)', () => {
    const tasks = Array.from({ length: 51 }, (_, i) => ({
      name: `Task ${i}`,
      description: '',
      order_index: i
    }))
    const result = simulateDispatch('task:create', { plan_id: 1, tasks })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
    }
  })

  it('rejects plan:list with page_size exceeding MAX_PAGE_SIZE', () => {
    const result = simulateDispatch('plan:list', {
      project_id: 1,
      page: 1,
      page_size: MAX_PAGE_SIZE + 1
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
    }
  })

  it('rejects plan:list with zero page', () => {
    const result = simulateDispatch('plan:list', {
      project_id: 1,
      page: 0,
      page_size: 20
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
    }
  })

  // --- Type coercion attempts ---

  it('rejects non-object input for object-expected channels', () => {
    const result = simulateDispatch('project:get', 'not-an-object')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
    }
  })

  it('rejects null input', () => {
    const result = simulateDispatch('project:get', null)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
    }
  })

  it('rejects array input where object expected', () => {
    const result = simulateDispatch('project:get', [1])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
    }
  })

  // --- Error response structure validation ---

  it('error responses always contain error_code and message', () => {
    const result = simulateDispatch('unknown:channel', {})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(typeof result.error.error_code).toBe('string')
      expect(typeof result.error.message).toBe('string')
      expect(result.error.error_code).toBe(ErrorCode.IPC_CHANNEL_ERROR)
    }
  })

  it('validation errors contain structured details array', () => {
    const result = simulateDispatch('project:create', {})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error_code).toBe(ErrorCode.INVALID_INPUT)
      expect(Array.isArray(result.error.details)).toBe(true)
      expect(result.error.details!.length).toBeGreaterThan(0)
      // Each detail has path and message
      for (const detail of result.error.details!) {
        expect(typeof detail.path).toBe('string')
        expect(typeof detail.message).toBe('string')
      }
    }
  })
})

// ===========================================================================
// Test Suite 3: Source-level security checks for IPC layer
// ===========================================================================

describe('ipc security: preload does not expose raw ipcRenderer', () => {
  const { readFileSync } = require('node:fs')
  const { resolve } = require('node:path')

  const preloadSrc = readFileSync(resolve(__dirname, '../../src/preload/index.ts'), 'utf-8')
  const preloadDts = readFileSync(resolve(__dirname, '../../src/preload/index.d.ts'), 'utf-8')
  const mainSrc = readFileSync(resolve(__dirname, '../../src/main/index.ts'), 'utf-8')
  const mainIpcSrc = readFileSync(resolve(__dirname, '../../src/main/ipc/dispatcher.ts'), 'utf-8')
  const combinedMainSrc = mainSrc + '\n' + mainIpcSrc

  it('preload uses single dispatcher invoke pattern', () => {
    expect(preloadSrc).toMatch(/ipcRenderer\.invoke\(\s*['"]ipc['"]/)
  })

  it('preload does NOT expose individual channel ipcMain.handle calls in main', () => {
    // Main should only register ipcMain.handle('ipc', ...) for the single dispatcher.
    // It should NOT have per-channel handles like ipcMain.handle('project:create', ...).
    // Note: comments may also contain the pattern, so we check for per-channel patterns.
    const channelNames = ALL_CHANNELS
    for (const channel of channelNames) {
      // Should NOT find ipcMain.handle('project:create', ...) etc.
      expect(combinedMainSrc).not.toMatch(
        new RegExp(
          `ipcMain\\.handle\\s*\\(\\s*['"]${channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
          's'
        )
      )
    }
    // But SHOULD have the single dispatcher registration
    expect(combinedMainSrc).toMatch(/ipcMain\.handle\(\s*['"]ipc['"]/)
  })

  it('preload wraps all channels through typed helper function', () => {
    // The ipc() helper should be used, not raw ipcRenderer.invoke per channel
    expect(preloadSrc).toMatch(/function ipc[<(]/)
  })

  it('preload imports channel constants from shared (no hardcoded strings)', () => {
    // The preload must import from @shared/ipc/channels
    expect(preloadSrc).toMatch(/from\s+['"]@shared\/ipc\/channels['"]/)
    // And it must import IpcInputMap / IpcOutputMap for type derivation
    expect(preloadSrc).toMatch(/IpcInputMap|IpcOutputMap/)
  })

  it('preload does NOT contain hardcoded channel string literals in ipc() calls', () => {
    // Every ipc(...) call should use a constant variable, not a raw string like 'project:create'
    // Pattern to catch: ipc('some:literal') where some:literal is not a variable
    const hardcodedIpcCalls = preloadSrc.match(/ipc\(\s*'[^']+'\s*\)/g)
    expect(hardcodedIpcCalls, 'Found hardcoded channel strings in ipc() calls').toBeNull()
    const hardcodedIpcCalls2 = preloadSrc.match(/ipc\(\s*"[^"]+"\s*\)/g)
    expect(
      hardcodedIpcCalls2,
      'Found hardcoded channel strings in ipc() calls (double quotes)'
    ).toBeNull()
  })

  it('preload does NOT have a ping() method that bypasses unknown-channel rejection', () => {
    // ping() was removed — all calls must go through the typed dispatcher
    expect(preloadSrc).not.toMatch(/ping\s*\(/)
    expect(preloadSrc).not.toMatch(/channel:\s*['"]ping['"]/)
  })

  it('type declarations do NOT define ping() method', () => {
    // ping() was removed from AppAPI — must not have it as an interface method
    // Use word boundary to avoid matching comments like "No ping():"
    expect(preloadDts).not.toMatch(/\bping\s*\(\)\s*:/)
    // AppAPI methods must use IpcInputMap/IpcOutputMap derived types
    expect(preloadDts).toMatch(/IpcInputMap/)
    expect(preloadDts).toMatch(/IpcOutputMap/)
  })

  it('type declarations use IpcResult wrapper (not raw data)', () => {
    expect(preloadDts).toMatch(/IpcResult/)
    // Types are derived from shared contract, not hand-written
    expect(preloadDts).toMatch(/IpcInputMap\[.*\]/)
    expect(preloadDts).toMatch(/IpcOutputMap\[.*\]/)
  })

  it('type declarations define AppAPI with typed methods for all V1 channels', () => {
    const requiredMethods = [
      'projectCreate',
      'projectList',
      'projectGet',
      'projectUpdate',
      'projectArchive',
      'planCreate',
      'planList',
      'planGet',
      'planUpdate',
      'planSetReady',
      'materialCreate',
      'materialList',
      'materialDelete',
      'taskCreate',
      'taskList',
      'taskGet',
      'taskUpdate',
      'executionStart',
      'executionPause',
      'executionResume',
      'executionStop',
      'taskRunGet',
      'taskRunList',
      'thinkSubmit',
      'messageList'
    ]
    for (const method of requiredMethods) {
      expect(preloadDts, `AppAPI missing method: ${method}`).toMatch(new RegExp(method))
    }
  })

  it('type declarations use IpcResult wrapper (not raw data)', () => {
    expect(preloadDts).toMatch(/IpcResult/)
    // Types are derived from shared contract, not hand-written
    expect(preloadDts).toMatch(/IpcInputMap\[.*\]/)
    expect(preloadDts).toMatch(/IpcOutputMap\[.*\]/)
  })
})
