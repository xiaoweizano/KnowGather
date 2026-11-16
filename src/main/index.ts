import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, protocol } from 'electron'
import { IPC_CHANNELS } from '../shared/api.js'
import { AttachmentStore } from './attachments.js'
import { AtomicDocumentRepository } from './documentRepository.js'
import { registerIpcHandlers } from './ipc.js'
import { createWindowOptions } from './windowConfig.js'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'shizhi-attachment',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

let mainWindow: BrowserWindow | null = null
let hasUnsavedChanges = false
let closeRequested = false
let servicesRegistered = false

async function createWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    return
  }

  registerApplicationServices()
  const appRoot = app.getAppPath()
  mainWindow = new BrowserWindow(createWindowOptions({ platform: process.platform, appRoot }))

  mainWindow.on('closed', () => {
    mainWindow = null
    hasUnsavedChanges = false
    closeRequested = false
  })

  mainWindow.on('close', (event) => {
    if (!hasUnsavedChanges) return
    event.preventDefault()
    if (closeRequested) return
    closeRequested = true
    mainWindow?.webContents.send(IPC_CHANNELS.windowCloseRequested)
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    await mainWindow.loadFile(join(appRoot, 'out/renderer/index.html'))
  }
  mainWindow.show()
}

function registerApplicationServices(): void {
  if (servicesRegistered) return
  servicesRegistered = true

  const userDataPath = app.getPath('userData')
  const repository = new AtomicDocumentRepository(userDataPath)
  const attachments = new AttachmentStore(join(userDataPath, 'attachments'))
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
    setHasUnsavedChanges(value) {
      hasUnsavedChanges = value
      if (!value && closeRequested) {
        closeRequested = false
        queueMicrotask(() => mainWindow?.close())
      }
    },
  })
}

app.whenReady().then(async () => {
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
