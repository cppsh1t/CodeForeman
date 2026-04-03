// ── OpenCode SDK Client Adapter ──
//
// Wraps the @opencode-ai/sdk to provide a testable, injectable client.
// Supports two connection strategies:
//   1. createOpencode() — starts an embedded server + client (full mode).
//   2. createOpencodeClient() — connects to an already-running server (client-only).
//
// The adapter exposes a narrow interface so tests can swap in a mock without
// pulling in the real SDK.

import type { OpencodeClient } from '@opencode-ai/sdk'

// ── Error mapping ──

import { ErrorCode } from '@shared/types/task-run'

/**
 * Map SDK/transport error patterns to internal ErrorCode values.
 * Centralised so every call-site gets consistent error classification.
 */
export function mapSdkErrorToErrorCode(error: unknown): ErrorCode {
  if (error == null) return ErrorCode.UNKNOWN

  // Extract both the string message and any structured .name/.data properties
  const message = error instanceof Error ? error.message : String(error)
  const obj = typeof error === 'object' ? (error as Record<string, unknown>) : null
  const errorName = obj?.name ? String(obj.name) : ''
  // Nested data.message for SDK error shapes like { name: 'APIError', data: { message: '...' } }
  const dataMsg = obj?.data
    ? typeof obj.data === 'object' && obj.data !== null
      ? String((obj.data as Record<string, unknown>).message ?? '')
      : ''
    : ''

  // Combined text for pattern matching
  const combined = `${errorName} ${message} ${dataMsg}`

  // Auth errors (401/403) mapped to AI_API_ERROR
  if (
    combined.includes('401') ||
    combined.includes('403') ||
    combined.includes('auth') ||
    combined.includes('expired') ||
    errorName === 'ProviderAuthError'
  )
    return ErrorCode.AI_API_ERROR

  // Rate limiting
  if (combined.includes('429') || errorName === 'RateLimitError') return ErrorCode.AI_RATE_LIMITED

  // Context too long
  if (
    errorName === 'MessageOutputLengthError' ||
    combined.includes('context too long') ||
    combined.includes('token limit')
  )
    return ErrorCode.AI_CONTEXT_TOO_LONG

  // Abort / cancellation
  if (errorName === 'MessageAbortedError' || combined.includes('abort'))
    return ErrorCode.TASK_TIMEOUT

  // Network / server errors
  if (
    combined.includes('ECONNREFUSED') ||
    combined.includes('ENOTFOUND') ||
    combined.includes('fetch') ||
    combined.includes('network')
  )
    return ErrorCode.AI_API_ERROR

  // Fallback
  return ErrorCode.UNKNOWN
}

// ── Client holder ──

/**
 * Thin wrapper that holds an OpencodeClient instance.
 * Provides a connect/disconnect lifecycle and a getter for the raw client.
 *
 * Usage:
 *   const holder = new OpenCodeClientHolder()
 *   await holder.connect({ baseUrl: 'http://localhost:4096' })
 *   // use holder.client.session.create(...)
 *   holder.disconnect()
 */
export class OpenCodeClientHolder {
  private _client: OpencodeClient | null = null
  private _closeServer: (() => void) | null = null

  /** Whether the client is currently connected. */
  get connected(): boolean {
    return this._client !== null
  }

  /** Access the underlying SDK client. Throws if not connected. */
  get client(): OpencodeClient {
    if (!this._client) {
      throw new OpenCodeClientError(ErrorCode.AI_API_ERROR, 'OpenCode client is not connected')
    }
    return this._client
  }

  /**
   * Connect to an already-running OpenCode server.
   */
  async connect(options: { baseUrl: string; directory?: string }): Promise<void> {
    if (this._client) {
      return // idempotent
    }

    try {
      const { createOpencodeClient } = await import('@opencode-ai/sdk')
      this._client = createOpencodeClient({
        baseUrl: options.baseUrl,
        directory: options.directory
      })
    } catch (err) {
      throw new OpenCodeClientError(
        mapSdkErrorToErrorCode(err),
        `Failed to connect to OpenCode server at ${options.baseUrl}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Start an embedded OpenCode server and return the client.
   * For future use when we need to manage the server lifecycle.
   */
  async startEmbedded(options: Record<string, unknown> = {}): Promise<OpencodeClient> {
    if (this._client) {
      return this._client
    }

    try {
      const { createOpencode } = await import('@opencode-ai/sdk')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await createOpencode(options as any)
      this._client = result.client
      this._closeServer = () => result.server.close()
      return this._client
    } catch (err) {
      throw new OpenCodeClientError(
        mapSdkErrorToErrorCode(err),
        `Failed to start embedded OpenCode server: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Disconnect from the OpenCode server.
   * If an embedded server was started, it will be closed.
   */
  disconnect(): void {
    if (this._closeServer) {
      this._closeServer()
      this._closeServer = null
    }
    this._client = null
  }
}

// ── Custom error ──

export class OpenCodeClientError extends Error {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'OpenCodeClientError'
  }
}
