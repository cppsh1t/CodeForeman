// ── IPC Handler Registry ──
//
// Maps channel names to handler functions. Each handler receives validated input
// and returns output data. The dispatcher (dispatcher.ts) wraps each handler
// with schema validation before/after the call.
//
// V1 handlers are stubs — they return placeholder responses.
// Downstream tasks (5-9) will replace stubs with real service calls.

import type { IpcChannel } from '@shared/ipc/channels'
import type { IpcInputMap, IpcOutputMap } from '@shared/ipc/schemas'

export type IpcHandler<K extends IpcChannel> = (input: IpcInputMap[K]) => Promise<IpcOutputMap[K]>

/** Registry type: maps each channel to its handler function. */
export type IpcHandlerRegistry = {
  [K in IpcChannel]: IpcHandler<K>
}
