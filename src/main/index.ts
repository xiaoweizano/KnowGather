import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, Menu, nativeImage, protocol, shell, Tray } from 'electron'
import { IPC_CHANNELS } from '../shared/api.js'
import { localDayKey } from '../shared/settings.js'
import { ActivityStore } from './activityStore.js'
import { AiConfigStore } from './aiConfigStore.js'
import { AttachmentStore } from './attachments.js'
import { AtomicDocumentRepository } from './documentRepository.js'
import { registerIpcHandlers } from './ipc.js'
import { setMainLocale, tm } from './locale.js'
import { SettingsStore } from './settingsStore.js'
import { createWindowOptions } from './windowConfig.js'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'shizhi-attachment',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let hasUnsavedChanges = false
let closeRequested = false
let servicesRegistered = false
let quitting = false
let settingsStore: SettingsStore | null = null
let activityStore: ActivityStore | null = null

const STARTED_SILENT = process.argv.includes('--silent')

async function createWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    return
  }

  registerApplicationServices()
  const settings = await settingsStore?.get()
  if (settings?.locale) setMainLocale(settings.locale)

  const appRoot = app.getAppPath()
  mainWindow = new BrowserWindow(createWindowOptions({ platform: process.platform, appRoot }))

  mainWindow.on('closed', () => {
    mainWindow = null
    hasUnsavedChanges = false
    closeRequested = false
  })

  mainWindow.on('close', (event) => {
    if (quitting) return
    const closeToTray = tray !== null && currentCloseToTray
    if (closeToTray && !hasUnsavedChanges) {
      event.preventDefault()
      mainWindow?.hide()
      return
    }
    if (!hasUnsavedChanges) return
    event.preventDefault()
    if (closeRequested) return
    closeRequested = true
    mainWindow?.webContents.send(IPC_CHANNELS.windowCloseRequested)
  })

  if (settings?.hideFromTaskbar) mainWindow.setSkipTaskbar(true)

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    await mainWindow.loadFile(join(appRoot, 'out/renderer/index.html'))
  }
  // Silent start keeps the window hidden but present, so the tray can restore it
  // instantly and saves continue to work.
  if (!STARTED_SILENT) {
    mainWindow.show()
  }
  if (settings?.minimizeToTray) bindMinimizeToTray(mainWindow)
}

let currentCloseToTray = false

function bindMinimizeToTray(window: BrowserWindow): void {
  // This Electron version exposes `minimize` without a cancellable event, so the
  // window minimises and is then hidden; the tray restores it identically.
  window.on('minimize', () => {
    if (!tray) return
    window.hide()
  })
}

function showWindow(): void {
  if (!mainWindow) {
    void createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray(): void {
  if (tray) return
  tray = new Tray(createTrayIcon())
  tray.setToolTip(tm('windowTitle'))
  rebuildTrayMenu()
  tray.on('click', () => showWindow())
}

function rebuildTrayMenu(): void {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: tm('trayShow'), click: () => showWindow() },
    { label: tm('traySettings'), click: () => { showWindow(); mainWindow?.webContents.send(IPC_CHANNELS.appNavigate, 'settings') } },
    { type: 'separator' },
    { label: tm('trayQuit'), click: () => { quitting = true; app.quit() } },
  ]))
}

/**
 * A generated 16px/32px icon avoids shipping a binary asset and keeps the
 * packaging config unchanged. Drawn as a small filled rounded square in the
 * brand colour so the tray entry is recognisable on both themes.
 */
function createTrayIcon(): Electron.NativeImage {
  const size = 16
  const buffer = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4
      const inside = x >= 2 && x < size - 2 && y >= 2 && y < size - 2
      buffer[index] = 111
      buffer[index + 1] = 92
      buffer[index + 2] = 232
      buffer[index + 3] = inside ? 255 : 0
    }
  }
  const image = nativeImage.createFromBuffer(buffer, { width: size, height: size })
  return image.resize({ width: 16, height: 16 })
}

function registerApplicationServices(): void {
  if (servicesRegistered) {
    return
  }
  servicesRegistered = true

  const userDataPath = app.getPath('userData')
  const repository = new AtomicDocumentRepository(userDataPath)
  const attachments = new AttachmentStore(join(userDataPath, 'attachments'))
  settingsStore = new SettingsStore(userDataPath)
  activityStore = new ActivityStore(userDataPath)
  const aiConfigStore = new AiConfigStore(userDataPath)
  protocol.handle('shizhi-attachment', async (request) => {
    const resolved = attachments.resolveUrl(request.url)
    if (!resolved) return new Response('Not found', { status: 404 })
    try {
      const data = await readFile(resolved.path)
      return new Response(data, {
        headers: {
          'Content-Type': resolved.mimeType,
          'Cache-Control': 'private, max-age=31536000, immutable',
        },
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
  registerIpcHandlers(ipcMain, repository, {
    attachments,
    settings: settingsStore,
    activity: activityStore,
    ai: aiConfigStore,
    setHasUnsavedChanges(value) {
      hasUnsavedChanges = value
      if (!value) {
        // A save failure leaves the guard on; reset the close request so the
        // user can still close the window intentionally afterwards.
        closeRequested = false
      }
      if (!value && closeRequested) {
        queueMicrotask(() => mainWindow?.close())
      }
    },
    setTaskbarVisible(visible) {
      mainWindow?.setSkipTaskbar(!visible)
    },
    onSettingsChanged(patch) {
      if (patch.locale) {
        setMainLocale(patch.locale)
        rebuildTrayMenu()
      }
      currentCloseToTray = patch.closeToTray ?? currentCloseToTray
    },
  })
}

/**
 * Applies settings that only the main process can enact. Called once at startup
 * and again whenever the renderer changes the relevant preferences.
 */
async function applyStartupSettings(): Promise<void> {
  const settings = await settingsStore?.get()
  if (!settings) return
  setMainLocale(settings.locale)
  currentCloseToTray = settings.closeToTray
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: settings.autoLaunch,
      args: settings.autoLaunch && settings.silentStart ? ['--silent'] : [],
    })
  }
  if (settings.closeToTray || settings.minimizeToTray) createTray()
  if (settings.autoCheckUpdates && settings.updateFeedUrl) {
    // Fire and forget: a failed check must never block startup.
    void import('./updateService.js').then(({ checkForUpdates }) =>
      checkForUpdates({ feedUrl: settings.updateFeedUrl, currentVersion: app.getVersion() }),
    ).catch(() => undefined)
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showWindow()
  })

  app.whenReady().then(async () => {
    await createWindow()
    await applyStartupSettings()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow()
      } else {
        showWindow()
      }
    })
  })
}

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  // With a tray the app stays resident; otherwise behave like a normal desktop app.
  if (tray && !quitting) return
  if (process.platform !== 'darwin') app.quit()
})

// Keep the export surface tiny but explicit for tests that import the module.
export { localDayKey }
