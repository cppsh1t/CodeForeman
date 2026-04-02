import { contextBridge, ipcRenderer } from 'electron'
import {
  PROJECT_CREATE,
  PROJECT_LIST,
  PROJECT_GET,
  PROJECT_UPDATE,
  PROJECT_ARCHIVE,
  PLAN_CREATE,
  PLAN_LIST,
  PLAN_GET,
  PLAN_UPDATE,
  PLAN_SET_READY,
  MATERIAL_CREATE,
  MATERIAL_LIST,
  MATERIAL_DELETE,
  TASK_CREATE,
  TASK_LIST,
  TASK_GET,
  TASK_UPDATE,
  EXECUTION_START,
  EXECUTION_PAUSE,
  EXECUTION_RESUME,
  EXECUTION_STOP,
  TASK_RUN_GET,
  TASK_RUN_LIST,
  THINK_SUBMIT,
  MESSAGE_LIST
} from '@shared/ipc/channels'
import type { IpcInputMap, IpcOutputMap } from '@shared/ipc/schemas'

// Secure preload: whitelist API only, no raw IPC bridge leak.
// Electron security checklist items #3, #4, #20
// See: .sisyphus/notepads/codeforeman-v1-autopilot/learnings.md (sections A, E, I)

// ---------------------------------------------------------------------------
// window.electron — safe, read-only Electron metadata (no raw IPC surface)
// ---------------------------------------------------------------------------
const electronAPI = {
  process: {
    get platform(): string {
      return process.platform
    },
    get versions(): ElectronVersions {
      return { ...process.versions }
    }
  }
}

// ---------------------------------------------------------------------------
// window.api — application IPC bridge (narrow pattern, learnings.md E1)
//
// All IPC goes through a single `ipcRenderer.invoke('ipc', { channel, input })`
// dispatcher. The renderer NEVER constructs channel strings — it calls these
// typed wrapper methods. Each method's input/output types are derived from the
// shared IpcInputMap / IpcOutputMap (single source of truth).
//
// Channel names come from centralized constants in @shared/ipc/channels.
// Unknown channels are rejected deterministically by the main dispatcher.
//
// Key rule: NEVER pass IpcRendererEvent to the renderer — strip it always.
// ---------------------------------------------------------------------------

type IpcResult<T = unknown> =
  | { ok: true; data: T }
  | {
      ok: false
      error: {
        error_code: string
        message: string
        details?: Array<{ path: string; message: string }>
      }
    }

/** Helper: create a typed IPC invoke wrapper. Channel must be a known constant. */
function ipc<K extends keyof IpcInputMap>(
  channel: K
): (input: IpcInputMap[K]) => Promise<IpcResult<IpcOutputMap[K]>> {
  return (input: IpcInputMap[K]) => ipcRenderer.invoke('ipc', { channel, input })
}

const api = {
  // Project
  projectCreate: ipc(PROJECT_CREATE),
  projectList: ipc(PROJECT_LIST),
  projectGet: ipc(PROJECT_GET),
  projectUpdate: ipc(PROJECT_UPDATE),
  projectArchive: ipc(PROJECT_ARCHIVE),

  // Plan
  planCreate: ipc(PLAN_CREATE),
  planList: ipc(PLAN_LIST),
  planGet: ipc(PLAN_GET),
  planUpdate: ipc(PLAN_UPDATE),
  planSetReady: ipc(PLAN_SET_READY),

  // Material
  materialCreate: ipc(MATERIAL_CREATE),
  materialList: ipc(MATERIAL_LIST),
  materialDelete: ipc(MATERIAL_DELETE),

  // Task
  taskCreate: ipc(TASK_CREATE),
  taskList: ipc(TASK_LIST),
  taskGet: ipc(TASK_GET),
  taskUpdate: ipc(TASK_UPDATE),

  // Execution control
  executionStart: ipc(EXECUTION_START),
  executionPause: ipc(EXECUTION_PAUSE),
  executionResume: ipc(EXECUTION_RESUME),
  executionStop: ipc(EXECUTION_STOP),

  // TaskRun
  taskRunGet: ipc(TASK_RUN_GET),
  taskRunList: ipc(TASK_RUN_LIST),

  // Think
  thinkSubmit: ipc(THINK_SUBMIT),

  // Message
  messageList: ipc(MESSAGE_LIST)
}

// ---------------------------------------------------------------------------
// contextBridge exposure — contextIsolation must always be enabled
// ---------------------------------------------------------------------------
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // Hard fail — running without context isolation is a security violation.
  // This should never happen with correct BrowserWindow webPreferences.
  throw new Error('contextIsolation is required but disabled. Check BrowserWindow webPreferences.')
}

// Type helper for versions (avoids leaking full process.versions shape)
interface ElectronVersions {
  readonly [key: string]: string | undefined
}
