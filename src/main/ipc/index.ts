// ── Main IPC Module ──
//
// Entry point for the main-process IPC layer.
// Call `setupIpc()` during app initialization to register the dispatcher.

export { setupIpcDispatcher as setupIpc } from './dispatcher'
export type { IpcHandlerRegistry, IpcHandler } from './registry'
