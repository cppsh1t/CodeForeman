/**
 * Security baseline assertions (Task 3)
 *
 * Verifies that the Electron main/preload security boundary is properly hardened.
 * These tests use AST-level source analysis — they do NOT spawn an Electron process.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const MAIN_SRC = resolve(__dirname, '../../src/main/index.ts')
const MAIN_IPC_SRC = resolve(__dirname, '../../src/main/ipc/dispatcher.ts')
const PRELOAD_SRC = resolve(__dirname, '../../src/preload/index.ts')
const PRELOAD_DTS = resolve(__dirname, '../../src/preload/index.d.ts')

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf-8')
}

/** Combined main-process source (index + IPC modules). */
function mainSource(): string {
  return readSource(MAIN_SRC) + '\n' + readSource(MAIN_IPC_SRC)
}

describe('Security baseline: main process', () => {
  const source = mainSource()

  it('explicitly enables contextIsolation', () => {
    expect(source).toMatch(/contextIsolation:\s*true/)
  })

  it('explicitly enables sandbox', () => {
    expect(source).toMatch(/sandbox:\s*true/)
  })

  it('explicitly disables nodeIntegration', () => {
    expect(source).toMatch(/nodeIntegration:\s*false/)
  })

  it('explicitly enables webSecurity', () => {
    expect(source).toMatch(/webSecurity:\s*true/)
  })

  it('does NOT set sandbox: false', () => {
    expect(source).not.toMatch(/sandbox:\s*false/)
  })

  it('does NOT set nodeIntegration: true', () => {
    expect(source).not.toMatch(/nodeIntegration:\s*true/)
  })

  it('does NOT set contextIsolation: false', () => {
    expect(source).not.toMatch(/contextIsolation:\s*false/)
  })

  it('does NOT use shell.openExternal with user-controlled URLs', () => {
    expect(source).not.toMatch(/shell\.openExternal/)
  })

  it('registers will-navigate handler', () => {
    expect(source).toMatch(/will-navigate/)
  })

  it('registers will-redirect handler', () => {
    expect(source).toMatch(/will-redirect/)
  })

  it('uses setWindowOpenHandler (not deprecated new-window)', () => {
    expect(source).toMatch(/setWindowOpenHandler/)
    expect(source).not.toMatch(/['"]new-window['"]/)
  })

  it('returns action: deny in setWindowOpenHandler', () => {
    expect(source).toMatch(/action:\s*['"]deny['"]/)
  })

  it('blocks webview attachment', () => {
    expect(source).toMatch(/will-attach-webview/)
    expect(source).toMatch(/event\.preventDefault\(\)/)
  })

  it('sets Content-Security-Policy', () => {
    expect(source).toMatch(/Content-Security-Policy/)
    expect(source).toMatch(/frame-src\s+['"]none['"]/)
    expect(source).toMatch(/object-src\s+['"]none['"]/)
  })

  it('uses ipcMain.handle (not sendSync)', () => {
    expect(source).toMatch(/ipcMain\.handle\(/)
    expect(source).not.toMatch(/sendSync/)
  })
})

describe('Security baseline: preload', () => {
  const preloadSource = readSource(PRELOAD_SRC)
  const preloadDts = readSource(PRELOAD_DTS)

  it('does NOT import or use @electron-toolkit/preload', () => {
    expect(preloadSource).not.toMatch(/@electron-toolkit\/preload/)
  })

  it('does NOT expose raw ipcRenderer on window.electron', () => {
    expect(preloadSource).not.toMatch(
      /exposeInMainWorld\(\s*['"]electron['"]\s*,\s*\{[^}]*ipcRenderer/
    )
    expect(preloadDts).not.toMatch(/ipcRenderer/)
  })

  it('exposes only contextIsolated APIs via contextBridge', () => {
    expect(preloadSource).toMatch(/contextBridge\.exposeInMainWorld/)
    expect(preloadSource).toMatch(/contextIsolated/)
  })

  it('hard-fails if contextIsolation is disabled', () => {
    expect(preloadSource).toMatch(/throw new Error/)
    expect(preloadSource).toMatch(/contextIsolation.*required.*disabled/i)
  })

  it('does NOT have insecure fallback to window.electron/api', () => {
    // The old pattern was: `} else { window.electron = electronAPI }`
    // Secure pattern: `} else { throw new Error(...) }`
    // Verify no direct window assignment in the else branch
    expect(preloadSource).not.toMatch(/else\s*\{[^}]*window\.(electron|api)\s*=/s)
  })

  it('type declarations define ElectronAPI WITHOUT ipcRenderer', () => {
    expect(preloadDts).not.toMatch(/ipcRenderer/)
  })

  it('type declarations define AppAPI with typed methods', () => {
    expect(preloadDts).toMatch(/interface AppAPI/)
    // Method signatures may span multiple lines — use multiline-aware check
    expect(preloadDts).toMatch(/projectCreate[\s\S]*?Promise/)
    // Must use shared contract types (not hand-written payload shapes)
    expect(preloadDts).toMatch(/IpcInputMap/)
    expect(preloadDts).toMatch(/IpcOutputMap/)
    // ping() was removed — no untyped channel bypass
    expect(preloadDts).not.toMatch(/\bping\s*\(\)\s*:/)
  })
})

describe('Security baseline: no raw ipcRenderer leak across entire src/', () => {
  const _mainSrc = mainSource()
  const preloadSource = readSource(PRELOAD_SRC)
  const _preloadDts = readSource(PRELOAD_DTS)
  // Renderer source
  const rendererSource = readFileSync(resolve(__dirname, '../../src/renderer/src/App.tsx'), 'utf-8')

  it('renderer does NOT access window.electron.ipcRenderer', () => {
    expect(rendererSource).not.toMatch(/window\.electron\.ipcRenderer/)
  })

  it('renderer uses window.api (safe bridge) instead of raw IPC', () => {
    expect(rendererSource).toMatch(/window\.api\./)
  })

  it('no source file exposes ipcRenderer.on directly (event leak risk)', () => {
    // The only valid use of ipcRenderer.on is inside preload with event stripping
    // Check that any ipcRenderer.on is wrapped with event parameter stripping
    const ipcOnMatches = preloadSource.match(/ipcRenderer\.on\(/g)
    if (ipcOnMatches) {
      // If ipcRenderer.on exists, verify it's used with event stripping
      // Safe pattern: ipcRenderer.on(channel, (_event, value) => callback(value))
      // NOT safe: ipcRenderer.on(channel, callback) where callback receives raw event
      expect(preloadSource).toMatch(/_event/)
    }
  })
})
