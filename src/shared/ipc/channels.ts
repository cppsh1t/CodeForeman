// ── IPC Channel Constants ──
//
// Single source of truth for all IPC channel names.
// The renderer NEVER constructs channel strings — it calls typed preload wrappers.
// Unknown channels are rejected deterministically by the dispatcher.

// ---------------------------------------------------------------------------
// Project channels
// ---------------------------------------------------------------------------
export const PROJECT_CREATE = 'project:create'
export const PROJECT_LIST = 'project:list'
export const PROJECT_GET = 'project:get'
export const PROJECT_UPDATE = 'project:update'
export const PROJECT_ARCHIVE = 'project:archive'

// ---------------------------------------------------------------------------
// Plan channels
// ---------------------------------------------------------------------------
export const PLAN_CREATE = 'plan:create'
export const PLAN_LIST = 'plan:list'
export const PLAN_GET = 'plan:get'
export const PLAN_UPDATE = 'plan:update'
export const PLAN_SET_READY = 'plan:setReady'

// ---------------------------------------------------------------------------
// PlanMaterial channels
// ---------------------------------------------------------------------------
export const MATERIAL_CREATE = 'material:create'
export const MATERIAL_LIST = 'material:list'
export const MATERIAL_DELETE = 'material:delete'

// ---------------------------------------------------------------------------
// Task channels
// ---------------------------------------------------------------------------
export const TASK_CREATE = 'task:create'
export const TASK_LIST = 'task:list'
export const TASK_GET = 'task:get'
export const TASK_UPDATE = 'task:update'

// ---------------------------------------------------------------------------
// Execution control channels
// ---------------------------------------------------------------------------
export const EXECUTION_START = 'execution:start'
export const EXECUTION_PAUSE = 'execution:pause'
export const EXECUTION_RESUME = 'execution:resume'
export const EXECUTION_STOP = 'execution:stop'

// ---------------------------------------------------------------------------
// TaskRun channels
// ---------------------------------------------------------------------------
export const TASK_RUN_GET = 'taskRun:get'
export const TASK_RUN_LIST = 'taskRun:list'

// ---------------------------------------------------------------------------
// ThinkDecision channels
// ---------------------------------------------------------------------------
export const THINK_SUBMIT = 'think:submit'

// ---------------------------------------------------------------------------
// RunMessage channels
// ---------------------------------------------------------------------------
export const MESSAGE_LIST = 'message:list'

// ---------------------------------------------------------------------------
// Aggregate: all valid channel names
// ---------------------------------------------------------------------------
export const ALL_CHANNELS = [
  // Project
  PROJECT_CREATE,
  PROJECT_LIST,
  PROJECT_GET,
  PROJECT_UPDATE,
  PROJECT_ARCHIVE,
  // Plan
  PLAN_CREATE,
  PLAN_LIST,
  PLAN_GET,
  PLAN_UPDATE,
  PLAN_SET_READY,
  // Material
  MATERIAL_CREATE,
  MATERIAL_LIST,
  MATERIAL_DELETE,
  // Task
  TASK_CREATE,
  TASK_LIST,
  TASK_GET,
  TASK_UPDATE,
  // Execution
  EXECUTION_START,
  EXECUTION_PAUSE,
  EXECUTION_RESUME,
  EXECUTION_STOP,
  // TaskRun
  TASK_RUN_GET,
  TASK_RUN_LIST,
  // Think
  THINK_SUBMIT,
  // Message
  MESSAGE_LIST
] as const

export type IpcChannel = (typeof ALL_CHANNELS)[number]

/** Runtime guard: check if a string is a known IPC channel. */
export function isKnownChannel(channel: string): channel is IpcChannel {
  return (ALL_CHANNELS as readonly string[]).includes(channel)
}
