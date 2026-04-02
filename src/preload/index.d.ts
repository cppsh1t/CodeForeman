// Preload type declarations — types derived from shared IPC contract (single source of truth).
// No hand-written payload shapes: all input/output types come from IpcInputMap / IpcOutputMap.
// No legacy untyped channels: all calls must go through the typed dispatcher.

import type { ErrorCode } from '@shared/types'
import type { IpcResult as SharedIpcResult, IpcInputMap, IpcOutputMap } from '@shared/ipc'

// ---------------------------------------------------------------------------
// Secure preload type declarations (Task 3)
// ---------------------------------------------------------------------------

/** Safe, read-only Electron metadata exposed to renderer. No raw IPC. */
interface ElectronAPI {
  process: {
    readonly platform: string
    readonly versions: {
      readonly [key: string]: string | undefined
    }
  }
}

// Re-export the shared IpcResult type locally for convenience
type IpcResult<T = unknown> = SharedIpcResult<T>

/** Application IPC bridge — narrow whitelist pattern (no raw event objects).
 *  Input/output types are derived from the shared IpcInputMap / IpcOutputMap. */
interface AppAPI {
  // Project
  projectCreate(
    input: IpcInputMap['project:create']
  ): Promise<IpcResult<IpcOutputMap['project:create']>>
  projectList(input: IpcInputMap['project:list']): Promise<IpcResult<IpcOutputMap['project:list']>>
  projectGet(input: IpcInputMap['project:get']): Promise<IpcResult<IpcOutputMap['project:get']>>
  projectUpdate(
    input: IpcInputMap['project:update']
  ): Promise<IpcResult<IpcOutputMap['project:update']>>
  projectArchive(
    input: IpcInputMap['project:archive']
  ): Promise<IpcResult<IpcOutputMap['project:archive']>>

  // Plan
  planCreate(input: IpcInputMap['plan:create']): Promise<IpcResult<IpcOutputMap['plan:create']>>
  planList(input: IpcInputMap['plan:list']): Promise<IpcResult<IpcOutputMap['plan:list']>>
  planGet(input: IpcInputMap['plan:get']): Promise<IpcResult<IpcOutputMap['plan:get']>>
  planUpdate(input: IpcInputMap['plan:update']): Promise<IpcResult<IpcOutputMap['plan:update']>>
  planSetReady(
    input: IpcInputMap['plan:setReady']
  ): Promise<IpcResult<IpcOutputMap['plan:setReady']>>

  // Material
  materialCreate(
    input: IpcInputMap['material:create']
  ): Promise<IpcResult<IpcOutputMap['material:create']>>
  materialList(
    input: IpcInputMap['material:list']
  ): Promise<IpcResult<IpcOutputMap['material:list']>>
  materialDelete(
    input: IpcInputMap['material:delete']
  ): Promise<IpcResult<IpcOutputMap['material:delete']>>

  // Task
  taskCreate(input: IpcInputMap['task:create']): Promise<IpcResult<IpcOutputMap['task:create']>>
  taskList(input: IpcInputMap['task:list']): Promise<IpcResult<IpcOutputMap['task:list']>>
  taskGet(input: IpcInputMap['task:get']): Promise<IpcResult<IpcOutputMap['task:get']>>
  taskUpdate(input: IpcInputMap['task:update']): Promise<IpcResult<IpcOutputMap['task:update']>>

  // Execution control
  executionStart(
    input: IpcInputMap['execution:start']
  ): Promise<IpcResult<IpcOutputMap['execution:start']>>
  executionPause(
    input: IpcInputMap['execution:pause']
  ): Promise<IpcResult<IpcOutputMap['execution:pause']>>
  executionResume(
    input: IpcInputMap['execution:resume']
  ): Promise<IpcResult<IpcOutputMap['execution:resume']>>
  executionStop(
    input: IpcInputMap['execution:stop']
  ): Promise<IpcResult<IpcOutputMap['execution:stop']>>

  // TaskRun
  taskRunGet(input: IpcInputMap['taskRun:get']): Promise<IpcResult<IpcOutputMap['taskRun:get']>>
  taskRunList(input: IpcInputMap['taskRun:list']): Promise<IpcResult<IpcOutputMap['taskRun:list']>>

  // Think
  thinkSubmit(input: IpcInputMap['think:submit']): Promise<IpcResult<IpcOutputMap['think:submit']>>

  // Message
  messageList(input: IpcInputMap['message:list']): Promise<IpcResult<IpcOutputMap['message:list']>>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppAPI
  }
}

// Re-export to prove consumability — preload d.ts is included in tsconfig.web.json
export type { ErrorCode }
