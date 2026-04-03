// ── Compile-time domain status guard tests ──
//
// These @ts-expect-error directives verify that invalid status/error
// assignments are rejected by TypeScript. If a status union is accidentally
// widened (e.g. changed to `string`), these assertions will FAIL at typecheck
// because the "expected error" will not occur, causing @ts-expect-error to
// complain about an unused directive.
//
// Run via: pnpm typecheck

import { ProjectStatus, type Project } from '../types/project'
import { PlanStatus } from '../types/plan'
import { TaskStatus } from '../types/task'
import { TaskRunStatus, ErrorCode, type TaskRun } from '../types/task-run'
import { MessageRole } from '../types/run-message'
import { TriggerType, ThinkDecisionType } from '../types/think-decision'
import { MaterialType, MaterialSource } from '../types/plan-material'
import { isCorrelationId, generateCorrelationId } from '../types/correlation'

// ── Helper: forces TS to check the argument type without unused-variable issues ──
function _expect<T>(_value: T): void {
  // Intentionally empty — this is a compile-time type assertion helper
}

// ── Status literal rejection guards ──

// @ts-expect-error -- 'deleted' is not a valid ProjectStatus
_expect<ProjectStatus>('deleted')

// @ts-expect-error -- 'DELETED' key does not exist on ProjectStatus const
_expect<ProjectStatus>(ProjectStatus.DELETED)

// @ts-expect-error -- 'executing' is not a valid PlanStatus
_expect<PlanStatus>('executing')

// @ts-expect-error -- 'ABORTED' key does not exist on PlanStatus const
_expect<PlanStatus>(PlanStatus.ABORTED)

// @ts-expect-error -- 'in_progress' is not a valid TaskStatus (should be 'running')
_expect<TaskStatus>('in_progress')

// @ts-expect-error -- 'pending' is not a valid TaskRunStatus
_expect<TaskRunStatus>('pending')

// @ts-expect-error -- 'TIMEOUT' key does not exist on TaskRunStatus
_expect<TaskRunStatus>(TaskRunStatus.TIMEOUT)

// @ts-expect-error -- 'NETWORK_ERROR' is not a valid ErrorCode
_expect<ErrorCode>('NETWORK_ERROR')

// @ts-expect-error -- 'FORBIDDEN' key does not exist on ErrorCode
_expect<ErrorCode>(ErrorCode.FORBIDDEN)

// @ts-expect-error -- 'llm' is not a valid MessageRole
_expect<MessageRole>('llm')

// @ts-expect-error -- 'timeout' is not a valid TriggerType
_expect<TriggerType>('timeout')

// @ts-expect-error -- 'skip' is not a valid ThinkDecisionType
_expect<ThinkDecisionType>('skip')

// @ts-expect-error -- 'design' is not a valid MaterialType
_expect<MaterialType>('design')

// @ts-expect-error -- 'clipboard' is not a valid MaterialSource
_expect<MaterialSource>('clipboard')

// ── Entity type field strictness (status field rejects invalid values) ──

/* eslint-disable @typescript-eslint/no-explicit-any */
_expect<Project>({
  id: 1 as any,
  name: 'Test',
  description: '',
  // @ts-expect-error -- status must be ProjectStatus, not 'deleted'
  status: 'deleted',
  created_at: '',
  updated_at: ''
})

_expect<TaskRun>({
  id: 1 as any,
  task_id: 1 as any,
  status: TaskRunStatus.RUNNING,
  correlation_id: generateCorrelationId(),
  // @ts-expect-error -- error_code must be ErrorCode | null
  error_code: 'oops',
  started_at: null,
  finished_at: null,
  created_at: '',
  updated_at: ''
})
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── CorrelationId runtime guard verification ──

// Valid UUID v4 → true
if (!isCorrelationId('550e8400-e29b-41d4-a716-446655440000')) throw new Error('guard failed')

// Invalid formats → false
if (isCorrelationId('not-a-uuid')) throw new Error('guard should reject')
if (isCorrelationId('')) throw new Error('guard should reject')

// Generate produces valid CorrelationId
const corr = generateCorrelationId()
if (!isCorrelationId(corr)) throw new Error('generated correlation is invalid')
