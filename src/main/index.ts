import { app, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { setupIpc } from './ipc'
import { initDatabase, migrateDatabase, closeDatabase, getDatabase } from './db'
import { RecoveryService } from '@main/services/recovery'

// Domain contracts — single source of truth (Task 1)
export {
  ProjectStatus,
  PlanStatus,
  TaskStatus,
  TaskRunStatus,
  ErrorCode,
  MessageRole,
  TriggerType,
  ThinkDecisionType,
  MaterialType,
  MaterialSource,
  isCorrelationId,
  generateCorrelationId
} from '@shared/types'
export type {
  Project,
  Plan,
  Task,
  TaskRun,
  RunMessage,
  ThinkDecision,
  PlanMaterial,
  CorrelationId,
  BaseEntity,
  Timestamp
} from '@shared/types'

// ---------------------------------------------------------------------------
// Security boundary constants (Task 3)
// All origins the main window is allowed to load. Used by navigation guards.
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  // electron-vite dev server — dynamically resolved
  ...(is.dev && process.env['ELECTRON_RENDERER_URL']
    ? [new URL(process.env['ELECTRON_RENDERER_URL']).origin]
    : []),
  // Production: app:// protocol (electron-vite default)
  'app://-'
])

function isAllowedOrigin(origin: string): boolean {
  try {
    return ALLOWED_ORIGINS.has(new URL(origin).origin)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Navigation & window hardening — applied to ALL web-contents globally
// Electron security checklist items #13, #14, webview hardening
// ---------------------------------------------------------------------------
function setupSecurityHandlers(): void {
  app.on('web-contents-created', (_event, contents) => {
    // #13 — Block unauthorized navigation (user-initiated + server redirects)
    contents.on('will-navigate', (event, url) => {
      if (!isAllowedOrigin(url)) {
        console.warn(`[security] Blocked navigation to: ${url}`)
        event.preventDefault()
      }
    })
    contents.on('will-redirect', (event, url) => {
      if (!isAllowedOrigin(url)) {
        console.warn(`[security] Blocked redirect to: ${url}`)
        event.preventDefault()
      }
    })

    // #14 — Block all pop-up windows (use deny; never delegate to external shell)
    contents.setWindowOpenHandler((details) => {
      console.warn(`[security] Blocked window open: ${details.url}`)
      return { action: 'deny' }
    })

    // Block <webview> injection — no webviews needed in this app
    contents.on('will-attach-webview', (event) => {
      event.preventDefault()
      console.warn('[security] Blocked <webview> attach')
    })
  })
}

// ---------------------------------------------------------------------------
// Content Security Policy — applied via session headers (preferred approach)
// ---------------------------------------------------------------------------
function setupCSP(): void {
  const csp =
    "default-src 'self';" +
    " script-src 'self';" +
    " style-src 'self' 'unsafe-inline';" +
    " img-src 'self' data:;" +
    " font-src 'self';" +
    " connect-src 'self';" +
    " frame-src 'none';" +
    " object-src 'none';"

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })
}

function createWindow(): void {
  // Create the browser window.
  // Security hardening (Task 3): explicit secure webPreferences baseline.
  // See: Electron security checklist items #3 (contextIsolation), #4 (sandbox)
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Security baseline — explicitly set all three (defaults are true since
      // Electron 12/20, but explicit values serve as documentation & defense
      // in case someone later adds an override without checking defaults).
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app
  .whenReady()
  .then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // Database — initialize at Electron userData path and apply pending migrations (Task 5)
    const userDataPath = app.getPath('userData')
    const dbPath = join(userDataPath, 'codeforeman.db')
    migrateDatabase(dbPath)
    initDatabase(dbPath)

    // Startup recovery — reconcile orphaned running states (Task 9)
    try {
      const db = getDatabase()
      const recoveryService = new RecoveryService(db)
      const recoveryResult = recoveryService.sweep()
      if (recoveryResult.plansRecovered > 0) {
        console.info(
          `[startup] Recovery: ${recoveryResult.plansRecovered} plans, ` +
            `${recoveryResult.runsReconciled} runs, ${recoveryResult.tasksReset} tasks`
        )
      }
    } catch (err) {
      console.error(
        '[startup] Recovery sweep failed:',
        err instanceof Error ? err.message : String(err)
      )
      // Non-fatal: app should still start even if recovery fails
    }

    // IPC — typed channel dispatcher with validation (Task 4)
    setupIpc()

    // Legacy ping removed — use window.api.ping() via typed preload wrapper

    // Apply security handlers before creating windows
    setupSecurityHandlers()
    setupCSP()

    createWindow()

    app.on('activate', function () {
      // On macOS it's common to re-create a window when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error) => {
    console.error('[main] App startup failed:', error)
    app.quit()
  })

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
