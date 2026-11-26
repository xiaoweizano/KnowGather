import { existsSync, readFileSync } from 'node:fs'
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
import { createWindowOptions, shouldDropApplicationMenu } from './windowConfig.js'

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
  mainWindow = new BrowserWindow(createWindowOptions({
    platform: process.platform,
    appRoot,
    iconPath: iconAsset('icon.ico'),
  }))
  if (shouldDropApplicationMenu(process.platform, process.env.VITE_DEV_SERVER_URL)) {
    mainWindow.setMenuBarVisibility(false)
    mainWindow.removeMenu()
  }

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
 * Absolute path of a bundled icon asset, or undefined when it is missing.
 *
 * Icons ship outside the asar archive (`build.asarUnpack`), because
 * `nativeImage` and `BrowserWindow.icon` cannot read an `.ico` from inside it.
 * The packed app path therefore has to be rewritten to the unpacked directory;
 * a source checkout already has the plain path and resolves first.
 */
function iconAsset(name: 'icon.png' | 'icon.ico' | 'tray-16.png' | 'tray-32.png'): string | undefined {
  const appRoot = app.getAppPath()
  const unpacked = appRoot.replace(/app\.asar$/, 'app.asar.unpacked')
  for (const candidate of [join(unpacked, 'build', name), join(appRoot, 'build', name)]) {
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      // Try the next location: the icon is cosmetic.
    }
  }
  return undefined
}

/**
 * The tray icon.
 *
 * Three sources, best first:
 *
 * 1. `tray-16.png` — the vector silhouette, drawn for exactly this size. The
 *    full artwork has four cards and an orbit that survive down to 32px but
 *    read as a smear at 16.
 * 2. A frame parsed out of `icon.ico`. `nativeImage.createFromPath` cannot
 *    decode an `.ico` that was packed into `app.asar`, which is why the tray
 *    fell back to the drawn square before the icons shipped unpacked.
 * 3. A generated square, for a checkout with no built icons.
 */
function createTrayIcon(): Electron.NativeImage {
  const trayPath = iconAsset('tray-16.png')
  if (trayPath) {
    const image = nativeImage.createFromPath(trayPath)
    if (!image.isEmpty()) return image
  }
  const icoPath = iconAsset('icon.ico')
  if (icoPath) {
    try {
      const frame = trayFrame(icoPath)
      if (frame) {
        const image = nativeImage.createFromBuffer(frame)
        if (!image.isEmpty()) return image
      }
    } catch {
      // Fall through to the drawn placeholder.
    }
  }
  return fallbackTrayIcon()
}

/**
 * Picks the frame best suited to a 16–32px tray out of a PNG-compressed .ico.
 *
 * Preferred over `createFromPath` because the 256px frame it returns has to be
 * downscaled by the shell, and the intermediate 48px frame is mostly ring.
 * @returns the PNG payload, or null when the file holds no usable frame.
 */
function trayFrame(icoPath: string): Buffer | null {
  const ico = readFileSync(icoPath)
  if (ico.length < 6 || ico.readUInt16LE(2) !== 1) return null
  const count = ico.readUInt16LE(4)
  const frames: Buffer[] = []
  for (let index = 0; index < count; index += 1) {
    const at = 6 + index * 16
    if (at + 16 > ico.length) break
    const size = ico.readUInt32LE(at + 8)
    const offset = ico.readUInt32LE(at + 12)
    if (offset + size > ico.length || size < 8) continue
    const payload = ico.subarray(offset, offset + size)
    // PNG signature: a BMP-stored frame would start with a BITMAPINFOHEADER.
    if (payload[0] === 0x89 && payload[1] === 0x50 && payload[2] === 0x4e && payload[3] === 0x47) {
      frames.push(payload)
    }
  }
  return frames.find((frame) => frame.readUInt32BE(16) === 32)
    ?? frames.find((frame) => frame.readUInt32BE(16) >= 24)
    ?? frames[0]
    ?? null
}

/** Drawn placeholder for a checkout without a built icon. */
function fallbackTrayIcon(): Electron.NativeImage {
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
  return nativeImage.createFromBuffer(buffer, { width: size, height: size })
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
