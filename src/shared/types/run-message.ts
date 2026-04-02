import type { BaseEntity, MessageId, TaskRunId } from './common'
import type { CorrelationId } from './correlation'

// ── Message Role ──

export const MessageRole = {
  SYSTEM: 'system',
  ASSISTANT: 'assistant',
  OPENCODE: 'opencode',
  USER: 'user'
} as const

export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole]

// ── RunMessage Entity ──

export interface RunMessage extends BaseEntity {
  id: MessageId
  task_run_id: TaskRunId
  correlation_id: CorrelationId
  role: MessageRole
  content: string
}
