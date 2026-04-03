// ── Services Layer Barrel Export ──
//
// Single entry point for all main-process services.

export { OrchestratorService, OrchestratorTransitionError } from './orchestrator'
export {
  OpenCodeClientHolder,
  OpenCodeClientError,
  mapSdkErrorToErrorCode
} from './opencode-client'
export {
  OpenCodeSessionService,
  consumeEventStream,
  type RunExecutionContext,
  type RunResolution
} from './opencode-session'
export { RecoveryService, type RecoveryResult } from './recovery'
export {
  RetentionService,
  DEFAULT_MAX_MESSAGES,
  type RetentionConfig,
  type RetentionResult
} from './retention'
export { LogBatcher, type LogMessage, type LogBatcherConfig } from './log-batcher'
