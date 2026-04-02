// ── Shared IPC Barrel ──
//
// Single entry point for all IPC contracts, channels, schemas, and types.
// Importable from main / preload / renderer.

export * from './types'
export * from './channels'
export { schemas } from './schemas'
export type { IpcInputMap, IpcOutputMap } from './schemas'
